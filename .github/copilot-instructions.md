# Instructions Copilot — NAFA

La référence complète est **`AGENTS.md`** à la racine du dépôt. Ce qui suit en est le résumé opérationnel.

## Contexte

Monorepo pnpm + Nx, Node >= 22, TypeScript strict.
Backend NestJS en DDD : `domain` → `application`/`ports` → `infrastructure` → `api`, jamais l'inverse.
Frontend React + Vite + TanStack Query/Router + Tailwind + Recharts ; mobile Expo / React Native.
Données : Prisma + PostgreSQL, schéma unique `database/schema/schema.prisma`.
Messagerie : Redpanda (Kafka API) et RabbitMQ. Cache : Redis. Objets : MinIO. Le tout via `@nafa/platform`.

## Règles de génération

- Les composants UI viennent de `packages/ui` et `packages/design-system`. Ne pas en recréer localement.
- Les appels réseau passent par `@nafa/sdk` + TanStack Query. Pas de `fetch` brut dans un composant.
- Le code du domaine n'importe ni NestJS, ni Prisma, ni Axios.
- Toute entrée d'API est validée par un DTO avant d'atteindre le domaine.
- Aucun secret en dur : configuration via `@nafa/platform`, validée au démarrage.
- Ne jamais logger token, mot de passe, numéro de téléphone complet ou pièce d'identité.
- Accessibilité WCAG 2.2 AA : nom accessible, navigation clavier, contraste ≥ 4.5:1.
- États `loading` / `empty` / `error` obligatoires sur tout écran qui charge des données.

## Gestionnaire de paquets

**pnpm uniquement.** Ne jamais suggérer `npm install` ni `yarn` : un `package-lock.json` fait
résoudre NestJS en plusieurs instances et casse l'injection de dépendances.

## Conventions

- Commits : conventional commits, scope = nom du package — `feat(iam): add refresh-token rotation`.
- Branches : `feature/SPR-XXXX-slug`.
- Code, identifiants et commentaires en anglais ; documentation et PR en français.

## Ne pas modifier

`.github/workflows/`, `infrastructure/terraform/`, `infrastructure/kubernetes/`, `infrastructure/helm/`,
`pnpm-workspace.yaml`, `nx.json`, `tsconfig.base.json`, les hooks Husky, les migrations déjà appliquées.

Les packages partagés (`platform`, `foundation`, `security`, `sdk`, `shared`, `ui`, `design-system`)
sont gelés sauf ticket dédié — procédure de _contract PR_ décrite dans `AGENTS.md`.
