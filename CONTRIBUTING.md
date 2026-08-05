# Contribuer à NAFA

## Prérequis

- Node.js ≥ 22.14 (Corepack activé : `corepack enable`)
- Docker avec Compose v2
- Flutter SDK ≥ 3.5 (uniquement pour `apps/mobile/`)

L'installation détaillée est décrite dans [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

## Branches

`main` est protégée : aucune écriture directe, tout passe par une pull request.

| Préfixe     | Usage                                           |
| ----------- | ----------------------------------------------- |
| `feature/`  | nouvelle fonctionnalité                         |
| `fix/`      | correction de bug                               |
| `chore/`    | outillage, dépendances, tâches techniques       |
| `docs/`     | documentation seule                             |
| `refactor/` | restructuration sans changement de comportement |

Exemple : `feature/iam-refresh-token`.

## Commits

Le dépôt applique la convention [Conventional Commits](https://www.conventionalcommits.org/),
vérifiée automatiquement par le hook Husky `commit-msg`.

```
<type>(<scope>): <description à l'impératif>
```

Types acceptés : `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `perf`,
`build`, `ci`, `revert`, `style`.

Scopes usuels : `iam`, `web`, `mobile`, `ai`, `services`, `packages`,
`database`, `infra`, `docker`, `k8s`, `helm`, `ci`, `docs`, `tools`, `deps`,
`repo`.

Exemples :

```
feat(iam): add refresh token endpoint
fix(web): correct locale fallback on the admin portal
chore(deps): bump prisma to 7.9.1
```

Un commit qui introduit une rupture ajoute `!` après le scope et une section
`BREAKING CHANGE:` dans le corps.

## Hooks Git

Installés automatiquement par `pnpm install` (script `prepare`).

| Hook         | Action                                            |
| ------------ | ------------------------------------------------- |
| `pre-commit` | `lint-staged` — Prettier sur les fichiers indexés |
| `commit-msg` | `commitlint` — validation du message              |

Ne jamais contourner un hook avec `--no-verify` : si un hook échoue, corriger la
cause. Une exception ponctuelle doit être justifiée dans la pull request.

## Avant d'ouvrir une pull request

```bash
pnpm lint && pnpm typecheck && pnpm build && pnpm test
```

La CI rejoue ces étapes, plus les tests d'intégration contre une vraie base
PostgreSQL et un vrai Redis, et valide le chart Helm et les manifestes
Kubernetes.

## Pull requests

- Une PR = un sujet. Si la description a besoin d'un « et aussi », la découper.
- Titre au format Conventional Commits (il devient le message de merge).
- Décrire **le pourquoi**, pas seulement le quoi.
- Lister ce qui a été vérifié et comment.
- Signaler explicitement ce qui n'a **pas** été vérifié.
- La CI doit être verte et au moins une revue approuvée avant merge.

## Ajouter un nouveau projet

Le monorepo fonctionne en mode _package-based_ : Nx détecte automatiquement tout
dossier contenant un `package.json` couvert par les globs de
`pnpm-workspace.yaml`. Aucune déclaration supplémentaire n'est requise.

- **Nouveau service NestJS** — copier `services/foundation/iam`, renommer le
  package (`@nafa/<nom>`), ajuster le port et supprimer les modules inutiles.
- **Nouveau portail Next.js** — copier `apps/web/admin-portal`, renommer et
  changer le port.
- **Nouvelle app Flutter** — copier `apps/mobile/super-app` (hors workspace
  pnpm : Flutter gère ses dépendances via `pubspec.yaml`).

Les scripts `build`, `lint`, `typecheck` et `test` de chaque `package.json` sont
le contrat attendu par Nx et par la CI : les conserver tous les quatre.

## Sécurité

Ne jamais committer de secret. `.env` est ignoré par Git ; seules les valeurs
d'exemple de `.env.example` sont versionnées. Les identifiants présents dans
`infrastructure/docker/docker-compose.dev.yml` sont réservés au développement
local et ne doivent jamais être réutilisés ailleurs.

Une faille de sécurité se signale en privé aux mainteneurs, pas via une issue
publique.
