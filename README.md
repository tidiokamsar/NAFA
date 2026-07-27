# NAFA — Enterprise Monorepo

Monorepo de la plateforme NAFA : applications web et mobiles, services back-end,
packages partagés, infrastructure et documentation.

Ce dépôt est aujourd'hui une **software factory** : la chaîne d'outillage
(build, lint, tests, conteneurs, CI) est en place et vérifiée, mais **aucun
module métier n'est encore développé**. Deux applications de référence
(`@nafa/iam`, `@nafa/admin-portal`) existent uniquement pour prouver que la
chaîne fonctionne de bout en bout ; les équipes les copient pour démarrer un
nouveau service ou portail.

|                         |                                                        |
| ----------------------- | ------------------------------------------------------ |
| Gestionnaire de paquets | pnpm 11 (via Corepack)                                 |
| Orchestrateur monorepo  | Nx 23                                                  |
| Back-end                | NestJS 11 · TypeScript · Prisma 7 · PostgreSQL · Redis |
| Front-end               | Next.js 16 · React 19 · TypeScript                     |
| Mobile                  | Flutter · Riverpod · GoRouter · Dio · Drift            |
| Messagerie              | Kafka (Redpanda en local) · RabbitMQ                   |
| Infrastructure          | Docker · Kubernetes · Helm · Terraform                 |
| CI                      | GitHub Actions                                         |

## Démarrage rapide

Prérequis : **Node.js ≥ 22.14**, **Docker** (avec Compose v2), et Corepack activé.

```bash
corepack enable
```

```bash
pnpm install
```

```bash
cp .env.example .env
```

Lancer toute la pile (bases de données, brokers, API et portail web) :

```bash
docker compose -f infrastructure/docker/docker-compose.dev.yml up -d --build
```

| Service              | URL                            |
| -------------------- | ------------------------------ |
| API IAM (Swagger)    | http://localhost:3000/api/docs |
| API IAM — liveness   | http://localhost:3000/live     |
| API IAM — readiness  | http://localhost:3000/ready    |
| API IAM — santé      | http://localhost:3000/health   |
| Métriques Prometheus | http://localhost:9464/metrics  |
| Admin Portal         | http://localhost:3100          |
| Redpanda Console     | http://localhost:8080          |
| RabbitMQ Management  | http://localhost:15672         |
| MinIO Console        | http://localhost:9001          |
| PostgreSQL           | `localhost:5432`               |
| Redis                | `localhost:6379`               |

Pour développer sans conteneuriser les applications, ne démarrer que
l'infrastructure puis lancer les apps en local — voir
[DEVELOPMENT.md](docs/DEVELOPMENT.md).

## Commandes

Toutes les tâches passent par Nx et s'exécutent sur l'ensemble des projets :

```bash
pnpm build
```

```bash
pnpm lint
```

```bash
pnpm typecheck
```

```bash
pnpm test
```

Cibler un seul projet :

```bash
pnpm exec nx run @nafa/iam:build
```

## Structure

```
NAFA/
├── apps/
│   ├── web/            # portails Next.js (admin-portal = référence)
│   ├── mobile/         # applications Flutter (super-app = référence)
│   ├── ai/             # copilot, agents, rag
│   ├── whatsapp/ ussd/ api-portal/
├── services/
│   ├── foundation/     # socle technique (iam = service de référence)
│   ├── masters/        # référentiels
│   ├── engines/        # moteurs de calcul
│   ├── processes/      # orchestration de processus
│   └── integrations/   # connecteurs externes
├── packages/
│   ├── platform/       # socle NestJS partagé (config, logs, santé, erreurs, cache, télémétrie)
│   └── ...             # design-system, ui, auth, workflow, ...
├── database/           # schéma Prisma, migrations, seed, scripts
├── infrastructure/     # docker, kubernetes, helm, terraform, monitoring, security
├── docs/               # documentation projet
├── prompts/            # prompts des fonctionnalités IA
├── tests/              # tests transverses
└── tools/              # outillage interne
```

Chaque dossier contient un `README.md` décrivant son rôle.

## Documentation

- [ARCHITECTURE.md](docs/ARCHITECTURE.md) — structure du monorepo et choix techniques
- [DEVELOPMENT.md](docs/DEVELOPMENT.md) — installation, workflows, dépannage
- [packages/platform](packages/platform/README.md) — socle technique partagé
- [CONTRIBUTING.md](CONTRIBUTING.md) — conventions de branches, commits et revue
