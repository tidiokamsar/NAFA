# Dev parallèle multi-agents — registre et isolation

Complète `AGENTS.md`. Ce fichier se met à jour **à chaque prise de ticket**.
C'est le registre qui empêche deux agents d'écrire au même endroit, sur le même port,
ou dans la même base.

---

## 1. Registre des lanes

Une _lane_ = un agent actif = un worktree + une plage de ports + une base + un index Redis.
Tenir ce tableau à jour est la responsabilité de la personne qui lance l'agent.

| Lane | Agent       | Ticket | Worktree                  | Périmètre exclusif | Ports | Base     | Redis |
| ---- | ----------- | ------ | ------------------------- | ------------------ | ----- | -------- | ----- |
| A    | Claude Code | —      | `.worktrees/…`            | —                  | 40xx  | `nafa_a` | db 1  |
| B    | Codex       | —      | `.worktrees/ai-readiness` | —                  | 41xx  | `nafa_b` | db 2  |
| C    | Copilot     | —      | —                         | —                  | 42xx  | `nafa_c` | db 3  |
| D    | —           | —      | —                         | —                  | 43xx  | `nafa_d` | db 4  |

> Lane libre = cellules vides. **Ne jamais démarrer un agent sans lui attribuer une ligne.**

Worktrees actuellement ouverts (`git worktree list`) :

| Worktree                          | Branche                                                   |
| --------------------------------- | --------------------------------------------------------- |
| `F:/NAFA`                         | `main` — **intégration uniquement, pas de développement** |
| `F:/NAFA/.worktrees/ai-readiness` | `codex/ai-ready-development`                              |
| `F:/NAFA/.worktrees/pr-8`         | `feature/actor-001-domain`                                |

### Règle de recouvrement

Deux lanes ne peuvent pas avoir de périmètres qui se recouvrent, y compris indirectement :
si la lane A modifie `packages/sdk`, aucune autre lane ne consomme une **nouvelle** API du SDK
tant que la contract PR de A n'est pas mergée dans `main`.

---

## 2. Ports

### Déjà pris par le stack Docker — ne jamais réutiliser

| Port         | Service                                    |
| ------------ | ------------------------------------------ |
| 3000         | `iam` conteneurisé (+ Swagger `/api/docs`) |
| 3100         | `admin-portal` conteneurisé                |
| 5432         | PostgreSQL                                 |
| 5672 / 15672 | RabbitMQ / management UI                   |
| 6379         | Redis                                      |
| 8080         | Redpanda Console                           |
| 8081 / 8082  | Schema Registry / HTTP proxy               |
| 9000 / 9001  | MinIO S3 / console                         |
| 9092 / 9644  | Redpanda Kafka API / Admin API             |
| 9464         | Prometheus scrape de `iam`                 |

### Plages par lane — pour les process lancés **hors Docker** (`pnpm dev`)

Chaque lane a une centaine à partir de 4000. Un service garde son offset dans toutes les lanes.

| Offset     | Service                     |
| ---------- | --------------------------- |
| `+00`      | `apps/api-portal` (gateway) |
| `+01`      | `services/foundation/iam`   |
| `+10..+19` | `services/masters/*`        |
| `+20..+29` | `services/processes/*`      |
| `+30..+39` | `services/engines/*`        |
| `+40..+49` | `services/integrations/*`   |
| `+70..+79` | portails web (Vite)         |
| `+80`      | serveur de dev Expo         |
| `+90`      | endpoint métriques          |

Lane A → iam `4001`, premier portail `4070`, métriques `4090`.
Lane B → iam `4101`, premier portail `4170`.

Chaque worktree porte son propre `.env.local` **non versionné** :

```dotenv
PORT_BASE=4000
DATABASE_URL=postgresql://nafa:nafa_dev_password@localhost:5432/nafa_a
REDIS_URL=redis://localhost:6379/1
KAFKA_BROKERS=localhost:9092
KAFKA_TOPIC_PREFIX=a.
RABBITMQ_URL=amqp://nafa:nafa_dev_password@localhost:5672
S3_ENDPOINT=http://localhost:9000
S3_BUCKET=nafa-a
```

