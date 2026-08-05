# SPR-0010 — Intégration du portail AGEROUTE dans le monorepo

**État :** à découper. Ce n'est pas un ticket unique, c'est un chantier à phases.
**Périmètre :** `apps/web/ageroute` → portail NAFA à part entière.

---

## 1. Ce qui est arrivé dans le dépôt

`apps/web/ageroute` (`ageroute-guinee`) est un portail Vite + React 18 complet, développé
hors du monorepo et déposé dans `apps/web/`. Il n'est suivi par aucune branche Git.

Mesures relevées le 2026-08-03 :

| Indicateur                                                | Valeur                                                  |
| --------------------------------------------------------- | ------------------------------------------------------- |
| Fichiers dans `src/`                                      | 505                                                     |
| Imports Supabase                                          | 316, dont **312 via le seul module `src/lib/supabase`** |
| Fichiers appelant directement le query builder `.from(…)` | 303                                                     |
| Fichiers utilisant `supabase.auth`                        | 45                                                      |
| Migrations SQL dans `supabase/migrations/`                | 502                                                     |
| Edge functions Supabase                                   | 5                                                       |
| Composants dans son `src/design-system/` local            | 17                                                      |
| Gestionnaire de paquets                                   | npm (`package-lock.json`)                               |

Dépendances propres : `@supabase/supabase-js`, `leaflet` + `leaflet-draw` (cartographie),
`shpjs` (shapefiles SIG), `jspdf` + `jspdf-autotable` (édition PDF), `lucide-react`, `tailwindcss`.

### Le point favorable

Le couplage Supabase est **centralisé** : 312 fichiers sur 316 passent par `src/lib/supabase`.
C'est la couture sur laquelle toute la migration s'appuiera. Sans elle, ce chantier serait
une réécriture ; avec elle, c'est une substitution progressive.

### Le point coûteux

Le module `src/lib/supabase` réexporte le client Supabase, pas une API de domaine.
Les 303 fichiers qui font `.from('table').select(...)` connaissent donc le schéma de la base
directement. Remplacer Supabase par `@nafa/sdk` ne se limite pas à changer un import :
il faut donner à chacun de ces appels un point d'entrée métier côté service NestJS.

---

## 2. État actuel dans le workspace

`pnpm-workspace.yaml` exclut temporairement le dossier :

```yaml
- '!apps/web/ageroute'
```

Sans cette exclusion, `pnpm install --frozen-lockfile` échoue
(`ERR_PNPM_OUTDATED_LOCKFILE` : 19 dépendances absentes du lockfile).

**Cette ligne se retire à la fin de la phase 0, pas avant.**

---

## 3. Découpage proposé

Chaque phase est une PR ou une série de PR, mergeable indépendamment, sans régression fonctionnelle.

### Phase 0 — Entrée dans le monorepo, à comportement identique

Le portail continue de parler à Supabase. On ne change que sa mécanique de build.

- Supprimer `package-lock.json` et son `node_modules` ; passer en pnpm
- Renommer le package `ageroute-guinee` → `@nafa/ageroute-portal`
- Rattacher `tsconfig.json` à `tsconfig.base.json`
- Adopter la config ESLint flat du monorepo, corriger ce qu'elle signale
- Ajouter `project.json` avec les tags Nx (frontière `apps/web`)
- Retirer l'exclusion de `pnpm-workspace.yaml`, régénérer le lockfile en une PR dédiée
- Le brancher sur `.github/workflows/ci.yml`

_Sortie attendue :_ `npx nx affected -t lint typecheck build` passe avec le portail inclus.

### Phase 1 — Réconciliation du schéma

- Auditer les 502 migrations `supabase/migrations/` : quelles tables sont réellement vivantes
- Cartographier ces tables vers `database/schema/schema.prisma`
- Identifier les recouvrements avec le domaine `Actor` déjà existant dans `packages/foundation`
- Décider table par table : reprise telle quelle, fusion avec un agrégat NAFA, ou abandon

_C'est la phase la plus incertaine. Elle conditionne tout le reste — ne pas la sous-estimer._

### Phase 2 — Backend NestJS

- Créer le service métier qui expose les entités retenues
- Étendre `@nafa/sdk` avec les endpoints correspondants
- Respecter les couches DDD : `domain` → `application` → `infrastructure` → `api`

### Phase 3 — Basculement de la couture _(le gros morceau)_

- Réécrire `src/lib/supabase` pour exposer `@nafa/sdk` + TanStack Query au lieu du client Supabase
- Migrer les 303 fichiers appelant `.from(…)`, par domaine fonctionnel et non en une fois
- Chaque lot de migration est une PR séparée, avec ses tests

### Phase 4 — Authentification

- Basculer les 45 fichiers `supabase.auth` vers l'IAM (`services/foundation/iam` + `packages/auth`)
- Reprendre les rôles et politiques d'accès Supabase (RLS) en gardes NestJS explicites

### Phase 5 — Edge functions

Les 5 fonctions (`change-user-password`, `create-auth-users`, `reset-all-passwords`,
`send-marche-notification`, `sync-missing-auth-users`) deviennent des cas d'usage NestJS.
`send-marche-notification` passe par `packages/notifications`.

### Phase 6 — Design system

Fusionner les 17 composants de `src/design-system/` dans `packages/design-system`.
Tout composant déjà présent en amont est supprimé côté portail, pas dupliqué.

---

## 4. Points à trancher avant de démarrer

1. **Leaflet, shpjs, jspdf** — cartographie SIG et édition PDF. Ces capacités remontent-elles
   dans `packages/maps` et `packages/documents`, ou restent-elles locales au portail ?
   `packages/maps` et `packages/documents` existent déjà mais sont vides.
2. **Les 502 migrations** — reprise de l'historique, ou repartir d'un schéma cible unique ?
3. **Supabase Storage** — s'il est utilisé, la cible est MinIO/S3 déjà présent dans le compose.
4. **Périmètre fonctionnel** — ce portail recouvre-t-il un des 11 portails déjà prévus
   (`government-portal` ? `logistics-portal` ?) ou en constitue-t-il un douzième ?

---

## 5. Règle de parallélisme

Ce chantier touche `database/schema/schema.prisma`, `packages/sdk` et `packages/design-system` —
trois contrats gelés au sens d'`AGENTS.md`. Les phases 1, 2 et 6 doivent donc passer en
**contract PR** et bloquer les autres lanes le temps du merge.

Voir `docs/PARALLEL-AGENTS.md` §4 pour l'ordre de merge.
