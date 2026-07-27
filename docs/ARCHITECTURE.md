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

Bibliothèques partagées (`design-system`, `ui`, `auth`, `workflow`,
`notifications`, `documents`, `maps`, `analytics`, `ai-sdk`, `shared`). Un
package ne dépend jamais d'une app ni d'un service.

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

### Front-end : Next.js en mode `standalone`

`output: 'standalone'` produit un bundle serveur autonome n'embarquant que les
dépendances réellement utilisées, ce qui garde l'image de production légère. La
sortie reproduit l'arborescence du monorepo, d'où le `CMD` du Dockerfile qui
pointe sur `apps/web/admin-portal/server.js`.

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

### Observabilité

Chaque service expose le même contrat :

| Endpoint        | Rôle                                          |
| --------------- | --------------------------------------------- |
| `GET /health`   | sonde `@nestjs/terminus` (PostgreSQL + Redis) |
| `GET /metrics`  | métriques Prometheus                          |
| `GET /api/docs` | documentation OpenAPI (Swagger)               |

Les logs sont structurés en JSON via `nestjs-pino`, avec propagation
automatique du contexte de requête. Le chart Helm pointe ses sondes de vivacité
et de disponibilité sur `/health`, ce qui le rend réutilisable tel quel par tout
service respectant ce contrat.

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
        └──────────────────────► RabbitMQ   (tâches)
```

## Limites connues

- Le seul service implémenté (`iam`) se limite à l'authentification de base :
  inscription, connexion, émission de JWT. Le domaine IAM complet (rôles,
  permissions, multi-organisation) reste à construire.
- Aucun modèle de données métier n'existe : `schema.prisma` ne contient que la
  table technique `users`.
- `infrastructure/terraform/`, `infrastructure/monitoring/` et
  `infrastructure/security/` sont des emplacements réservés, encore vides.
- Le déploiement continu (ArgoCD) n'est pas configuré.