---

## 3. Infrastructure Docker — un seul stack partagé

Pas un Postgres par agent : la machine ne suivrait pas. Un seul stack, isolation **logique** par lane.

```bash
docker compose -f infrastructure/docker/docker-compose.dev.yml up -d \
  postgres redis redpanda rabbitmq minio minio-init
```

Ne démarrer les services applicatifs (`iam`, `admin-portal`, `iam-migrate`) que pour une
vérification d'intégration — sinon ils occupent 3000/3100 et rejouent les migrations.

### Créer l'isolation d'une lane

```bash
# base dédiée
docker compose -f infrastructure/docker/docker-compose.dev.yml exec postgres \
  createdb -U nafa nafa_b

# bucket dédié
docker compose -f infrastructure/docker/docker-compose.dev.yml exec minio \
  mc mb --ignore-existing local/nafa-b
```

Redis : index de db distinct par lane (`redis://localhost:6379/2`). L'index 0 reste au stack.
Kafka : préfixe de topic par lane, jamais de topic partagé entre lanes.

### Commandes interdites tant qu'une autre lane est active

```
docker compose ... down -v      # détruit pg_data, redis_data, minio_data de tout le monde
docker system prune             # idem, plus les images
npx prisma migrate reset        # vide la base d'une autre lane
```

Pour repartir propre sur **sa** lane uniquement :

```bash
docker compose -f infrastructure/docker/docker-compose.dev.yml exec postgres \
  psql -U nafa -c 'DROP DATABASE nafa_b' -c 'CREATE DATABASE nafa_b'
```

---

## 4. Ordre de merge

Les PR ne se mergent pas dans l'ordre où elles sont prêtes, mais dans cet ordre :

1. **Contract PR** — `platform`, `foundation`, `security`, `sdk`, `shared`, `ui`, `design-system`
2. **Migrations** — `database/`
3. **Services** — `services/**`
4. **Applications** — `apps/**`

Après chaque merge dans `main`, chaque lane active fait :

```bash
git fetch origin && git rebase origin/main && pnpm install --frozen-lockfile
npx nx affected -t typecheck test --base=origin/main
```

`nx.json` a `defaultBase: "main"` : `main` doit rester le tronc réellement à jour,
sinon `nx affected` considère tout le monorepo comme affecté à chaque commande.

---

## 5. Résolution de conflit entre agents

| Situation                                     | Résolution                                                                      |
| --------------------------------------------- | ------------------------------------------------------------------------------- |
| Deux lanes ont modifié le même fichier        | La lane la plus en aval (`apps` > `services` > `packages`) rebase et réapplique |
| Conflit sur `pnpm-lock.yaml`                  | Jamais à la main : `git checkout origin/main -- pnpm-lock.yaml && pnpm install` |
| Un `package-lock.json` est apparu             | Le supprimer, `rm -rf node_modules`, `pnpm install --frozen-lockfile`           |
| Deux migrations Prisma concurrentes           | La seconde est renommée avec un timestamp postérieur et rejouée sur base neuve  |
| Un agent a touché un package gelé             | La PR est fermée, le changement ré-extrait en contract PR                       |
| Frontière DDD violée signalée par les tags Nx | Corriger le sens de dépendance, ne pas désactiver la règle                      |

---

## 6. Checklist de lancement d'un agent

- [ ] Une ligne lui est attribuée dans le registre § 1
- [ ] `git fetch origin` fait, worktree créé depuis `origin/main` à jour
- [ ] `.env.local` du worktree : bon `PORT_BASE`, bonne `DATABASE_URL`, bon index Redis, bon bucket
- [ ] Base de lane créée, migrations appliquées
- [ ] `pnpm install --frozen-lockfile` passé sans produire de `package-lock.json`
- [ ] Le prompt d'ouverture nomme **explicitement** son périmètre exclusif et lui interdit le reste
- [ ] `AGENTS.md` lisible depuis la racine de son worktree
