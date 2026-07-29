# NAFA — Enterprise Monorepo

Monorepo NAFA : ensemble des applications web et mobiles, services back-end,
packages partagés, infrastructure et documentation de la plateforme.

## Structure

```
NAFA/
├── apps/
│   ├── web/              # portails métier (executive-center, admin-portal, marketplace,
│   │                     #   portail-opportunites, ...)
│   ├── mobile/            # 4 apps mobiles (super-app, driver, warehouse, inspector)
│   ├── ai/                 # copilot, agents, rag
│   ├── whatsapp/
│   ├── ussd/
│   └── api-portal/
│
├── services/
│   ├── foundation/         # identité, auth, config
│   ├── masters/            # référentiels (données maîtres)
│   ├── engines/             # pricing, matching, scoring...
│   ├── processes/           # orchestration de workflows
│   └── integrations/        # paiement, banques, douanes, partenaires
│
├── packages/
│   ├── design-system/
│   ├── ui/
│   ├── auth/
│   ├── workflow/
│   ├── notifications/
│   ├── documents/
│   ├── maps/
│   ├── analytics/
│   ├── ai-sdk/
│   └── shared/
│
├── infrastructure/
│   ├── docker/
│   ├── kubernetes/
│   ├── helm/
│   ├── terraform/
│   ├── monitoring/
│   ├── security/
│   └── sharepoint/        # provisioning et publication SharePoint Online
│
├── database/
│   ├── schema/
│   ├── migrations/
│   ├── seed/
│   └── scripts/
│
├── docs/            # stratégie, étude marché, cahier des charges, design, investisseurs
├── prompts/
├── tests/
└── tools/
```

Chaque dossier contient un `README.md` décrivant son rôle. La V1 était un
**squelette** ; les dossiers restants sont toujours en place et vides —
chaque équipe peut initialiser son app/service avec la stack de son choix.

## Portail des opportunités AGEROUTE

Premier composant applicatif livré. Portail public des appels d'offres et des
recrutements de l'AGEROUTE Guinée, adossé à un back-office SharePoint Online
et à des flux Power Automate.

| Composant | Emplacement |
|---|---|
| Front public (statique, sans build) | `apps/web/portail-opportunites/` |
| Relais sécurisé candidatures / abonnements | `services/integrations/relais-portail/` |
| Provisioning et publication SharePoint | `infrastructure/sharepoint/portail-opportunites/` |
| Guide de déploiement et spécification des flux | `docs/cahier-des-charges/portail-opportunites/` |

Le guide de déploiement décrit l'ensemble de la procédure, de la création du
site SharePoint à la recette. Les deux composants Node fonctionnent sans
dépendance externe :

```bash
cd services/integrations/relais-portail && npm test   # contrôles serveur et relais
cd apps/web/portail-opportunites && npm run demo && npm run dev
```

## Démarrage

Ce dépôt est configuré comme un workspace [pnpm](https://pnpm.io/) (voir
`pnpm-workspace.yaml` et `package.json`). Une fois du code ajouté dans les
packages/apps :

```bash
pnpm install
```

## Origine

Les catégories sous `docs/` (stratégie, étude marché, cahier des charges,
design, investisseurs) reprennent l'organisation documentaire initiale du
projet NAFA, à réintégrer au fil de l'eau.
