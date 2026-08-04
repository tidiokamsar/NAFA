# ADR-0009 — Frontières du Geography Master

**Statut** : Acceptée — GEO-001
**Voir aussi** : [ADR-0004](0004-enforce-architecture-boundaries-with-nx-tags.md), [ADR-0005](0005-domain-may-depend-on-the-shared-kernel.md), [ADR-0007](0007-actor-regulatory-boundaries.md)

## Contexte

### Pourquoi ce Master existe

ADR-0007 a nommé le problème sans le résoudre :

> **Un point de migration connu.** `Address.region` est une chaîne libre. Elle
> deviendra une référence vers le futur Geography Master.

Une chaîne libre ne désigne rien. Trois agents de terrain saisissent
« Kindia », « KINDIA » et « Kindya » : le système enregistre trois régions
distinctes. Aucune agrégation par découpage administratif n'est possible, aucun
rapprochement entre un producteur et un entrepôt situés au même endroit, aucune
restitution fiable au portail gouvernemental.

La valeur de ce Master n'est donc pas de savoir _où sont les choses_ — c'est de
garantir qu'un lieu **désigne la même chose partout**. C'est un vocabulaire
partagé, pas une cartographie.

### Pourquoi `Actor.Address.region` ne suffit plus

Quatre contextes ont besoin d'ancrer une position, et chacun le ferait
différemment si rien ne l'en empêchait :

| Contexte               | Besoin                            |
| ---------------------- | --------------------------------- |
| Actor Master           | Adresse d'un acteur               |
| Agriculture Master     | Bassins de production, parcelles  |
| Logistics Master       | Origines, destinations, entrepôts |
| Portail gouvernemental | Agrégation par découpage officiel |

Sans référentiel commun, chacun invente sa propre orthographe et les données
cessent d'être rapprochables. Le coût n'est pas théorique : il se paie à la
première requête transverse.

### Le piège propre à ce domaine

Un découpage administratif **n'est pas une donnée de référence stable**. C'est
une décision politique qui change : la Guinée a redécoupé ses préfectures, des
sous-préfectures fusionnent, des districts se scindent.

Un modèle qui traite les lieux comme immuables casse au premier décret — et
casse **rétroactivement**, puisque les acteurs enregistrés hier pointent alors
vers une entité qui n'existe plus.

## Décision

### 1. Le bounded context

**Dans le périmètre** : identité, hiérarchie et cycle de vie des unités
administratives ; noms officiels et variantes locales ; point central.

**Hors périmètre**, avec le contexte propriétaire :

| Exclu                             | Va vers            | Raison                                          |
| --------------------------------- | ------------------ | ----------------------------------------------- |
| Itinéraires, distances, corridors | Logistics Master   | Change avec l'état des routes, pas avec le lieu |
| Zones de couverture, délais       | Logistics Master   | Opérationnel                                    |
| Zones de prix, cotations          | Pricing Engine     | Change chaque semaine                           |
| Parcelles, bassins de production  | Agriculture Master | Un actif, pas un lieu de référence              |
| Population, démographie           | Hors NAFA          |                                                 |

Le Geography Master ne connaîtra **aucun** de ses consommateurs. Ils le
référencent par `AdministrativeAreaId`, sans dépendance inverse — même
direction de graphe que `ActorId` dans ADR-0007.

### 2. Un package séparé : `packages/geography`

Et non `packages/foundation/src/geography/`.

**Pourquoi.** `foundation` porte déjà `identity` et `actor`. Y ajouter chaque
Master en ferait « tous les domaines », ce qui détruirait la propriété que son
README revendique : un package dont on peut dire en une phrase ce qu'il
contient. Un Master par package garde chacun lisible et testable seul.

**Le prix** : un package de plus à configurer, et une frontière inter-Masters
qui doit être explicitée — ce que traite le point 8.

### 3. Deux agrégats

**`CountryProfile`** — déclare quels niveaux existent dans un pays et comment
ils s'appellent localement. Identifié par son `CountryCode` : contrairement à
un acteur, un pays n'est pas quelque chose que nous frappons. ISO 3166-1 a déjà
attribué l'identifiant ; en inventer un second créerait deux façons de nommer
la même chose.

**`AdministrativeArea`** — une unité du découpage, rattachée par `parentId`.

**Pourquoi `parentId` et non une imbrication.** Même règle qu'`Actor` ↔
`CooperativeMembership` dans ADR-0006 : une région compte des centaines de
districts. Charger l'arbre pour renommer une sous-préfecture serait un coût
permanent, et deux corrections sans rapport entreraient en conflit sur un seul
compteur de version.

