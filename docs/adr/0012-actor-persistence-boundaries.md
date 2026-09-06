# ADR-0012 — Frontières de persistance du Master Actor

- **Statut** : Acceptée
- **Date** : 2026-09-06
- **Ticket** : ACTOR-002
- **Remplace** : rien. Complète [ADR-0006](0006-actor-and-cooperative-membership-boundaries.md),
  [ADR-0007](0007-actor-regulatory-boundaries.md) et [ADR-0011](0011-trade-master-boundaries.md) §3.

## Contexte

Le domaine Actor existe depuis ACTOR-001 : deux agrégats, trois ports, aucun
adaptateur. Le Master Trade a livré sa persistance en laissant `SELLER_REGISTRY`
délibérément non lié, faute de table `actors` — une offre ne pouvait donc pas
être créée de bout en bout, et l'invariant 2 était déclaré sans être appliqué.

Trois questions restaient ouvertes, et ce sont les trois seules que cette ADR
tranche : quelle forme physique donner à un agrégat dont l'identité a trois
variantes, comment répondre à des questions d'unicité qu'aucun agrégat ne peut
poser sur lui-même, et qui interroge le registre des acteurs depuis un autre
Master.

## Décision 1 — un service séparé, pas une extension d'IAM

Le domaine Actor vit dans `packages/foundation`, dont le service est
`@nafa/iam`. Les adaptateurs vont pourtant dans un service neuf,
`services/masters/actor`, tagué `scope:actor-service layer:service`.

IAM authentifie des comptes ; ACTOR gère des acteurs économiques. La table
`users` et la table `actors` ne partagent ni cycle de vie, ni public, ni
raison de changer — une personne peut avoir un compte sans être un acteur,
être un acteur sans compte, ou les deux. Les fondre aurait fait de
`scope:foundation` un scope à trois projets hétérogènes, ce que
`tools/eslint/module-boundaries.mjs` signale déjà comme un compromis subi.

**Ce qu'on perd** : un quatrième service à démarrer, configurer et observer,
pour deux tables.

## Décision 2 — JSON pour l'agrégat, colonnes projetées pour les recherches

`identity`, `address`, `contacts` et `roles` sont des colonnes `JSONB`. Ces
valeurs sont dans la frontière transactionnelle de l'agrégat : elles ne sont
jamais lues ni écrites sans l'acteur auquel elles appartiennent, et les
normaliser en tables filles aurait imposé quatre jointures à chaque chargement
pour des collections de quelques éléments.

L'exception est ce qui doit être **cherché**. `ActorRepository` pose trois
questions qu'aucun agrégat ne peut trancher sur lui-même — qui détient ce
RCCM, ce NIF, ce numéro de téléphone. Ces trois valeurs sont donc aussi
stockées en colonnes indexées :

| Colonne        | Source                              | Index    | Pourquoi                                    |
| -------------- | ----------------------------------- | -------- | ------------------------------------------- |
| `rccm`         | `identity.rccm`, société uniquement | `UNIQUE` | garde-fou derrière `ActorUniquenessChecker` |
| `nif`          | `identity.nif`, les trois natures   | `UNIQUE` | idem ; `NULL` pour une personne sans NIF    |
| `phoneNumbers` | canaux `PHONE` de `contacts`        | `GIN`    | test d'appartenance, pas d'égalité          |

Ce sont des **projections** : calculées par le mapper à chaque écriture,
jamais relues au chargement. Le JSON reste la source de vérité, et une
divergence entre les deux serait un bug du mapper, pas un état que l'agrégat
peut atteindre. `actor.mapper.spec.ts` verrouille cette propriété.

Trois précisions que la table impose de nommer :

- Le numéro RSCoop d'une coopérative **n'est pas** projeté dans `rccm`. Deux
  registres différents dans une même colonne rendraient `findByRccm`
  ambigu. Conséquence assumée : une coopérative n'a pas de garde-fou
  d'unicité en base sur son numéro d'immatriculation.
