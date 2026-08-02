# Guide de développement

## Prérequis

| Outil               | Version             | Nécessaire pour                 |
| ------------------- | ------------------- | ------------------------------- |
| Node.js             | ≥ 22.14             | tout le code TypeScript         |
| Corepack            | fourni avec Node 22 | activer pnpm                    |
| Docker + Compose v2 | récent              | infrastructure locale et images |
| Flutter SDK         | ≥ 3.5               | uniquement `apps/mobile/`       |

pnpm **ne s'installe pas globalement** : Corepack lit le champ `packageManager`
de `package.json` et active automatiquement la bonne version.

```bash
corepack enable
```

## Installation

```bash
pnpm install
```

```bash
cp .env.example .env
```

Générer un vrai secret JWT et le reporter dans `.env` :

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
```

## Deux façons de travailler

### A — Tout dans Docker

Le plus proche de la production, idéal pour valider un changement de bout en
bout ou pour une première prise en main.

```bash
docker compose -f infrastructure/docker/docker-compose.dev.yml up -d --build
```

Le service `iam-migrate` applique le schéma Prisma puis s'arrête ; `iam` ne
démarre qu'une fois cette étape terminée avec succès.

```bash
docker compose -f infrastructure/docker/docker-compose.dev.yml logs -f iam
```

```bash
docker compose -f infrastructure/docker/docker-compose.dev.yml down
```

Ajouter `-v` à `down` pour supprimer aussi les volumes (remise à zéro complète
des données).

### B — Infrastructure dans Docker, applications en local

Le mode de travail quotidien : rechargement à chaud et débogage direct.

```bash
docker compose -f infrastructure/docker/docker-compose.dev.yml up -d postgres redis redpanda rabbitmq
```

Appliquer le schéma à la base :

```bash
pnpm exec nx run @nafa/iam:db:push
```

Lancer un projet :

```bash
pnpm exec nx run @nafa/iam:dev
```

```bash
pnpm exec nx run @nafa/admin-portal:dev
```

## Commandes Nx

Sur tous les projets :

```bash
pnpm lint && pnpm typecheck && pnpm build && pnpm test
```

Sur un seul projet :

```bash
pnpm exec nx run @nafa/iam:test
```

Uniquement ce qui est impacté par les modifications de la branche :

```bash
pnpm exec nx affected -t lint build test
```

Lister les projets détectés :

```bash
pnpm exec nx show projects
```

Vider le cache Nx quand un résultat semble incohérent :

```bash
pnpm exec nx reset
```

## Base de données

Le schéma est unique et centralisé : `database/schema/schema.prisma`. La
connexion est configurée dans `services/foundation/iam/prisma.config.ts`, qui
lit le `.env` de la racine.

Régénérer le client après modification du schéma :

```bash
pnpm exec nx run @nafa/iam:db:generate
```

Créer une migration versionnée (nécessite une base démarrée) :

```bash
pnpm --filter @nafa/iam exec prisma migrate dev --name description_du_changement
```

Les migrations sont écrites dans `database/migrations/` et doivent être
committées.

Appliquer les migrations existantes sans en créer de nouvelle :

```bash
pnpm --filter @nafa/iam exec prisma migrate deploy
```

Inspecter les données :

```bash
pnpm --filter @nafa/iam exec prisma studio
```

## Tests

Les tests unitaires n'ont besoin d'aucune infrastructure : les dépendances
externes (Prisma, Redis) sont remplacées par des doubles.

```bash
pnpm test
```

Cette suite inclut `services/foundation/iam/src/app.module.spec.ts`, qui
compile le graphe d'injection complet de NestJS avec seulement `PrismaService`
et `REDIS_CLIENT` remplacés. Il attrape les erreurs de câblage — jeton lié dans
le mauvais module, `exports:` oublié — que `tsc` et le build ne voient pas.

Les tests de bout en bout nécessitent PostgreSQL et Redis démarrés :

```bash
docker compose -f infrastructure/docker/docker-compose.dev.yml up -d postgres redis
```

```bash
pnpm exec nx run @nafa/iam:db:push
```

```bash
pnpm exec nx run @nafa/iam:test:e2e
```

Ils sont volontairement exclus de `pnpm test` pour que la suite unitaire reste
exécutable sans infrastructure — en local comme en CI.

> **Validation différée — Sprint 0.** Le refactoring DDD du sprint 0 a été
> livré sans exécution des tests e2e : le moteur Docker de la machine de
> développement était hors service (`docker version` répondait 500 sur
> `dockerDesktopLinuxEngine`). Lint, typecheck, build et tests unitaires sont
> passés à chaque étape, et le test de câblage ci-dessus couvre la principale
> classe de régression restante. Les trois commandes ci-dessus restent à
> passer une fois Docker rétabli, avant toute fusion vers `main` — elles seules
> vérifient le comportement HTTP réel de `POST /auth/register` et
> `POST /auth/login`.

## Ajouter un projet

Voir [CONTRIBUTING.md](../CONTRIBUTING.md#ajouter-un-nouveau-projet). En résumé :
copier le projet de référence correspondant, renommer le package, ajuster le
port. Nx détecte le nouveau projet sans configuration supplémentaire.

## Applications Flutter

Les applications mobiles vivent hors du workspace pnpm.

```bash
cd apps/mobile/super-app
```

```bash
flutter pub get
```

```bash
flutter run --dart-define=API_BASE_URL=http://localhost:3000
```

## Dépannage

**`pnpm install` signale « Ignored build scripts »**
pnpm bloque par défaut les scripts d'installation des dépendances. Les paquets
légitimes sont déjà autorisés dans la section `allowBuilds` de
`pnpm-workspace.yaml` ; ajouter les nouveaux explicitement plutôt que de
désactiver le mécanisme.

**`prisma generate` échoue sur « Cannot resolve environment variable: DATABASE_URL »**
Le `.env` de la racine est absent : `cp .env.example .env`.

**Une commande Nx renvoie un résultat obsolète**
`pnpm exec nx reset`, puis relancer.

**Le conteneur `iam` redémarre en boucle**
Consulter `docker compose ... logs iam`. La cause la plus fréquente est un
`iam-migrate` en échec : la base n'était pas prête ou `DATABASE_URL` est
incorrecte.

**RabbitMQ refuse la connexion depuis l'hôte**
Utiliser les identifiants `nafa` / `nafa_dev_password`, pas le compte `guest` :
celui-ci n'est accepté qu'en boucle locale stricte, ce qui exclut les connexions
arrivant par un port publié par Docker.

**Windows : `pnpm exec next build` ne produit rien sous Git Bash**
Particularité des shims pnpm sous Git Bash. Utiliser PowerShell, ou invoquer le
binaire directement. La CI (Linux) n'est pas concernée.
