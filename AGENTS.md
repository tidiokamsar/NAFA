# AGENTS.md — Contrat de travail des agents sur NAFA

Source unique de vérité pour tout agent de code travaillant sur ce dépôt :
Claude Code, OpenAI Codex, GitHub Copilot, Gemini CLI / Jules, Cursor.
`CLAUDE.md` et `.github/copilot-instructions.md` ne font que pointer ici.

Langue : **français** pour les échanges, la documentation et les descriptions de PR.
**Anglais** pour le code, les identifiants, les messages de commit et les commentaires.

---

## 1. Le dépôt

Monorepo pnpm workspaces + Nx, Node >= 22, TypeScript strict, architecture DDD.

| Zone                                                  | Contenu                                                                                                                                                       |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/*`                                          | 11 portails React + Vite (admin, analytics-center, buyer, enterprise, executive-center, finance, government, logistics, marketplace, producer, warehouse)     |
| `apps/mobile/*`                                       | 4 apps Expo / React Native (driver, inspector, super-app, warehouse)                                                                                          |
| `apps/ai/*`                                           | agents, copilot, rag                                                                                                                                          |
| `apps/whatsapp`, `apps/ussd`, `apps/api-portal`       | canaux d'entrée                                                                                                                                               |
| `services/foundation/iam`                             | socle d'authentification, NestJS                                                                                                                              |
| `services/{engines,integrations,masters,processes}/*` | services métier NestJS                                                                                                                                        |
| `packages/*`                                          | `platform`, `foundation`, `security`, `sdk`, `shared`, `ui`, `design-system`, `auth`, `ai-sdk`, `analytics`, `documents`, `maps`, `notifications`, `workflow` |
| `database/schema/schema.prisma`                       | schéma Prisma unique du monorepo                                                                                                                              |
| `infrastructure/docker/docker-compose.dev.yml`        | stack d'infra locale                                                                                                                                          |

### Couches DDD — sens de dépendance

```
domain  ←  application (dont ports/)  ←  infrastructure  ←  api
```

Une couche ne dépend jamais d'une couche plus externe. **Le domaine n'importe ni NestJS,
ni Prisma, ni Axios, ni aucun package d'infrastructure.** Les frontières sont vérifiées par les
tags Nx — si `nx lint` t'accuse d'une violation de frontière, c'est ton code qui est faux, pas la règle.

---

## 2. Règle d'or du travail en parallèle

> **Un agent = un ticket = un worktree = une branche = un périmètre de fichiers exclusif.**

Deux agents ne modifient jamais le même package en même temps. Si ton ticket t'oblige à toucher
un package que tu ne possèdes pas, tu **t'arrêtes** et tu le signales — tu ne le modifies pas « en passant ».

### Prendre un ticket

1. Lire `docs/PARALLEL-AGENTS.md` : registre des lanes, périmètres, ports, bases.
2. Créer le worktree depuis le tronc à jour :
   ```bash
   git fetch origin
   git worktree add .worktrees/SPR-0007 -b feature/SPR-0007-slug origin/main
   ```
3. Travailler **uniquement** dans `.worktrees/SPR-0007`.
4. Ne jamais faire de `git checkout` dans le worktree d'un autre agent.
5. La racine `F:/NAFA` est le worktree de `main` : elle sert à intégrer, pas à développer.

### Packages partagés — gelés par défaut

`packages/platform`, `packages/foundation`, `packages/security`, `packages/sdk`,
`packages/shared`, `packages/ui`, `packages/design-system` sont **en lecture seule**
sauf si ton ticket les nomme explicitement.

Besoin d'un changement dedans ? → **contract PR** : une PR séparée et minimale qui ne contient
que le changement de contrat (type, port, composant), mergée dans `main` **avant** que les
consommateurs ne l'utilisent. Jamais de contrat modifié à l'intérieur d'une PR de feature.

### Gestionnaire de paquets — pnpm uniquement

`npm install` et `yarn` sont **interdits** dans ce dépôt. Ils produisent un `package-lock.json`
et un `node_modules` à plat qui font résoudre NestJS en plusieurs instances — c'est exactement
le bug corrigé par `fix(deps): dedupe the lockfile so NestJS resolves to one instance`.

- Par défaut : `pnpm install --frozen-lockfile`.
- Ajouter une dépendance = un commit dédié, poussé et mergé vite, annoncé dans la PR.
- Si tu vois un `package-lock.json` apparaître : le supprimer, ne jamais le commiter.

### Migrations Prisma

Schéma unique : `database/schema/schema.prisma`. Une seule migration en vol à la fois sur `main`.
Le nom porte le ticket : `--name spr_0007_add_inspection_table`.
Jamais de `prisma migrate reset` sur une base partagée.

---

## 3. Commandes

```bash
pnpm install --frozen-lockfile
pnpm -w lint
pnpm -w typecheck
pnpm -w test
pnpm -w format:check
pnpm --filter @nafa/<pkg> build

# Ne fais tourner que ce que ton changement affecte
npx nx affected -t lint typecheck test --base=origin/main

# Infra locale (voir docs/PARALLEL-AGENTS.md avant de la démarrer ou de l'arrêter)
docker compose -f infrastructure/docker/docker-compose.dev.yml up -d
```

Avant toute PR, sur le périmètre affecté : `lint` + `typecheck` + `test` doivent passer.
Ne jamais contourner Husky (`--no-verify` interdit).
Ne jamais annoncer un travail terminé sans avoir montré la sortie de la vérification.

---

## 4. Git

- Branches : `feature/SPR-XXXX-slug`, `fix/SPR-XXXX-slug`, `chore/<slug>`.
  Les agents non-Claude préfixent aussi par leur nom si le registre le demande (`codex/...`).
- Commits : **conventional commits**, scope = nom du package.
  `feat(iam): add refresh-token rotation`
- Un commit = une intention. Pas de commit fourre-tout de fin de session.
- Rebase sur `origin/main` avant d'ouvrir la PR. Pas de merge commit dans une branche de feature.
- Jamais de `push --force` sur `main`. Sur ta propre branche : `--force-with-lease` uniquement.
- Pousser sa branche **au moins une fois par jour**. Le dépôt vit sur un disque externe :
  du travail non poussé est du travail qui peut disparaître.

### Description de PR

```markdown
## Ticket

SPR-XXXX

## Périmètre

Packages touchés : …
Contrats partagés touchés : aucun | (lister + lien vers la contract PR)

## Ce qui change

## Vérifications

- [ ] npx nx affected -t lint typecheck test --base=origin/main
- [ ] migration Prisma : aucune | <nom>
- [ ] pnpm-lock.yaml modifié : non | oui (justifier)
```

---

## 5. Sécurité — non négociable

Le socle IAM porte l'authentification de toute la plateforme.

- Aucun secret en dur. Tout passe par la configuration `@nafa/platform`, validée au démarrage.
- Ne jamais logger un token, un mot de passe, un numéro de téléphone complet, une pièce d'identité.
- Toute entrée d'API est validée (DTO + class-validator) avant d'atteindre le domaine.
- Accès aux données via Prisma. Pas de SQL concaténé.
- Toute route nouvelle déclare explicitement son garde d'auth et ses rôles. Rien de public par défaut.
- Ne jamais commiter `.env`, un dump de base, ni un fichier de `database/seed` contenant des données réelles.
- Les identifiants de `docker-compose.dev.yml` sont des valeurs de développement : ils ne doivent
  apparaître dans aucun environnement déployé.

---

## 6. Frontend

- Web : React + Vite + TypeScript, TanStack Query / Router, Tailwind, Recharts pour la dataviz.
- Mobile : Expo / React Native.
- **Tous** les composants réutilisables viennent de `packages/ui` et `packages/design-system`.
  Un composant dupliqué dans un portail est un défaut de PR.
- Pas de `fetch` brut dans un composant : passer par `@nafa/sdk` + TanStack Query.
- Les états `loading` / `empty` / `error` sont obligatoires sur tout écran qui charge des données.
- Accessibilité : cible **WCAG 2.2 AA**. Tout élément interactif est atteignable au clavier,
  a un nom accessible, et un contraste ≥ 4.5:1. Pas de `div` cliquable sans rôle ni gestion clavier.

---

## 7. Ce qu'un agent ne fait jamais sans validation humaine

- Modifier `.github/workflows/`, `infrastructure/terraform/`, `infrastructure/kubernetes/`, `infrastructure/helm/`
- Modifier `pnpm-workspace.yaml`, `nx.json`, `tsconfig.base.json`, la config ESLint racine, les hooks Husky
- Supprimer ou renommer un package existant
- Toucher à une migration `database/migrations/` déjà appliquée
- `git push` sur `main`, merger une PR, publier un package
- `docker compose down -v`, `docker system prune`, `prisma migrate reset`
- Ajouter une dépendance structurante (framework, ORM, state manager) sans décision tracée

En cas de doute : ouvrir une issue, pas un commit.
