# @nafa/geography

Le référentiel des lieux de NAFA.

> **Aucun code à ce jour.** Ce README précède l'implémentation : il fixe le
> périmètre décidé par
> [ADR-0009](../../docs/adr/0009-geography-master-boundaries.md) pour que la
> première ligne écrite ait déjà une frontière. Le backlog est dans
> [`docs/backlog/GEO-001.md`](../../docs/backlog/GEO-001.md).

## Responsabilité

**Identifier un lieu de référence.**

Sa valeur n'est pas de savoir _où sont les choses_ — c'est de garantir qu'un
lieu **désigne la même chose partout**. Un vocabulaire partagé, pas une
cartographie.

Aujourd'hui, `Actor.Address.region` est une chaîne libre : « Kindia »,
« KINDIA » et « Kindya » sont trois régions différentes pour le système. Rien
ne peut être agrégé par découpage administratif, ni rapproché entre contextes.

## Ce qu'il ne possède pas

| Exclu                                           | Contexte propriétaire      |
| ----------------------------------------------- | -------------------------- |
| Itinéraires, distances, corridors               | Logistics Master           |
| Zones de couverture, délais de livraison        | Logistics Master           |
| Prix, cotations, zones tarifaires               | Pricing Engine             |
| Zones commerciales, marchés, points de collecte | Trade Master               |
| Parcelles, bassins de production, rendements    | Agriculture Master         |
| Frontières géographiques (polygones)            | Différé — voir ADR-0009 §7 |
| Population, démographie                         | Hors NAFA                  |

Le critère est celui d'ACTOR-001 : **cette donnée change-t-elle avec
l'activité, ou seulement si le lieu change ?** Un itinéraire change avec l'état
des routes. Un rattachement administratif ne change que par décret.

`MarketPlace` mérite d'être nommé parce que son absence surprend : un marché
_est_ un lieu. Mais il porte des jours d'ouverture, des étals et des prix —
c'est la porte par laquelle l'opérationnel entrerait. Il ira au Trade Master et
référencera `AdministrativeAreaId`.

## Agrégats

### `CountryProfile`

Déclare **quels niveaux existent dans un pays** et comment ils s'appellent
localement. Identifié par son `CountryCode` : ISO 3166-1 a déjà attribué
l'identifiant, en inventer un second créerait deux façons de nommer la même
chose.

### `AdministrativeArea`

Une unité du découpage, rattachée par `parentId` — **une référence, jamais une
imbrication**. Une région compte des centaines de districts ; charger l'arbre
pour renommer une sous-préfecture serait un coût permanent.

Fusion et scission sont des **opérations métier avec successeurs**, pas des
suppressions. Quand une préfecture se scinde, les acteurs qui y étaient
enregistrés doivent rester résolvables.

## Niveaux génériques

`COUNTRY` < `LEVEL_1` < `LEVEL_2` < `LEVEL_3` < `LEVEL_4`

Jamais `REGION` ni `PREFECTURE` : les découpages ouest-africains ne partagent ni
les noms ni la profondeur.

| Pays    | `LEVEL_1` | `LEVEL_2`   | `LEVEL_3`       | `LEVEL_4` |
| ------- | --------- | ----------- | --------------- | --------- |
| Guinée  | Région    | Préfecture  | Sous-préfecture | District  |
| Mali    | Région    | Cercle      | Arrondissement  | Commune   |
| Sénégal | Région    | Département | Arrondissement  | Commune   |
| Liberia | County    | District    | Clan            | —         |

La structure est générique, **le vocabulaire est porté par `CountryProfile`**.

## Consommateurs

```
                    @nafa/geography
                           ▲
        ┌──────────┬───────┴───────┬──────────┐
      Actor    Agriculture     Logistics    Trade
```

Tous référencent `AdministrativeAreaId`. **Aucune dépendance inverse** : le
Geography Master ne connaîtra aucun de ses consommateurs.

Cette direction est vérifiée par Nx, arête par arête, sur l'axe `scope:*` — pas
laissée à la vigilance des relecteurs. Toute nouvelle dépendance entre Masters
exige une ADR. Voir ADR-0009 §8.

## Dépendances

`@nafa/shared` uniquement — comme `@nafa/foundation`, et pour la même raison :
un référentiel métier qui dépendrait d'une technologie cesserait d'être un
référentiel. `IsoDate` y est remonté depuis `foundation` afin qu'aucune
définition ne soit dupliquée entre Masters.

## Ce que ce package ne fera jamais

**Il n'embarque aucune donnée administrative.** Pas de jeu de données guinéen,
pas de script de peuplement. L'import est un travail d'infrastructure qui
n'utilisera que les fabriques et les ports.

Conséquence à connaître : **le Master est inutilisable tant que ce pipeline
n'existe pas**. Un domaine correct sur une base vide ne sert personne.
