# CLAUDE.md

**Lis `AGENTS.md` à la racine avant toute chose.** Il porte le contrat commun à tous les agents :
architecture DDD, règle d'un-agent-un-périmètre, packages gelés, pnpm uniquement, git, sécurité, frontend.
Ce fichier ne contient que ce qui est propre à Claude Code.

## Vérification de périmètre au démarrage

```bash
git rev-parse --show-toplevel && git branch --show-current
```

Si tu es dans `F:/NAFA` sur `main` : **tu es dans le worktree d'intégration, pas dans un worktree de dev.**
N'écris rien. Demande quel ticket t'est attribué et crée le worktree décrit dans `docs/PARALLEL-AGENTS.md`.

Ton périmètre exclusif est celui de ta lane dans `docs/PARALLEL-AGENTS.md`.
Tout fichier hors de ce périmètre est en lecture seule pour toi.

## Outillage de cette session

- `typescript-lsp` — naviguer par définitions et références. Dans un monorepo de 363 fichiers
  suivis et 14 packages, c'est plus fiable qu'un grep.
- `context7` — vérifier les APIs NestJS, Prisma, Nx, TanStack, Expo **avant** d'écrire.
- `prisma` — schéma unique `database/schema/schema.prisma` et migrations.
- `expo` — build, deploy, upgrade, debug des 4 apps mobile.
- `frontend-design`, `modern-web-guidance`, `figma` — UI, bonnes pratiques web, design tokens.
- `playwright` — E2E et arbre d'accessibilité. Le dépôt n'a aucun test E2E front : c'est un trou connu.
- `redis-development` — usage de Redis via `@nafa/platform`.
- `feature-dev` — pour un ticket qui demande exploration puis conception avant code.
- `pr-review-toolkit` — avant d'ouvrir la PR.
- `security-guidance` — actif sur `services/foundation/iam`, `packages/security`, `packages/auth`.

## Habitudes attendues

- Réponses en français. Code, identifiants et commits en anglais.
- Avant de créer une abstraction partagée : vérifier qu'elle n'existe pas déjà dans
  `packages/shared`, `packages/ui`, `packages/design-system`, `packages/foundation`.
- Après modification : `npx nx affected -t lint typecheck test --base=origin/main`,
  pas la suite complète du monorepo.
- Montrer la sortie de vérification avant de déclarer quoi que ce soit terminé.
- Pousser la branche au moins une fois par jour — le dépôt est sur un disque externe.

## Interdits rappelés

`npm install` / `yarn`, `--no-verify`, `push --force` sur `main`, `docker compose down -v`,
`docker system prune`, `prisma migrate reset`, modification de `.github/workflows/`,
`infrastructure/terraform/`, `nx.json` ou `tsconfig.base.json` sans validation humaine.
