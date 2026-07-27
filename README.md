# NAFA — Enterprise Monorepo

Monorepo NAFA : ensemble des applications web et mobiles, services back-end,
packages partagés, infrastructure et documentation de la plateforme.

## Structure

```
NAFA/
├── apps/
│   ├── web/              # 11 portails (executive-center, admin-portal, marketplace, ...)
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
│   └── security/
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

Chaque dossier contient un `README.md` décrivant son rôle. Cette V1 est un
**squelette** : les dossiers sont en place mais ne contiennent pas encore de
code applicatif — chaque équipe peut initialiser son app/service avec la
stack de son choix.

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
