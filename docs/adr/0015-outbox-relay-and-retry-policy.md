# ADR-0015 — Relais d'Outbox et politique de reprise

- **Statut** : Acceptée
- **Date** : 2026-09-08
- **Ticket** : OUT-002
- **Complète** : [ADR-0013](0013-outbox-table-and-transactional-write.md), dont
  elle tranche trois des quatre non décisions.

## Contexte

ADR-0013 a livré la table `outbox_events` et l'écriture transactionnelle, et a
listé ce qu'elle ne décidait pas : « le relais, la politique de reprise, le
port de transport », plus la rétention et l'ordre.

Depuis, les lignes s'accumulent avec `publishedAt IS NULL`. C'est l'état que
l'ADR-0013 qualifie de correct et interrogeable, pas de panne — mais c'est un
état qui ne se termine jamais tout seul.

Cette ADR décide le relais, la reprise et l'endroit où le tout vit. Elle ne
décide toujours pas le transport, et explique pourquoi ce n'est pas un oubli.

## Décision 1 — le relais est un module de `@nafa/platform`, pas un service

`services/processes/` existe et est vide. Y créer une application Nest dédiée
aurait demandé un scaffolding complet, un Dockerfile, une entrée compose et une
place en CI. Surtout, le README de ce dossier le destine à l'orchestration de
processus métier — workflows, approbations. Un relais d'Outbox n'est pas un
processus métier, c'est de la plomberie.

Le relais vit donc dans `packages/platform/src/outbox`, à côté de
`appendToOutbox`, et chaque service qui en a besoin l'importe.

**Ce que ça achète** : `FOR UPDATE SKIP LOCKED` cesse d'être décoratif. Quatre
Masters interrogeant la même table en même temps prennent chacun des lignes que
les autres ne tiennent pas, au lieu de faire la queue derrière leurs verrous.

**Ce qu'on perd** : le relais n'a pas de cycle de vie propre. Il s'arrête avec
le service qui l'héberge, et sa supervision est celle de son hôte.

## Décision 2 — le port existe déjà, on ne le réinvente pas

`@nafa/shared` déclare `DomainEventPublisher`, classe abstraite avec `publish`
et `publishAll`. Elle n'avait **aucun usage** dans le dépôt : elle attendait ce
ticket depuis ADR-0008.

Écrire un `OutboxPublisher` à côté aurait produit deux ports pour une seule
question, ce que `AGENTS.md` §« packages partagés » interdit explicitement.
Le relais dépend donc de `DomainEventPublisher`.

## Décision 3 — aucun adaptateur de transport n'est livré

C'est la décision la moins évidente, et c'est un refus délibéré.

ADR-0013 réserve le choix du transport au moment où un consommateur existera.
Aucun n'existe. Livrer un adaptateur Redis maintenant trancherait cette
question par la bande, alors qu'ADR-0008 tient à garder les Engines
indépendants du transport.

Livrer un adaptateur de journalisation serait pire : il marquerait
`publishedAt` sur des lignes remises à personne. La seule colonne honnête de la
table deviendrait un mensonge, et l'événement serait perdu pour de bon puisque
plus rien ne le réclamerait.

`OutboxRelayModule.forRoot()` exige donc un `DomainEventPublisher` et échoue au
démarrage sans lui. Un service qui n'a nulle part où publier n'importe pas le
module — et ses lignes continuent de s'accumuler, ce qui reste l'état correct.

**Conséquence à assumer** : le relais est livré inerte. Le câbler dans les
quatre Masters n'a aucun sens tant qu'aucun transport n'existe, donc ce câblage
n'est pas dans ce lot. C'est le sujet du ticket qui décidera le transport.

## Décision 4 — réclamer et publier partagent une transaction

Le lot est réclamé par `SELECT … FOR UPDATE SKIP LOCKED`, publié, puis marqué,
le tout dans une seule transaction. Les verrous de ligne sont donc tenus
pendant l'appel au transport.

C'est un compromis, pas une inattention. L'alternative — valider la réclamation,
publier, valider à nouveau — demande une colonne de bail que le schéma n'a pas,
et abandonne des lignes réclamées mais jamais publiées chaque fois qu'un relais
meurt entre les deux validations. Le lot est borné pour que la fenêtre le soit
aussi.

La remise est **au moins une fois**. Une publication réussie suivie d'une
validation échouée republiera : c'est précisément pourquoi ADR-0008 impose aux
consommateurs d'être idempotents sur `eventId`.

## Décision 5 — un échec de publication valide son compteur

Quand le transport lève, l'erreur est **avalée**, `attempts` est incrémenté,
`lastError` est écrit, et la transaction valide normalement.

Relancer l'exception annulerait la transaction et emporterait le compteur avec
elle. La ligne reviendrait intacte, et le même échec se répéterait
indéfiniment. Valider l'échec est ce qui donne un sens à `maxAttempts` : une
ligne empoisonnée cesse d'être réclamée, reste dans la table, et son
`lastError` est lisible.

## Décision 6 — la boucle se replanifie, sans `@nestjs/schedule`

La dépendance n'est pas dans le dépôt, et une expression cron serait de toute
façon la mauvaise forme. La boucle se replanifie depuis la **fin** de chaque
passe, donc un transport lent ne peut jamais empiler deux passes comme le
ferait un intervalle fixe. Un lot plein enchaîne immédiatement, un lot partiel
attend `pollIntervalMs`.

Le minuteur est `unref`'d : le relais ne maintient jamais le processus en vie
pour son propre compte.

## Non décisions

- **Le transport.** Toujours ouvert, et maintenant c'est le seul obstacle entre
  ce relais et son utilité. Voir décision 3.
- **La rétention.** Toujours aucune purge. La dette d'ADR-0013 est datée une
  seconde fois ici, ce qui devrait suffire à la rendre gênante.
- **L'ordre de publication.** `ORDER BY "createdAt"` est un ordre de
  réclamation, pas une garantie de remise : deux relais concurrents publient en
  parallèle. `version` reste le seul outil offert au consommateur pour détecter
  un trou.
- **Les métriques.** Le relais journalise ses échecs et rien d'autre. Le nombre
  de lignes en attente et l'âge de la plus vieille sont les deux valeurs qu'une
  supervision voudra ; elles se calculent en SQL et n'ont pas besoin du relais
  pour exister.
