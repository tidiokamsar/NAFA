# ADR-0018 — Trois réserves de la revue Outbox

- **Statut** : Acceptée
- **Date** : 2026-09-09
- **Ticket** : OUT-005
- **Complète** : [ADR-0013](0013-outbox-table-and-transactional-write.md), dont
  la revue de la PR #26 a relevé trois points restés sans réponse.

## Contexte

La PR #26 a été mergée avec trois réserves de revue non traitées. Aucune n'était
bloquante, les trois étaient réelles, et la deuxième est une contradiction
interne à l'ADR-0013. Cette ADR les traite : deux par une décision, une par un
refus argumenté.

## Décision 1 — le drain avant transaction est documenté, pas empêché

`pullEvents()` vide le tampon **avant** l'ouverture du `$transaction`. Si la
transaction échoue, les événements ont disparu de l'agrégat alors que sa ligne
n'a jamais été écrite.

Rien n'est perdu en silence : l'appelant reçoit l'exception. Mais **l'instance
d'agrégat devient inutilisable**, et c'est ce que personne n'avait écrit. Un
`save` retenté sur la même instance écrirait la ligne sans aucun événement,
cette fois en silence.

**Pourquoi on n'empêche pas.** Il faudrait rendre les événements à l'agrégat en
cas d'échec, donc lui donner une méthode de restauration. ADR-0008 a
explicitement refusé d'exposer le tampon : « publier deux fois est pire que ne
pas publier, et un accesseur invite exactement à ça. » Ajouter une porte de
sortie rouvrirait ce risque pour couvrir un chemin d'erreur, ce qui est un
mauvais échange.

Drainer à l'intérieur de la transaction ne résout rien non plus : le callback
peut être rejoué, et le tampon serait vidé à la première passe.

Les six dépôts portent donc la conséquence en commentaire, à l'endroit exact où
le drain se produit. La règle est courte : après un `save` échoué, on recharge
l'agrégat, on ne le réenregistre pas.

## Décision 2 — la contradiction sur la clé primaire est enregistrée, pas résolue ici

`outbox_events.aggregateId`, `correlationId` et `causationId` sont en `TEXT` au
motif, écrit dans l'ADR-0013 §4, que « `DomainEvent` les type `string` sans
garantie de format ».

`eventId` est typé de la même façon, et `DomainEventInput.eventId` est
fournissable par l'appelant. Pourtant la colonne `id` est en `@db.Uuid`. Le même
argument aurait dû produire la même colonne.

Le défaut est **latent**, pas actif. Les événements sont construits avec
`ids.generate()`, typé `Uuid`, ou avec `crypto.randomUUID()` par défaut. Mais
`SequentialIdGenerator` retombe sur `id-${n}` avec un `as Uuid` qui ment au
typage, et il ne sert qu'en test de domaine, où rien ne touche Postgres.

**Pourquoi ce ticket ne tranche pas.** Les deux résolutions sortent de son
périmètre exclusif, qui est `packages/platform/src/outbox` et les dépôts Prisma
des Masters :

- Passer la colonne en `TEXT` est une migration, donc `database/schema` et
  `database/migrations`.
- Resserrer le typage veut dire corriger `SequentialIdGenerator` dans
  `packages/shared`, paquet gelé, donc une contract PR.

Corriger en douce hors périmètre aurait été plus rapide et moins honnête. La
recommandation, pour le ticket qui s'en chargera : **passer la colonne en
`TEXT`**, parce que c'est la résolution qui respecte l'argument déjà écrit dans
l'ADR-0013 plutôt que de l'amender après coup, et parce qu'un journal technique
ne doit pas rejeter un événement pour une forme que le domaine n'a jamais
promise.

## Décision 3 — la sonde de drain balaie tous les services

`outbox-drain.spec.ts` ne lisait que `services/masters`. Le dépôt d'IAM lui
était invisible, et le premier Process ou Engine à en gagner un le serait aussi.

L'élargissement naïf était un piège : IAM ne draine pas, légitimement, parce que
ses agrégats n'émettent aucun événement de domaine. Balayer tout en gardant la
même assertion l'aurait fait échouer pour une raison fausse.

Les assertions sont donc scindées :

- **Tout dépôt des Masters doit drainer.** La règle d'origine, inchangée.
- **Tout dépôt qui draine, où qu'il soit, doit le faire correctement** — dans
  une transaction, avec `appendToOutbox`. C'est l'acte de drainer qui déclenche
  le contrôle, pas la simple existence d'un dépôt.
- **Un dépôt qui ne draine pas n'est pas présumé cassé**, sauf s'il est dans les
  Masters.

Le jour où IAM émet des événements de domaine, la sonde commence à l'assertir
au moment exact où il appelle `pullEvents`, ce qui est le bon déclencheur.

Vérifié par régression : retirer `appendToOutbox` d'un dépôt fait échouer deux
assertions et nomme le fichier.

## Non décisions

- **La correction de la clé primaire**, voir décision 2. Elle appartient à un
  ticket qui a `database/` ou `packages/shared` dans son périmètre.
- **Un test qui prouverait qu'un agrégat rechargé après un `save` échoué se
  comporte bien.** Il demanderait une base réelle et un échec de transaction
  provoqué ; c'est un e2e, pas un test unitaire.
