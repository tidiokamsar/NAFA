# ADR-0003 — Ports et adaptateurs pour la persistance

**Statut** : Acceptée — Sprint 0
**Voir aussi** : [ADR-0001](0001-ddd-layering-for-services.md),
[ADR-0002](0002-foundation-package-for-business-contracts.md)

## Contexte

`AuthService` injectait `UsersService`, un objet de trois méthodes qui
transmettait directement à `PrismaClient` et retournait le type `User` généré
par Prisma. La règle métier connaissait donc la forme exacte des lignes de la
base, colonnes d'audit comprises.

Deux conséquences concrètes, pas théoriques :

1. Les tests de `AuthService` devaient fabriquer des lignes Prisma complètes
   (`createdAt`, `updatedAt`, `createdBy`, `deletedAt`, `version`) pour tester
   une règle qui ne lit que `id`, `email` et `passwordHash`.
2. Toute évolution du schéma se propageait jusqu'à la logique d'inscription,
   qu'elle la concerne ou non.

## Décision

La persistance passe par un **port** défini dans `@nafa/foundation` et un
**adaptateur** vivant dans la couche `infrastructure/` du service.

```ts
// port — @nafa/foundation
export interface IdentityUserRepository {
  findByEmail(email: string): Promise<IdentityUser | null>;
  findById(id: string): Promise<IdentityUser | null>;
  create(email: string, passwordHash: string): Promise<IdentityUser>;
}
export const IDENTITY_USER_REPOSITORY = Symbol('IDENTITY_USER_REPOSITORY');
```

```ts
// adaptateur — services/foundation/iam/src/infrastructure/persistence/prisma/
export class PrismaIdentityUserRepository implements IdentityUserRepository {}
```

La liaison se fait dans `InfrastructureModule` (`useExisting`). Les cas
d'usage injectent le jeton, jamais la classe.

**Le jeton est un `Symbol` co-localisé avec l'interface.** Une chaîne peut
entrer en collision entre modules ; et si chaque service définissait son propre
jeton pour le même port, plus rien ne serait substituable.

**`IdentityUser` n'expose pas les colonnes d'audit.** L'adaptateur retourne un
sur-ensemble structurel, ce qui reste assignable au contrat sans conversion.

**`JwtModule` est enregistré dans `InfrastructureModule`, pas dans `api/`.**
Signer un jeton avec une clé lue en configuration est un adaptateur sortant, au
même titre qu'une connexion à une base. La couche HTTP n'a rien à signer.

## Conséquences

**Ce qu'on gagne.** Les cas d'usage se testent contre un double de trois
méthodes. Remplacer Prisma, ou ajouter un cache devant le dépôt, ne touche
aucun fichier de `application/`.

**Ce qu'on perd.** Chaque injection du port exige un `@Inject(...)` explicite :
NestJS ne peut pas résoudre un `Symbol` par inférence de type comme il le fait
pour une classe. C'est le prix direct du choix du `Symbol`.

**Le risque introduit, et sa parade.** Lier un port à un adaptateur à travers
quatre modules crée des défauts que ni `tsc` ni le build ne voient : une entrée
`exports:` manquante ou un jeton lié dans le mauvais module compile
parfaitement et échoue au démarrage.

`services/foundation/iam/src/app.module.spec.ts` compile le graphe de
dépendances complet avec seulement les deux fournisseurs qui ouvrent des
sockets remplacés (`PrismaService`, `REDIS_CLIENT`), et vérifie que le port
résout bien vers l'adaptateur Prisma. La parade a été validée en retirant
`IDENTITY_USER_REPOSITORY` des exports d'`InfrastructureModule` : les cinq
tests unitaires existants passaient toujours, ceux-ci ont échoué.

**Validation différée.** Les tests de bout en bout couvrent le même terrain
plus le HTTP réel, mais exigent PostgreSQL et Redis. Ils n'ont **pas** été
exécutés pendant ce sprint, le moteur Docker de la machine de développement
étant hors service. Voir
[DEVELOPMENT.md](../DEVELOPMENT.md#tests) pour les commandes exactes à passer
une fois Docker rétabli.
