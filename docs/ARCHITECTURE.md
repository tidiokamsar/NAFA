# Architecture

Ce document décrit la structure du monorepo NAFA et les décisions techniques qui
la sous-tendent. Il porte sur la **fabrique logicielle**, pas sur le domaine
métier : à ce stade aucun module métier n'est implémenté.

## Vue d'ensemble

```
apps/            interfaces utilisateur et points d'entrée externes
services/        services back-end NestJS, regroupés par couche
packages/        bibliothèques partagées entre apps et services
database/        schéma Prisma, migrations, seed
infrastructure/  conteneurs, orchestration, IaC, observabilité
docs/ tests/ tools/ prompts/
```

### `apps/`

| Dossier              | Contenu                                                              |
| -------------------- | -------------------------------------------------------------------- |
| `web/`               | 11 portails Next.js (executive-center, admin-portal, marketplace, …) |
| `mobile/`            | 4 applications Flutter (super-app, driver, warehouse, inspector)     |
| `ai/`                | copilot, agents autonomes, pipeline RAG                              |
| `whatsapp/`, `ussd/` | canaux d'accès alternatifs                                           |
| `api-portal/`        | portail développeur (documentation d'API publique)                   |

`apps/web/admin-portal` et `apps/mobile/super-app` sont les **applications de
référence** : elles ne contiennent aucune logique métier et servent de modèle.

### `services/`

Les services sont classés par couche, du plus stable au plus volatil :

| Couche          | Rôle                                                                                 |
| --------------- | ------------------------------------------------------------------------------------ |
| `foundation/`   | socle technique : identité, configuration, notifications, documents, workflow, audit |
| `masters/`      | données de référence : acteurs, organisations, produits                              |
| `engines/`      | moteurs de calcul : pricing, matching, scoring                                       |
| `processes/`    | orchestration de processus métier de bout en bout                                    |
| `integrations/` | connecteurs externes : paiement mobile, banques, douanes, partenaires                |

Une couche ne dépend que de couches situées au-dessus d'elle dans ce tableau.
`services/foundation/iam` est le **service de référence** : c'est le patron que
tout nouveau service NestJS copie.

### `packages/`

Bibliothèques partagées. Quatre sont implémentées, chacune répondant à une
question différente :

| Package      | Question à laquelle il répond                                  | Tag              |
| ------------ | -------------------------------------------------------------- | ---------------- |
| `shared`     | « de quoi tout code a besoin » — `Result`, erreurs, pagination | `layer:util`     |
| `foundation` | « ce que le métier NAFA manipule » — modèles et ports          | `layer:domain`   |
| `platform`   | « comment un service NestJS démarre » — config, logs, santé    | `layer:platform` |
| `sdk`        | « comment un client appelle les API »                          | `layer:client`   |

`security` complète `platform` sur le volet chiffrement et secrets. Les autres
(`design-system`, `ui`, `auth`, `workflow`, `notifications`, `documents`,
`maps`, `analytics`, `ai-sdk`) sont des emplacements réservés.

Un package ne dépend jamais d'une app ni d'un service. Cette règle, comme
toutes celles du tableau ci-dessus, est appliquée au lint — voir
[ADR-0004](adr/0004-enforce-architecture-boundaries-with-nx-tags.md).

### Organisation DDD des services

Chaque service NestJS découpe son `src/` en quatre couches, avec une seule
direction de dépendance autorisée :

| Couche            | Rôle                                     | Peut dépendre de                  |
| ----------------- | ---------------------------------------- | --------------------------------- |
| `domain/`         | modèles et ports métier                  | `@nafa/foundation`                |
| `application/`    | cas d'usage                              | `domain/`                         |
| `infrastructure/` | adaptateurs Prisma, JWT, sondes de santé | `domain/`, `@nafa/platform`       |
| `api/`            | contrôleurs, DTO, gardes HTTP            | `application/`, `infrastructure/` |

`api/` est la seule couche autorisée à connaître les deux côtés : c'est la
**racine de composition**, celle qui branche les adaptateurs sur les cas
d'usage. L'inverse est interdit — `application/` ne référence jamais
`infrastructure/`, ce qui oblige les cas d'usage à passer par un port.

`services/foundation/iam` est le service de référence. Ses deux cas d'usage
(`RegisterUserUseCase`, `LoginUserUseCase`) dépendent du port
`IdentityUserRepository` ; l'adaptateur Prisma y est lié dans
`InfrastructureModule` ; `AuthApiModule` injecte l'un dans l'autre.

Détail des décisions : [ADR-0001](adr/0001-ddd-layering-for-services.md),
[ADR-0002](adr/0002-foundation-package-for-business-contracts.md),
[ADR-0003](adr/0003-ports-and-adapters-for-persistence.md).

## Décisions techniques

### Monorepo : pnpm workspaces + Nx (mode _package-based_)

Nx s'ajoute par-dessus les workspaces pnpm sans imposer sa propre structure de
projets : il lit les scripts des `package.json` existants comme des cibles. Un
nouveau projet est donc détecté simplement en ajoutant un `package.json` — pas
de `project.json` ni de génération de configuration.

Nx apporte le graphe de dépendances, le cache de tâches et l'exécution ciblée
(`nx affected`), ce qui garde la CI rapide quand le nombre de projets augmente.

`analyzeLockfile` est désactivé dans `nx.json` : le parseur de lockfile de Nx
échoue sur ce dépôt et cette analyse n'apporte rien ici, le graphe étant déduit
des `package.json`.

### Back-end : NestJS + Prisma 7

NestJS impose une structure modulaire homogène entre services, ce qui compte
davantage que la vitesse brute quand plusieurs équipes travaillent en parallèle.

Prisma 7 introduit deux ruptures qui expliquent la configuration du dépôt :

- un **driver adapter** est obligatoire (`@prisma/adapter-pg` pour PostgreSQL) ;
- l'URL de connexion ne figure plus dans `schema.prisma` mais dans
  `prisma.config.ts`, qui lit le `.env` **unique** situé à la racine du dépôt.

Le schéma est centralisé dans `database/schema/schema.prisma` et le client est
généré dans `services/foundation/iam/src/generated/prisma` (sous `src/` pour que
`rootDir` reste `src` et que la sortie de build demeure `dist/main.js`). Le code
généré est ignoré par Git et régénéré à chaque build via la cible `db:generate`.

### Front-end : Next.js en mode `standalone` (opt-in)

`output: 'standalone'` produit un bundle serveur autonome n'embarquant que les
dépendances réellement utilisées, ce qui garde l'image de production légère. La
sortie reproduit l'arborescence du monorepo, d'où le `CMD` du Dockerfile qui
pointe sur `apps/web/admin-portal/server.js`.

Le mode est conditionné à `NEXT_OUTPUT_STANDALONE=1`, positionné par le
Dockerfile : le bundle contient des liens symboliques que Windows refuse de
copier dans le cache Nx sans le privilège de mode développeur, ce qui ferait
échouer `pnpm build` sur les postes Windows.

**Piège associé** : aucun fichier `.env` ne doit définir `NODE_ENV`. Nx injecte
ces variables dans toutes les tâches ; un `NODE_ENV=development` ferait produire
à `next build` un bundle React de développement, qui plante au prérendu.

### Mobile : Flutter, hors workspace pnpm

Flutter gère ses dépendances via `pubspec.yaml` et ne participe pas au workspace
Node. Les applications mobiles sont donc invisibles pour Nx et se construisent
avec la chaîne Flutter native.

### Messagerie : Kafka et RabbitMQ

Les deux coexistent avec des rôles distincts : Kafka pour le flux d'événements
entre services (audit, projections), RabbitMQ pour les files de tâches
(notifications, traitements différés).

En développement local, l'API Kafka est servie par **Redpanda** : un binaire
unique, sans JVM ni ZooKeeper, qui démarre en quelques secondes. Le code client
est identique face à un cluster Kafka réel en préproduction ou en production.

### Socle partagé : `@nafa/platform`

Les préoccupations transverses ne sont pas dupliquées service par service :
elles vivent dans `packages/platform`, que tout service NestJS importe. Cela
garantit que les logs, les erreurs, les sondes et les métriques ont exactement
le même format partout — condition nécessaire pour agréger 25+ services dans un
même outil d'observabilité.

Le package couvre la configuration typée, le logging, les sondes de santé, le
filtre d'exceptions, Redis (cache et sessions), le rate limiting et
OpenTelemetry. Détail dans [packages/platform](../packages/platform/README.md).

`services/foundation/iam` reste le service de référence : il montre comment
assembler ces briques et n'ajoute que ce qui lui est propre (Prisma, auth).

### Observabilité

Chaque service expose le même contrat :

| Endpoint                   | Rôle                                                     |
| -------------------------- | -------------------------------------------------------- |
| `GET /live`                | vivacité — le processus répond, aucune dépendance testée |
| `GET /ready`               | disponibilité — dépendances joignables, 503 sinon        |
| `GET /health`              | rapport détaillé                                         |
| `GET /metrics` (port 9464) | métriques Prometheus                                     |
| `GET /api/docs`            | documentation OpenAPI 3.1 (Swagger)                      |

La distinction vivacité/disponibilité est délibérée : une base indisponible
doit retirer l'instance du routage (`/ready` en 503) sans provoquer son
redémarrage (`/live` reste vert), sinon les redémarrages en boucle ajoutent de
la charge pendant la panne.

Les métriques sont exposées sur **leur propre port** (9464) par l'exporteur
Prometheus d'OpenTelemetry, et non sur le port applicatif : elles restent
scrapables même quand le routeur de l'application n'écoute pas encore.

Les traces sont produites par l'auto-instrumentation OpenTelemetry et exportées
en OTLP/HTTP quand `OTEL_EXPORTER_OTLP_ENDPOINT` est défini (sinon abandonnées).
Le SDK démarre avant tout autre import — sinon il n'a rien à instrumenter.

Les logs sont du JSON ligne par ligne (`nestjs-pino`). Chaque requête porte un
`x-request-id` et un `x-correlation-id`, renvoyés en en-têtes de réponse,
présents dans chaque ligne de log et dans chaque réponse d'erreur.

### Contrat d'erreur

Toute erreur sortant d'un contrôleur passe par un filtre global et prend la
même forme (`statusCode`, `error`, `message`, `path`, `timestamp`,
`requestId`, `correlationId`). Les 5xx ne divulguent jamais l'interne : le
détail va aux logs, le client reçoit un identifiant à citer.

### Champs d'audit

Toute table porte les mêmes six colonnes : `createdAt`, `updatedAt`,
`createdBy`, `updatedBy`, `deletedAt`, `version`. Prisma n'ayant pas d'héritage
de modèles, elles sont recopiées par modèle — les noms et la sémantique ne
doivent pas varier. La suppression logique (`deletedAt`) est une convention et
non une contrainte : les requêtes doivent filtrer `deletedAt: null`
explicitement.

### Déploiement

`infrastructure/helm/nafa-service` est un chart **générique** paramétré par
`values.yaml` : image, réplicas, ports, ingress, ConfigMap, Secret, sondes,
ressources. Chaque service se déploie avec un fichier de valeurs dédié
(`values-iam.yaml` sert d'exemple) plutôt qu'avec un chart par service.

Les secrets ne sont jamais versionnés : `existingSecret` référence un Secret
créé hors dépôt (sealed-secrets, External Secrets, coffre-fort cloud).

## Flux de données (état actuel)

```
Client web / mobile
        │  HTTP
        ▼
  service NestJS ──── Prisma ────► PostgreSQL
        │
        ├──────────────────────► Redis      (cache, sessions)
        ├──────────────────────► Kafka      (événements)
        ├──────────────────────► RabbitMQ   (tâches)
        └──────────────────────► MinIO      (stockage objet, S3)
```

## Limites connues

- Le seul service implémenté (`iam`) se limite à l'authentification de base :
  inscription, connexion, émission de JWT. Le domaine IAM complet (rôles,
  permissions, multi-organisation) reste à construire.
- Aucun modèle de données métier n'existe : `schema.prisma` ne contient que la
  table technique `users`.
- Le rate limiting utilise le stockage en mémoire par défaut, donc **par
  instance** : les limites sont sous-comptées dès qu'un service tourne en
  plusieurs réplicas. À basculer sur Redis avant de s'y fier en production.
- Aucune garde de rate limiting n'est installée : les limites sont déclarées,
  chaque service décide où les appliquer.
- Aucun collecteur OpenTelemetry n'est déployé : les traces sont produites mais
  abandonnées tant que `OTEL_EXPORTER_OTLP_ENDPOINT` n'est pas défini.
- `infrastructure/terraform/`, `infrastructure/monitoring/` et
  `infrastructure/security/` sont des emplacements réservés, encore vides.
- Le déploiement continu (ArgoCD) n'est pas configuré.