**Pourquoi la fusion et la scission sont des opérations métier.** Quand une
préfecture se scinde, les acteurs enregistrés dans l'ancienne entité doivent
rester résolvables. Un statut `MERGED` ou `SPLIT` accompagné de ses successeurs
permet de répondre « cette adresse pointe vers une zone devenue celles-ci » au
lieu de renvoyer `null`. Une suppression rendrait l'historique irrésoluble.

C'est ce qui distingue ce Master d'une simple table de référence.

### 4. `MarketPlace` est exclu

Un marché, un point de collecte ou un poste frontalier est un lieu — la
tentation de le loger ici est réelle.

**Pourquoi il n'y est pas.** C'est la porte par laquelle l'opérationnel entre.
Un marché a des jours d'ouverture, un nombre d'étals, des prix pratiqués, des
volumes : tout cela change avec l'activité. L'expérience d'ACTOR-001 est
directe — une première version du modèle avait mis surface cultivée, capacité
d'entreposage et corridors dans les rôles, et il a fallu les en retirer.

`MarketPlace` appartient au **Trade Master** et référencera
`AdministrativeAreaId`.

### 5. Les niveaux sont génériques

`COUNTRY` < `LEVEL_1` < `LEVEL_2` < `LEVEL_3` < `LEVEL_4`, et **jamais**
`REGION` / `PREFECTURE` / `SOUS_PREFECTURE`.

**Pourquoi.** Un énuméré guinéen ne survit pas au premier acteur malien. Les
découpages ouest-africains ne partagent ni les noms ni la profondeur :

| Pays          | Niveau 1 | Niveau 2    | Niveau 3        | Niveau 4        | Profondeur |
| ------------- | -------- | ----------- | --------------- | --------------- | :--------: |
| Guinée        | Région   | Préfecture  | Sous-préfecture | District        |     4      |
| Mali          | Région   | Cercle      | Arrondissement  | Commune         |     4      |
| Sénégal       | Région   | Département | Arrondissement  | Commune         |     4      |
| Côte d'Ivoire | District | Région      | Département     | Sous-préfecture |     4      |
| Sierra Leone  | Province | District    | Chiefdom        | Section         |     4      |
| Liberia       | County   | District    | Clan            | —               |     3      |
| Guinée-Bissau | Região   | Sector      | Section         | —               |     3      |

Les noms diffèrent tous, et la profondeur varie. **La structure est donc
générique, le vocabulaire est porté par `CountryProfile`.** Un affichage lit le
libellé dans le profil ; le domaine ne raisonne que sur l'ordre.

Corriger cela après coup aurait été une migration de schéma sur toutes les
adresses du système.

La profondeur maximale est fixée à quatre. Elle couvre les sept pays étudiés ;
un huitième qui en demanderait cinq serait un ajout à l'énuméré, pas une
refonte. La limite est un choix visible, pas une supposition.

### 6. `IsoDate` monte dans `@nafa/shared`

`ValidityPeriod` en a besoin. `IsoDate` vit aujourd'hui dans
`foundation/src/actor/domain/value-objects/`.

Trois issues existaient : le dupliquer dans geography, faire dépendre geography
de foundation, ou le remonter. **Le remonter est le seul choix qui ne crée pas
de dette.**

- Le dupliquer garantit la divergence. Deux définitions de la même chose
  finissent par ne plus être la même chose, et l'écart est invisible : deux
  `IsoDate` structurellement compatibles compilent ensemble jusqu'au jour où
  l'une gagne une règle.
- Faire dépendre geography de foundation inverse la direction : c'est Actor qui
  consommera Geography, pas l'inverse.

`IsoDate` n'a d'ailleurs rien de spécifique aux acteurs. C'est une date
calendaire — `YYYY-MM-DD`, sans heure ni fuseau — au même titre que `Result` ou
`Brand`. Sa place était dans le noyau partagé dès l'origine ; ACTOR-001 l'a
créée là où le besoin est apparu, ce qui était raisonnable avec un seul
consommateur.

### 7. Les polygones sont différés

Le modèle porte un **centroïde**, pas une frontière.

**Pourquoi.** Un polygone exige une indexation spatiale — PostGIS ou
équivalent — donc une décision d'infrastructure prise pour tout le dépôt. Les
premiers besoins de NAFA sont la hiérarchie et le nom : « dans quelle
préfecture est cet acteur », pas « quels acteurs dans un rayon de 50 km ». Le
centroïde suffit à afficher un point sur une carte.

Différer n'est pas exclure : le jour où une requête spatiale sera nécessaire,
elle s'ajoutera sans casser la hiérarchie.

### 8. Une dépendance domain → domain exige une ADR

C'est la conséquence directe du point 2, et la règle de gouvernance la plus
importante de cette ADR.

