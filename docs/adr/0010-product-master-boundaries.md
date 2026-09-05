# ADR-0010 : frontières du Master Produits

- **Statut** : Proposée
- **Date** : 2026-08-31
- **Décision** : ouvrir le troisième Master — Produits — comme donnée de
  référence autonome, et figer la ligne de partage avec les Masters
  Agriculture, Trade et Compliance.

## Contexte

Le cahier des charges NAFA cite les produits comme donnée de référence dès
l'architecture (`masters/ — données de référence : acteurs, organisations,
produits`), mais aucun modèle n'existe : ni dans le dépôt, ni dans les ADR,
ni dans les compétences métier. Chaque brique en attente — portails
producteurs, marketplace, logistique, finance — a pourtant besoin de
désigner _la même chose_ quand elle dit « riz ».

Les ADR-0007 et 0009 ont déjà distribué une partie du territoire :
variétés, saisons, parcelles et calendriers culturaux sont promis à
l'Agriculture Master ; les certifications (bio, phytosanitaire, qualité,
origine) au Compliance Master ; `MarketPlace` et le catalogue des offres
au Trade Master. Restait à décider ce qu'est, précisément, un « produit »
pour NAFA.

## Décision

### 1. Le produit est l'espèce marchande, pas la variété ni le lot

Le Master Produits possède **l'unité de référence échangeable** : « Riz »,
« Anacarde », « Fonio ». C'est ce qu'un agent de terrain nomme, ce qu'une
ligne de stock pointe, ce qu'une cotation tarif — l'équivalent exact de la
zone administrative pour le Master Geography.

Trois entités proches lui sont interdites :

| Entité                 | Chez qui           | Pourquoi                                                    |
| ---------------------- | ------------------ | ----------------------------------------------------------- |
| Variété (`DIAMA`)      | Agriculture Master | Une variété se cultive ; elle n'est pas une unité de marché |
| Lot / offre cataloguée | Trade Master       | Un lot a un propriétaire, un prix, une quantité             |
| Certification qualité  | Compliance Master  | Un attribut réglementaire, pas une identité produit         |

### 2. Catégories génériques, jamais de filière pays-spécifique

L'énuméré des catégories est générique — `CEREAL`, `TUBER`, `CASH_CROP`,
`HORTICULTURE`, `LIVESTOCK`, `FISHERY`, `PROCESSED` — pour la même raison
qu'ADR-0009 refuse `REGION`/`PREFECTURE` : un énuméré guinéen ne survit pas
au premier acteur malien, et NAFA vise sept pays. Les filières locales
(anacarde Guinée, sésame Mali) sont des **alias** du produit, pas des
catégories.

### 3. Le code produit est global, pas par pays

Contrairement au code de zone (unique par pays, ADR-0009), le code produit
est unique au niveau mondial : l'anacarde est l'anacarde partout. Un seul
référentiel, une seule clé.

### 4. Les noms officiels et locaux coexistent

Chaque produit porte un nom officiel et des alias — « Anacarde », « Cajou »,
« Cashew » désignent la même marchandise selon la langue et le marché.
C'est le pattern kindia/Kindya (ADR-0009) transposé aux produits, avec la
même conséquence : la résolution d'un texte libre en produit renvoie des
**candidats classés, jamais un match forcé**.

### 5. Les unités de mesure sont embarquées, avec conversion métrique

Chaque produit porte ses unités usuelles — une unité de base et des unités
dérivées avec leur facteur (`SAC_50` = 50 × `KG`). Les unités variables
selon le marché (le cabas qui fait 2 ou 3 kg selon la ville) ne sont pas
des unités de référence : leur conversion effective au moment de la
transaction appartient au Trade Master. Un registre global d'unités
partagées entre produits est différé jusqu'à ce que le besoin apparaisse.

### 6. Dépendance unique : le shared kernel

`@nafa/products` dépend de `@nafa/shared` et de rien d'autre. C'est une
donnée de référence : elle ne consomme ni acteurs, ni géographie, ni
plateforme. La règle `scope:product` ferme l'axe, et la sonde permanente
`tools/verify-inter-master-boundaries.mjs` casse le build si elle cesse de
tenir.

## Conséquences

- Un lot marketplace référence un `ProductId` ; il ne le définit pas.
- L'ancrage géographique d'une production (région, bassin) est une donnée
  Agriculture/Trade, pas Produit : le produit n'a pas de champ origine.
- Le premier service consommateur (adaptateurs Prisma, import du catalogue
  agricole) viendra dans PROD-002, sur le précédent du pipeline GEO-002.
- L'axe `scope:*` compte désormais trois règles (foundation reste ouvert,
  geography et product fermés) : la révision annoncée par ADR-0009 §8 se
  rapproche.

## Références

- ADR-0005 — le domaine peut dépendre du shared kernel
- ADR-0007 — frontières réglementaires de l'acteur ; allocations vers
  Agriculture et Compliance
- ADR-0009 — frontières du Master Geography ; le précédent complet
- `docs/backlog/PROD-001.md` — le sprint de construction du domaine
