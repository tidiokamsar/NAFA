# ADR-0011 : frontières du Master Trade et révision de l'axe scope

- **Statut** : Proposée
- **Date** : 2026-09-05
- **Décision** : ouvrir le quatrième Master — Trade — avec l'Offre comme
  premier agrégat, accorder trois arêtes inter-Masters explicites, et
  réviser l'axe `scope:*` comme ADR-0009 §8 l'avait promis.

## Contexte

Le socle référentiel est complet : acteurs (fondation), zones
administratives (geography), produits (products) — chacun avec son domaine,
son service, ses adaptateurs et ses données réelles. Aucun processus
n'existe encore. La première entité processus d'un marché agricole est
l'**offre** : un vendeur propose une quantité d'un produit, à un prix,
disponible sur une fenêtre.

ADR-0009 §8 avait prédit ce moment : « la contrainte du point 8 devra être
revue à l'arrivée du troisième Master, quand le graphe cessera d'être une
simple arête ». Trade est ce Master consommateur.

## Décision

### 1. L'offre n'est ni la commande, ni la transaction, ni la cotation

| Entité                      | Chez qui                   | Pourquoi                                                      |
| --------------------------- | -------------------------- | ------------------------------------------------------------- |
| Commande (demande)          | Trade Master, plus tard    | Un acheteur répond à une offre — même contexte, autre agrégat |
| Transaction / paiement      | Trust/Payments             | L'exécution financière, ses états et ses reçus                |
| Cotation de marché          | Pricing Engine             | Le prix de référence observé, pas demandé (ADR-0009)          |
| Lot / qualité / traçabilité | Trade/Logistics, plus tard | La subdivision physique d'une offre vendue                    |

### 2. Le prix demandé appartient à Trade

Le prix auquel un vendeur **propose** (asking price) est une donnée de
l'offre : il émane du vendeur, change par négociation, et vit et meurt avec
l'offre. La **cotation** — le prix de marché agrégé, observé, de référence —
appartient au Pricing Engine. Les deux se répondent mais ne se confondent
pas ; l'offre est la matière première de la cotation, jamais l'inverse.

La monnaie est générique : `amountMinor` (entier, unités mineures) + code
ISO 4217. GNF et XOF n'ont pas de subdivision en pratique ; le type n'en
tient pas compte pour autant — sept pays, plusieurs monnaies.

### 3. Trois arêtes inter-Masters, nommées et minimales

Trade importe des **types de marque uniquement**, jamais les agrégats — la
règle posée par `Actor.Address.areaId` (ADR-0009 §8) :

| Arête                | Ce que Trade importe    | Pourquoi                                 |
| -------------------- | ----------------------- | ---------------------------------------- |
| `trade → foundation` | `ActorId`               | Désigner le vendeur                      |
| `trade → geography`  | `AdministrativeAreaId`  | Localiser le retrait, quand il est connu |
| `trade → products`   | `ProductId`, `UnitCode` | Désigner la marchandise et son unité     |

Les questions d'existence (« ce vendeur est-il actif ? », « ce produit
est-il publié et quelles unités déclare-t-il ? ») sont des questions de
**collection** : elles passent par des ports du Master Trade
(`SellerRegistry`, `ProductCatalog`), pas par des imports d'agrégats.

### 4. La révision de l'axe scope (la promesse d'ADR-0009 §8)

Jusqu'ici, les règles `scope:*` ne faisaient que **fermer** (geography et
products : `layer:util` seul). La règle de Trade est la première à
**accorder** explicitement :

```
scope:trade → layer:util + scope:foundation + scope:geography + scope:product
```

L'intersection avec `layer:domain → layer:util + layer:domain` donne
exactement les trois arêtes du tableau. Ajouter une arête = ajouter un tag
à cette liste = un acte visible en revue et justifiable par une ADR. La
sonde permanente `tools/verify-inter-master-boundaries.mjs` vérifie les
deux sens : les trois imports autorisés passent, `@nafa/platform` et
`@nafa/sdk` sont rejetés.

### 5. Localisation optionnelle, identité immuable

`pickupAreaId` est nullable — même pragmatisme phase-1 que
`Address.areaId` (ADR-0009). Le vendeur, le produit, l'unité et la zone
sont **immuables** après enregistrement : changer l'un ou l'autre est une
autre offre (withdraw + nouvelle offre), pas une mutation.

## Conséquences

- `revisePrice` est autorisé tant que l'offre est PUBLISHED : les marchés
  négocient. L'événement `offer.price-revised` trace chaque mouvement.
- La quantité est immuable en v1 — le prélèvement partiel est un chantier
  fulfillment.
- Le premier consommateur applicatif (service, adaptateurs, schéma Prisma)
  viendra en TRA-002, sur les précédents GEO-002 et PROD-002.
- L'axe `scope:*` compte désormais quatre règles ; la prochaine arête
  (warehouse ? agriculture ?) devra respecter le même protocole.

## Références

- ADR-0007 — frontières réglementaires de l'acteur
- ADR-0008 — tampon d'événements et future Outbox
- ADR-0009 — frontières du Master Geography ; la promesse de révision §8
- ADR-0010 — frontières du Master Products
- `docs/backlog/TRA-001.md` — le sprint de construction du domaine