ADR-0005 a posé `layer:domain → ['layer:util']`. Deux Masters `layer:domain`
ne peuvent donc pas se voir, ce qui rendrait la migration d'`Address`
impossible. Ouvrir `layer:domain → layer:domain` globalement résoudrait le
problème en créant le suivant : n'importe quel Master pourrait dépendre de
n'importe quel autre, sans que personne ne le remarque.

**La direction voulue est un graphe explicite** :

```
                       @nafa/shared
                            |
        ┌──────────┬────────┴────────┬──────────┐
      actor     geography        logistics    trade
        └─────────►│
              autorisé : actor → geography
              interdit : geography → actor
              interdit : trade → actor, sans ADR
```

**Le mécanisme.** Nx applique **toutes** les règles qui correspondent à un
projet. L'axe `layer` s'ouvre ; l'axe `scope`, laissé libre par ADR-0004,
referme aussitôt, arête par arête :

```js
{ sourceTag: 'layer:domain',     onlyDependOnLibsWithTags: ['layer:util', 'layer:domain'] },
{ sourceTag: 'scope:foundation', onlyDependOnLibsWithTags: ['layer:util', 'scope:geography'] },
{ sourceTag: 'scope:geography',  onlyDependOnLibsWithTags: ['layer:util'] },
```

L'intersection donne exactement : _foundation peut voir geography ; geography
ne voit que shared_. Toute nouvelle arête inter-Masters devient **une ligne à
ajouter**, donc un acte visible en revue et justifiable par une ADR.

**Un avertissement à qui lira la configuration.** La première règle, lue seule,
laisse croire que domain → domain est ouvert. **Ce n'est pas le cas** : ce sont
les règles `scope:*` qui contraignent réellement, et retirer l'une d'elles
ouvrirait silencieusement une dépendance. Elles ne sont pas décoratives.

ADR-0004 avait anticipé ce moment : _« Les tags sont posés pour que la
contrainte puisse être ajoutée sans toucher aux `package.json`. »_

## Conséquences

**Ce qu'on gagne.** Un lieu désigne la même chose dans tous les contextes. Le
modèle accueille sept pays sans énuméré à réécrire. Les dépendances entre
Masters deviennent une propriété vérifiée du dépôt, pas une convention de
revue. Le domaine reste testable sans conteneur ni base, comme ACTOR-001.

**Ce qu'on perd, et c'est réel.**

- Aucune requête spatiale — « quels acteurs à 50 km » — sans polygones ni index
- Les requêtes hiérarchiques sont récursives, donc à la charge de l'adaptateur
- **Le Master est inutilisable tant que le pipeline d'import n'existe pas.** Un
  domaine correct sur une base vide ne sert personne, et cette ADR ne livre
  aucune donnée administrative
- La migration d'`Address` se fera en quatre phases étalées, pas en une

**Un risque à surveiller.** La phase de rapprochement des chaînes existantes
vers des identifiants est la plus dangereuse du chantier : une résolution
automatique qui se trompe **déplace silencieusement un acteur**.
`AreaResolutionService` devra donc renvoyer des **candidats classés**, jamais
une correspondance forcée — même principe que les collisions de numéro de
téléphone dans ACTOR-001, où l'information remonte et la décision reste à
l'appelant.

## Non décisions

Cette ADR **ne décide pas** les points suivants. Ils sont listés pour qu'aucun
d'eux ne soit tranché par défaut, dans un coin de code, faute d'avoir été
écrit :

- **La source officielle des données administratives** — registre national,
  publication ministérielle, source ouverte, ou saisie manuelle
- **Le format des imports** — CSV, GeoJSON, API, et le contrat que le pipeline
  présentera aux fabriques
- **La stratégie de cache ou de projection** — comment un contexte consommateur
  interroge celui-ci : appel synchrone, projection locale alimentée par
  événements, ou vue matérialisée. Même question laissée ouverte par ADR-0007
- **La base spatiale future** — PostGIS ou autre, et le moment de l'introduire
- **Les frontières GeoJSON** — leur modélisation, leur stockage et leur
  indexation, différés par le point 7 de cette ADR
- **La révision de l'axe `scope:*`** — la contrainte du point 8 devra être
  revue à l'arrivée du troisième Master, quand le graphe cessera d'être une
  simple arête

**Pourquoi cette section existe.** Une décision absente d'une ADR n'est pas une
décision libre. Sans cette liste, un développeur qui rencontre l'un de ces
points conclut raisonnablement « ce n'était pas écrit, donc je peux trancher »
— et le tranche seul, dans un fichier que personne ne relira sous cet angle.
Nommer ce qui reste ouvert est ce qui transforme un silence en question.

Chacun de ces points mérite sa propre ADR le jour où il se posera.
