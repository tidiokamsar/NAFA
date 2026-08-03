# ADR-0007 — Frontières réglementaires et opérationnelles d'Actor

**Statut** : Acceptée — ACTOR-001
**Voir aussi** : [ADR-0006](0006-actor-and-cooperative-membership-boundaries.md)

## Contexte

ADR-0006 a posé les frontières d'agrégat du Master des acteurs et a laissé un
point ouvert, en toutes lettres :

> **Ce qui n'est pas décidé.** Les habilitations réglementaires — code douane,
> licence de transport, agrément BCRG — sont hors périmètre d'ACTOR-001. La
> matrice d'éligibilité dit _qui peut_ tenir un rôle ; rien n'atteste
> aujourd'hui qu'un acteur y est _autorisé_ en pratique. Leur place, ici ou
> dans le contexte conformité, reste ouverte.

Cette ADR le ferme. Elle ne réécrit pas ADR-0006 : conformément à la règle du
répertoire, une décision acceptée reste telle quelle et c'est une nouvelle ADR
qui la complète.

Le sujet dépasse les seules habilitations. Trois questions voisines se posaient
ensemble, et les trancher séparément aurait produit trois critères
incompatibles :

1. Où vivent les habilitations réglementaires ?
2. Jusqu'où va `ProductionKind` ?
3. Où vivent les données opérationnelles en général ?

## Décision

Un seul critère répond aux trois :

> Cette donnée décrit-elle **ce que l'acteur est**, ou **ce qu'il fait, possède
> ou a obtenu** ?

Le Master des acteurs porte la première catégorie. Tout le reste appartient à
un autre contexte et le référence par `ActorId`.

### 1. Les habilitations réglementaires appartiennent au Compliance Master

Sont concernés :

| Habilitation          | Exemples                                          |
| --------------------- | ------------------------------------------------- |
| Code douane           | numéro d'importateur, régimes autorisés, codes SH |
| Licences de transport | licence par mode, corridors autorisés, validité   |
| Agréments financiers  | agrément BCRG, code banque, BIC, plafonds         |
| Certifications        | bio, phytosanitaire, qualité, origine             |

**Pourquoi pas dans `Actor`.** Une habilitation n'est pas un attribut de
l'acteur, c'est un **acte d'un tiers à propos de l'acteur**. Elle a un
émetteur, une date de délivrance, une échéance, un périmètre, un document
justificatif, et elle se suspend, se renouvelle ou se retire indépendamment de
la vie commerciale de son titulaire. Un acteur parfaitement actif peut voir sa
licence expirer un mardi sans que rien ne change dans son identité.

Trois conséquences pratiques rendent la séparation nécessaire :

- **Cycle de vie propre.** Une habilitation expire. Un `Actor` non. Loger les
  deux dans le même agrégat mêlerait un compteur de version qui bouge à chaque
  renouvellement de licence à un enregistrement d'identité qui, lui, ne devrait
  presque jamais bouger.
- **Volume et sensibilité.** Les pièces justificatives sont volumineuses et
  soumises à des règles de conservation et d'accès que le registre des acteurs
  n'a pas. Les mêler obligerait à protéger tout le Master au niveau du document
  le plus sensible.
- **Autre lectorat.** Un agent de conformité et un opérateur de marketplace ne
  consultent pas les mêmes données, ni au même rythme.

C'est la même logique que celle appliquée à `VerificationLevel` dans ADR-0006 :
le Master des acteurs consomme un **résultat**, jamais le dossier qui y mène.

**Ce que le Master des acteurs garde.** La matrice d'éligibilité — quelle
nature peut tenir quel rôle, à quel niveau de vérification. Elle exprime une
**capacité**, pas une autorisation.

**Ce qui reste donc vrai, et qu'il faut assumer.** Un acteur peut détenir le
rôle `IMPORTER` sans qu'aucun code douane ne lui soit attaché, parce que rien
dans ce Master ne peut le savoir. La question « cet importateur est-il
réellement autorisé à dédouaner aujourd'hui ? » ne se pose pas ici et ne peut
pas y être répondue. Elle appartient au Compliance Master, et tout appelant qui
en dépend devra l'interroger.

