# @nafa/foundation

Contrats métier partagés de NAFA : modèles de domaine et **ports** que les
services implémentent côté infrastructure.

**Zéro dépendance runtime** — pas de NestJS, pas de Prisma, pas même
`@nafa/platform`. C'est la règle qui donne son sens au package : un port ne
peut pas dépendre de la technique qu'il est censé abstraire.

## Contenu

| Chemin                        | Contenu                                     |
| ----------------------------- | ------------------------------------------- |
| `identity/domain/`            | `IdentityUser` — le modèle métier           |
| `identity/application/ports/` | `IdentityUserRepository`, jeton d'injection |

## `foundation` face à `shared` et `platform`

Les trois packages sont au bas du graphe et ne dépendent d'aucune app ni
d'aucun service, mais ils ne répondent pas à la même question :

| Package      | Question à laquelle il répond                                  |
| ------------ | -------------------------------------------------------------- |
| `shared`     | « de quoi tout code a besoin » — `Result`, erreurs, pagination |
| `platform`   | « comment un service NestJS démarre » — config, logs, santé    |
| `foundation` | « ce que le métier NAFA manipule » — modèles et ports          |

Le critère de tri : si une chose disparaîtrait en changeant de framework, elle
va dans `platform` ; si elle survivrait à un changement de métier, elle va dans
`shared` ; si elle décrit le métier lui-même, elle va ici.

## Ports et adaptateurs

Un port est une interface **plus un jeton d'injection** :

```ts
export interface IdentityUserRepository {
  findByEmail(email: string): Promise<IdentityUser | null>;
  findById(id: string): Promise<IdentityUser | null>;
  create(email: string, passwordHash: string): Promise<IdentityUser>;
}

export const IDENTITY_USER_REPOSITORY = Symbol('IDENTITY_USER_REPOSITORY');
```

L'adaptateur vit dans le service (`services/foundation/iam/src/infrastructure/`)
et se lie au jeton dans son module d'infrastructure. Les cas d'usage ne
connaissent que le port.

## Décisions et leurs raisons

**Le jeton est un `Symbol`, pas une chaîne** — une chaîne peut entrer en
collision entre modules, un `Symbol` non. Le prix à payer est que NestJS ne
peut plus résoudre le port par inférence de type : chaque injection doit
porter un `@Inject(IDENTITY_USER_REPOSITORY)` explicite.

**Le jeton vit à côté de l'interface, pas dans le service** — sinon deux
services qui implémentent le même port inventent deux jetons différents, et
plus rien n'est substituable.

**`IdentityUser` n'expose pas les champs d'audit de la base** (`createdAt`,
`updatedAt`, colonnes de soft-delete). Un cas d'usage qui n'en a pas besoin ne
doit pas se retrouver couplé au schéma de persistance ; l'adaptateur Prisma
retourne un sur-ensemble structurel, ce qui reste assignable au contrat.

**`passwordHash` fait partie du modèle, pas `password`** — le domaine ne
manipule jamais de mot de passe en clair. Le hachage est fait par le cas
d'usage avant d'atteindre le port.

**Le package ne contient aucune implémentation** — s'il en contenait une, elle
finirait par avoir besoin d'une dépendance technique, et la règle « zéro
dépendance runtime » tomberait au premier compromis.

## Limites connues

- **Le seul contexte modélisé est `identity`.** Les autres domaines NAFA
  (référentiels, tarification, logistique) n'ont pas encore de port ici.
- **Aucun test unitaire.** Le package ne contient que des types et un `Symbol` ;
  il n'y a pas de comportement à tester. Ce sont les tests de
  `services/foundation/iam` qui vérifient que le contrat est utilisable.
- **`IdentityUserRepository` n'a pas de méthode de mise à jour ni de
  suppression** — elles seront ajoutées quand un cas d'usage les demandera,
  pas avant.

## Build

```bash
pnpm exec nx run @nafa/foundation:build
```
