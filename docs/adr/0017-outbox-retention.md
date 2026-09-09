# ADR-0017 — Rétention de l'Outbox

- **Statut** : Acceptée
- **Date** : 2026-09-09
- **Ticket** : OUT-004
- **Complète** : [ADR-0013](0013-outbox-table-and-transactional-write.md) et
  [ADR-0015](0015-outbox-relay-and-retry-policy.md), qui annoncent toutes deux
  cette dette sans la traiter.

## Contexte

`outbox_events` n'a jamais eu de purge. L'ADR-0013 nomme la dette, l'ADR-0015 la
redate en espérant que ça la rende gênante. Deux ADR l'annoncent, aucune ne
l'écrit : une table qui ne se vide jamais finit par coûter.

Maintenant qu'un transport existe (ADR-0016), les lignes vont enfin passer à
`publishedAt`, et la question devient concrète.

## Décision 1 — on ne purge que ce qui a été publié

C'est la décision qui porte tout le reste, et c'est un refus autant qu'un choix.

Deux populations vivent dans cette table. Les lignes **publiées**, dont
l'événement est parti et vit désormais dans le broker. Et les lignes
**empoisonnées**, qui ont épuisé `maxAttempts` et restent avec
`publishedAt IS NULL` et un `lastError` lisible.

La purge ne touche que les premières. `WHERE "publishedAt" IS NOT NULL` est la
sûreté entière de l'instruction.

Une ligne empoisonnée est **la seule trace d'un événement qui n'est arrivé à
personne**. La supprimer transformerait un échec bruyant et interrogeable en
silence — précisément le mode de défaillance qu'ADR-0008 redoutait, qui s'est
réalisé entre GEO-002 et OUT-001, et contre lequel ADR-0013 a construit sa
contrainte unique. Une ligne empoisonnée n'est pas un déchet à ramasser, c'est
un bug à corriger.

**Ce qu'on perd** : ces lignes s'accumulent sans limite. C'est assumé. Leur
nombre est le signal qui dit qu'il y a un problème, et une table qui grossit
d'événements jamais délivrés doit gêner.

## Décision 2 — sept jours, configurable

Assez long pour enquêter sur un incident en relisant les lignes qui l'ont porté.
Assez court pour borner une table que personne ne regarde.

Un événement publié vit aussi dans le broker, avec sa propre rétention. Cette
copie-ci est une piste d'audit locale, pas le dernier exemplaire.

**Ce qui reste à accorder** : la rétention du broker et celle-ci sont deux
réglages indépendants, et rien ne les vérifie l'un contre l'autre. Si Kafka
garde moins longtemps que sept jours, c'est Kafka qui devient le maillon court.

## Décision 3 — la boucle du relais la déclenche, pas un service à part

La purge tourne au plus une fois par `purgeIntervalMs`, une heure par défaut,
depuis le `tick()` du relais.

Un service dédié aurait demandé quarante lignes de minuterie et de cycle de vie
dupliquées pour un travail horaire. Le relais est déjà la seule chose qui touche
cette table sur un rythme.

Le couplage est aussi juste sur le fond : **rien ne devient purgeable tant que
rien ne publie**. Un service sans transport n'a rien à purger, et il n'importe
pas le module de relais de toute façon.

**Ce qu'on perd** : sans relais qui tourne, pas de purge. C'est cohérent, mais
ça veut dire qu'un déploiement qui publierait autrement — un jour, par un autre
chemin — devrait rapatrier cette responsabilité.

Un échec de purge est journalisé et avalé, sans interrompre le relais. Une
outbox qui publie sans se vider est un problème de disque ; une outbox qui
cesse de publier est une panne.

## Décision 4 — un lot borné, pas un verrou long

`DELETE ... WHERE id IN (SELECT id ... LIMIT $2)`, mille lignes par passe.

Une purge en retard rattrape par tranches au lieu de prendre un verrou unique
sur tout ce qu'elle a à supprimer. La passe suivante arrive une heure plus tard,
ou immédiatement si on baisse l'intervalle.

## Décision 5 — aucune migration

Le ticket en attendait une. Il n'y en a pas besoin.

`@@index([publishedAt, createdAt])` existe sur la table depuis ADR-0013, où il a
été posé pour la requête du relais. La purge filtre sur `publishedAt` et ordonne
dessus : elle utilise le même index. Aucune colonne à ajouter, donc aucun
changement de schéma.

C'est un effet secondaire heureux d'une décision prise pour une autre raison, et
il vaut d'être noté : la règle « une seule migration en vol » ne s'applique pas
à ce lot.

## Non décisions

- **La rétention côté broker.** Distincte, et non vérifiée contre celle-ci.
- **L'archivage des lignes empoisonnées.** Les garder pour toujours est la
  décision d'aujourd'hui, pas une position définitive. Les déplacer vers une
  table d'échecs plutôt que les laisser dans la file est une option, le jour où
  leur volume devient un problème en soi.
- **L'alerte sur leur nombre.** `SELECT count(*) WHERE "publishedAt" IS NULL AND
attempts >= n` est la requête qu'une supervision voudra. Elle ne demande pas
  de code, seulement quelqu'un pour la regarder.
- **La purge des lignes publiées d'un agrégat supprimé.** Rien ne relie l'outbox
  au cycle de vie des agrégats, et rien ne devrait : c'est un journal technique.