### 2. `ProductionKind` est une catégorie économique, pas une filière

`ProductionKind` vaut `CROP`, `LIVESTOCK`, `FISHERY` ou `PROCESSING`. Rien de
plus fin.

**Ce que c'est.** La catégorie qui détermine le régime réglementaire et le
parcours d'enrôlement d'un producteur. Un pêcheur et un éleveur ne relèvent pas
des mêmes textes ; c'est une propriété de ce qu'est l'acteur.

**Ce que ce n'est pas.** Les filières précises — riz, maïs, café, anacarde,
mangue — ainsi que les variétés, les surfaces, les rendements, les calendriers
culturaux et les volumes. Tout cela appartient à l'Agriculture Master.

**Le test qui les sépare.** Une catégorie ne change qu'en changeant de métier ;
une filière change d'une saison à l'autre. Un producteur qui passe du maïs au
soja reste `CROP` ; celui qui abandonne la culture pour l'élevage change de
catégorie, et c'est un événement rare qui mérite d'être tracé.

`CROP` répond donc à « quelle espèce de producteur », jamais à « qu'est-ce
qu'il cultive ».

### 3. Les données opérationnelles appartiennent à leurs Masters

| Contexte               | Ce qu'il portera                                                |
| ---------------------- | --------------------------------------------------------------- |
| **Agriculture Master** | filières, variétés, parcelles, surfaces, rendements, saisons    |
| **Logistics Master**   | `Fleet`, `Vehicle`, `Driver`, `Warehouse`, capacités, corridors |
| **Finance Engine**     | encours, plafonds de crédit, échéanciers, scoring financier     |
| **Trust Engine**       | réputation, historique de litiges, score de confiance           |

Tous référencent `ActorId` sans dépendance inverse. **Le Master des acteurs ne
connaîtra aucun d'eux.** La direction du graphe est la garantie : elle empêche
qu'une évolution de la logistique impose une migration du registre.

Deux exclusions méritent d'être nommées, parce qu'elles ont été explicitement
demandées et qu'un lecteur pourrait s'étonner de leur absence :

**Aucun plafond de crédit sur `BuyerRole`.** Un encours est une décision
financière révisable, pas une propriété de l'acheteur. `Money` n'existe donc
pas dans ce package.

**Aucun score de confiance.** Un score est calculé à partir de comportements
observés ailleurs ; le stocker sur l'acteur en ferait une donnée figée dont
personne ne saurait dire quand elle a été rafraîchie.

## Conséquences

**Ce qu'on gagne.** Le Master des acteurs reste petit, stable et lisible. Il ne
bougera pas quand la logistique gagnera un type de véhicule ni quand la finance
changera de modèle de scoring. Son agrégat se charge en une requête et ses
tests tournent sans infrastructure.

**Ce qu'on perd, et c'est réel.** Aucune vue unique ne donne un acteur avec ses
habilitations, ses parcelles, sa flotte et son encours. Une interface qui doit
afficher « ce transporteur peut-il prendre cette course ? » devra interroger
au moins deux contextes et composer la réponse elle-même. Le coût se paie à
chaque lecture transverse, et il augmentera avec le nombre de Masters.

**Un risque à surveiller.** Tant que le Compliance Master n'existe pas,
l'éligibilité est vérifiée mais l'autorisation ne l'est nulle part. Un acteur
peut donc porter le rôle `IMPORTER` ou `FINANCIAL` sans qu'aucun système ne
détienne son code douane ou son agrément. **C'est une lacune fonctionnelle
assumée, pas un oubli**, et elle doit être connue de toute équipe qui
s'appuierait sur ces rôles avant l'arrivée du Compliance Master.

**Ce qui n'est pas décidé.** Le mécanisme par lequel un contexte interrogera un
autre — appel synchrone, projection locale alimentée par événements, ou vue
matérialisée — reste ouvert. Le choix dépendra des exigences de fraîcheur, qui
ne sont pas encore connues.
