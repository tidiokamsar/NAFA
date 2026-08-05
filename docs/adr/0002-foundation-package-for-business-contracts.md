# ADR-0002 — `@nafa/foundation` pour les contrats métier partagés

**Statut** : Acceptée — Sprint 0
**Remplace** : rien
**Voir aussi** : [ADR-0001](0001-ddd-layering-for-services.md)

## Contexte

Le monorepo avait déjà deux bibliothèques en bas du graphe de dépendances :

- `@nafa/shared` — primitives sans dépendance : `Result`, hiérarchie d'erreurs,
  pagination, contrats de réponse, événements ;
- `@nafa/platform` — le socle NestJS : configuration, journalisation, santé,
  Redis, télémétrie.

Aucune des deux n'est le bon endroit pour un modèle métier. `shared` survivrait
à un changement complet de métier ; `platform` disparaîtrait en changeant de
framework. `IdentityUser` ne rentre dans ni l'un ni l'autre.

Sans troisième emplacement, deux services qui manipulent le même concept
métier en écrivent chacun leur version, et les deux divergent — c'est déjà ce
qui allait arriver entre IAM et les futurs services `masters/`.

## Décision

Créer `packages/foundation` (`@nafa/foundation`), qui porte les **modèles de
domaine** et les **ports** partagés entre services.

Règle absolue : **zéro dépendance runtime**. Pas NestJS, pas Prisma, pas
`@nafa/platform`, pas même `@nafa/shared`. Un port qui dépendrait de la
technologie qu'il abstrait n'abstrairait rien.

Le critère de tri entre les trois packages :

| Si la chose…                            | elle va dans |
| --------------------------------------- | ------------ |
| disparaîtrait en changeant de framework | `platform`   |
| survivrait à un changement de métier    | `shared`     |
| décrit le métier lui-même               | `foundation` |

Le premier contexte livré est `identity` : `IdentityUser` et
`IdentityUserRepository`.

## Conséquences

**Ce qu'on gagne.** Le contrat existe une fois. Quand un deuxième service aura
besoin de lire un utilisateur, il implémentera le même port au lieu d'inventer
le sien.

**Ce qu'on perd.** Un package de plus à construire avant IAM, donc une étape
supplémentaire dans le Dockerfile et dans la chaîne de build Nx.

**Une indirection assumée.** `services/foundation/iam/src/domain/` ne contient
que des ré-exports de `@nafa/foundation`. Ça peut sembler inutile, mais ça
permet aux couches internes d'importer `../../domain` sans savoir si le
contrat est local au service ou partagé — et donc de promouvoir un contrat de
l'un vers l'autre sans toucher aux cas d'usage. Le prix est un fichier de
ré-export par contrat ; on l'abandonnera si le rapport s'inverse.

**Ce qui reste ouvert.** `IdentityUserRepository` n'a ni mise à jour ni
suppression : elles seront ajoutées quand un cas d'usage les demandera. Un
port dont la moitié des méthodes n'a aucun appelant est une conjecture, pas un
contrat.

**Ce qu'on ne fait pas.** Aucun contrat générique `UseCase<In, Out>` n'est
introduit. Deux cas d'usage ne suffisent pas à connaître la bonne forme d'une
telle abstraction.
