# PROD-001 — Master Produits : le domaine

Construit le référentiel des produits agricoles échangeables sur le
précédent GEO-001. **Domaine seul** — schéma, service, adaptateurs et
import du catalogue viennent en PROD-002, après le merge des PRs
geography en vol.

Base : `origin/main`. ADR : 0010 (0009 est réservé au Master Geography,
en PR).

---

## PROD-001.1 — Scaffold et frontières

**Objectif** — poser le package et figer les règles.

**Périmètre**

- `packages/products` (config Nx, tsconfig, ESLint, sonde de frontière)
- ADR-0010 : frontières Produits / Agriculture / Trade / Compliance
- Backlog PROD-001
- Règle `scope:product` dans `tools/eslint/module-boundaries.mjs`

**Critères d'acceptation** — `@nafa/products` apparaît dans le graphe Nx
avec les tags `scope:product` + `layer:domain` ; la sonde refuse
l'import de `@nafa/foundation`.

---

## PROD-001.2 — L'agrégat `Product`

**Objectif** — l'espèce marchande comme agrégat racine.

**Périmètre**

- VOs : `ProductId`, `ProductCode`, `ProductName` (officiel + alias),
  `ProductCategory` (enum générique), `UnitOfMeasure` (code, kind,
  base, facteur)
- `ProductRule` + `ProductRuleViolation` (le pattern à trois
  constructeurs)
- Événements : `product.registered`, `.published`, `.renamed`,
  `.aliases-changed`, `.deprecated`
- L'agrégat : `register` / `rehydrate` / `snapshot` / `pullEvents`,
  mutations `rename`, `changeAliases`, `publish`, `deprecate`
- La factory `createProduct` (valide les VOs, puis délègue)

**Invariants numérotés (1-8)**

1. `ProductId` est un UUID valide
2. `ProductCode` non vide, majuscules — **unique au niveau mondial**
   (la collection décide : checker externe, comme l'invariant 13 GEO)
3. La catégorie appartient à l'énum générique d'ADR-0010
4. Nom officiel non vide ; alias non vides, dédupliqués
5. Unité valide : kind cohérent, facteur > 0, base du même kind
6. Les transitions de statut sont valides (`DRAFT → PUBLISHED →
DEPRECATED`, jamais de retour)
7. La catégorie est immuable une fois `PUBLISHED`
8. Un produit `DEPRECATED` ne change plus

**Critères d'acceptation** — chaque invariant a son test ; les événements
portent le préfixe `product.` ; `save(aggregate, expectedVersion)` n'existe
pas encore (c'est .4).

---

## PROD-001.3 — `ProductResolutionService`

**Objectif** — résoudre un texte libre (« cajou », « ANACARDE ») en
produit.

**Périmètre**

- Résolution sur nom officiel et alias, normalisation casse et accents
- Retour : **candidats classés** avec score, jamais un match forcé
- Restriction par catégorie

**Critères d'acceptation** — « anacarde », « ANACARDE » et « cajou »
remontent le même produit en tête ; une saisie ambiguë (« maïs » face à
plusieurs céréales) renvoie plusieurs candidats sans en choisir un.
Transposition directe d'`AreaResolutionService` (GEO-001.5).

---

## PROD-001.4 — Ports de persistance

**Objectif** — déclarer les contrats, sans implémentation.

**Périmètre**

- `ProductRepository` — `findById`, `findByCode`, `findByName`,
  `save(product, expectedVersion)`
- `ProductCodeUniquenessChecker` — l'unicité porte sur la collection
- Jetons `Symbol`
- Contract spec avec doubles de test

**Critères d'acceptation** — `save(aggregate, expectedVersion)` avec la
**signature identique** à ACTOR-001 et GEO-001.6 ; aucun
`class ... implements` hors des doubles de test.

---

## Ce qui n'est pas dans ce sprint

| Différé                             | Vers                                 |
| ----------------------------------- | ------------------------------------ |
| Schéma Prisma + migration           | PROD-002                             |
| Service `services/masters/products` | PROD-002 (précédent GEO-002)         |
| Adaptateurs Prisma                  | PROD-002                             |
| Import du catalogue agricole        | PROD-002 (JSON, comme la Guinée GEO) |
| Registre global d'unités            | Quand deux produits le réclameront   |
| Variétés, saisons, parcelles        | Agriculture Master (ADR-0007)        |
| Catalogue d'offres, `MarketPlace`   | Trade Master (ADR-0009)              |
| Certifications, grades qualité      | Compliance Master (ADR-0007)         |
