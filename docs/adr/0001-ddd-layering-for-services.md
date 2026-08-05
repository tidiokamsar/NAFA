# ADR-0001 — Découpage DDD en quatre couches pour les services

**Statut** : Acceptée — Sprint 0
**Concerne** : tous les services `services/**`, à commencer par
`services/foundation/iam`

## Contexte

Avant ce sprint, `services/foundation/iam` organisait son `src/` par
fonctionnalité technique :

```
src/auth/        contrôleur, service, DTO, stratégie JWT, garde
src/users/       UsersService — trois requêtes Prisma
src/prisma/      PrismaService
src/health/      sonde Postgres
```

Ce découpage tient tant qu'un service reste petit, mais il ne dit rien sur ce
qui a le droit de dépendre de quoi. Concrètement, `AuthService` — la logique
métier de l'inscription et de la connexion — injectait `UsersService`, dont la
signature était celle de Prisma. La règle métier était donc couplée au schéma
de la base : changer une colonne se propageait jusque dans les tests de
`AuthService`, et sa suite de tests devait construire des lignes Prisma
complètes (`createdAt`, `deletedAt`, `version`…) pour tester une règle qui ne
s'intéresse qu'à l'e-mail et au hash.

NAFA prévoit une vingtaine de services sur cinq couches. Fixer maintenant un
patron reproductible coûte un sprint ; le fixer après coup coûte une migration
par service.

## Décision

Chaque service découpe son `src/` en quatre couches :

| Couche            | Contient                        | Peut dépendre de                  |
| ----------------- | ------------------------------- | --------------------------------- |
| `domain/`         | modèles et ports métier         | `@nafa/foundation`                |
| `application/`    | cas d'usage                     | `domain/`                         |
| `infrastructure/` | adaptateurs Prisma, JWT, sondes | `domain/`, `@nafa/platform`       |
| `api/`            | contrôleurs, DTO, gardes        | `application/`, `infrastructure/` |

Un cas d'usage porte **une** opération et expose **une** méthode publique,
`execute`. `RegisterUserUseCase` et `LoginUserUseCase` remplacent l'ancien
`AuthService` qui portait les deux.

`api/` est la racine de composition : la seule couche qui connaît à la fois
les cas d'usage et les adaptateurs qui les satisfont. `application/` ne
référence jamais `infrastructure/`.

Ces règles sont appliquées par ESLint dans
`services/foundation/iam/eslint.config.mjs` (`no-restricted-imports` par
répertoire), pas seulement documentées.

## Conséquences

**Ce qu'on gagne.** La règle métier se teste sans Prisma : les specs des cas
d'usage montent un double du port, pas une ligne de base de données. Le
découpage rend aussi visible ce qui manquait — deux propriétés implicites de
l'ancien code sont désormais explicitement testées : le mot de passe en clair
n'atteint jamais le dépôt, et un e-mail inconnu est indiscernable d'un mot de
passe faux.

**Ce qu'on perd.** Plus de fichiers pour le même comportement : quatre couches
et deux cas d'usage là où il y avait un service. Sur un service de deux routes,
c'est une perte nette en volume de code ; le pari est que le patron se
rentabilise à partir du troisième service.

**Le coût caché.** Répartir un service sur quatre modules NestJS déplace une
classe entière de défauts du compilateur vers le démarrage : une entrée
`exports:` oubliée compile, passe les tests unitaires, et échoue au boot.
C'est ce qui a justifié le test de câblage décrit dans
[ADR-0003](0003-ports-and-adapters-for-persistence.md).

**Ce qui n'est pas décidé ici.** Le découpage vaut pour les services NestJS.
Les apps Next.js et Flutter gardent les conventions de leurs frameworks.