- `phoneNumbers` est un tableau et non une colonne unique. Partager un
  combiné est ordinaire sur ces marchés : le port renvoie une liste, et en
  faire une contrainte d'unicité aurait interdit une situation légitime.
- `nature` est écrite à l'insertion et jamais mise à jour. Une personne ne
  devient pas une société ; l'absence de cette colonne dans le `UPDATE` est
  l'énoncé de cette règle au niveau du stockage.

**Ce qu'on perd** : on ne peut pas interroger l'intérieur du JSON avec un
index sans en ajouter un d'expression. Toute nouvelle question d'unicité
coûtera une colonne et une migration.

## Décision 3 — la version stockée est celle de l'agrégat

`save` écrit `version: row.version`, la valeur que l'agrégat porte, et non
`version: { increment: 1 }`.

Un agrégat peut appliquer plusieurs mutations avant un seul enregistrement —
vérifier, accorder un rôle, activer — et sa version avance d'un cran par
événement. Incrémenter de un aurait stocké 3 là où l'agrégat compte 5, et le
chargement suivant aurait rendu à un cas d'usage une version que le domaine
n'a jamais produite. La garde d'optimistic concurrency ne change pas : elle
est dans la clause `WHERE ... version = expectedVersion`.

> **Écart connu** : `PrismaOfferRepository` (TRA-002) utilise toujours
> `increment: 1`. Le défaut y est latent — sa suite e2e recharge entre les
> écritures, sauf dans un cas qui n'assertit pas la version. Hors périmètre
> d'ACTOR-002, à traiter séparément.

## Décision 4 — le Master Trade lit la table `actors` directement

`SELLER_REGISTRY` est lié dans `services/masters/trade`, par un
`PrismaSellerRegistry` qui lit `actors` avec le client généré de Trade —
exactement comme `PrismaProductCatalog` lit `products`. Un schéma, une base.

C'est le port, et non la base, qui porte la frontière : `offers.sellerId` reste
un UUID sans clé étrangère (ADR-0011 §3). Le jour où les acteurs vivront
derrière une frontière de service, cet adaptateur est le seul fichier qui
change.

`isActive` ne répond que `ACTIVE`. `DRAFT` et `PENDING_VERIFICATION` n'ont pas
été contrôlés, `SUSPENDED` est écarté, `CLOSED` est terminal, et une ligne en
suppression logique n'est pas un acteur.

**Ce qu'on perd** : ACTOR-002 touche un service qui n'est pas le sien. C'est
le prix d'un port dont l'implémentation appartient au consommateur.

## Décision 5 — aucune clé étrangère, y compris à l'intérieur du Master

`cooperative_memberships.cooperativeId` et `memberId` pointent vers `actors`,
la même base, le même Master — et ne portent pourtant aucune clé étrangère.

`CooperativeMembership` est un agrégat distinct qui détient des `ActorId` et
jamais des `Actor` (ADR-0006). C'est ce qui permet aux deux de se charger et
de se versionner indépendamment ; une contrainte référentielle réintroduirait
en base le couplage que la modélisation a écarté.

La vraie règle — au plus une adhésion `ACTIVE` par paire — n'est pas
exprimable comme index unique en PostgreSQL, la condition étant partielle.
Elle vit dans le domaine, et `findActiveBetween` est la question que le
domaine pose.

## Non décisions

Ce qu'ACTOR-002 n'a délibérément pas tranché :

- **Aucune API HTTP.** Aucun des quatre Masters n'en a. Le jour où l'un en
  aura une, la question se posera pour tous ensemble.
- **Aucune table Outbox.** ADR-0008 documente que rien n'oblige un adaptateur
  à appeler `pullEvents()` : le trou reste ouvert, et il concerne les quatre
  Masters, pas seulement Actor.
- **Aucune donnée de référence.** Pas de seed d'acteurs, contrairement aux 47
  zones et 26 produits : un acteur est une donnée d'exploitation, pas un
  référentiel.
- **Aucune habilitation réglementaire.** Code douane, agrément BCRG et le
  reste restent reportés au Compliance Master (ADR-0007).
