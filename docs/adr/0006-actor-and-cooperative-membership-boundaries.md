# ADR-0006 — Frontières d'Actor et de CooperativeMembership

**Statut** : Acceptée — ACTOR-001
**Voir aussi** : [ADR-0002](0002-foundation-package-for-business-contracts.md), [ADR-0005](0005-domain-may-depend-on-the-shared-kernel.md)

## Contexte

ACTOR-001 devait modéliser les acteurs économiques de NAFA à partir d'une
liste : `Actor`, `Person`, `Company`, `Merchant`, `Wholesaler`, `Importer`,
`Producer`, `Transporter`, `Fleet`, `Driver`, `Warehouse`, `Buyer`, `Bank`,
`Cooperative`.

Cette liste mélange trois choses de nature différente :

| Catégorie                        | Éléments                                                                         |
| -------------------------------- | -------------------------------------------------------------------------------- |
| Ce que l'acteur **est** (nature) | `Person`, `Company`, `Cooperative`                                               |
| Ce que l'acteur **fait** (rôle)  | `Merchant`, `Wholesaler`, `Importer`, `Producer`, `Transporter`, `Buyer`, `Bank` |
| Ce que l'acteur **possède**      | `Fleet`, `Driver`, `Warehouse`                                                   |

Les traiter comme une seule hiérarchie d'héritage aurait été l'erreur
structurante — et irréversible une fois le schéma en base.

## Décision

### 1. `Actor` est la racine d'agrégat

`Actor` porte l'identité juridique, le statut, le niveau de vérification, les
points de contact, l'adresse et **l'ensemble des rôles**.

**Pourquoi une racine et non un simple enregistrement.** Un agrégat doit
posséder trois choses qu'une structure de données ne peut pas : les invariants
qui rendent un état légal, la `version` qui rend les écritures concurrentes
détectables, et le tampon d'événements produits par une mutation.
L'encapsulation est ce qui empêche d'assembler un `Actor` qu'aucune séquence
légale d'opérations n'aurait pu atteindre.

**Pourquoi les rôles sont un ensemble et non des sous-classes.** Une
coopérative de Kindia est simultanément productrice (elle cultive), acheteuse
(elle achète à ses membres) et souvent grossiste (elle revend en gros). Avec
`class Producer extends Actor`, il faut choisir une seule classe — le modèle
casse au premier acteur réel. Le changement de rôle deviendrait par ailleurs un
changement de type, donc une migration.

**Pourquoi l'identité juridique est immuable.** Changer de nature juridique
n'est pas une mise à jour : c'est une autre entité. Prétendre le contraire
réécrit silencieusement l'histoire d'un acteur. Le champ est `private readonly`
avec un accesseur en lecture seule, de sorte que l'immuabilité est structurelle
plutôt qu'une règle à retenir.

### 2. `CooperativeMembership` est un agrégat séparé

Il détient `cooperativeId: ActorId` et `memberId: ActorId`, jamais un objet
`Actor`.

**Pourquoi pas une collection dans `Actor`.** Une coopérative peut compter des
milliers de membres. Les loger dans l'agrégat imposerait de charger tout le
rôle pour corriger un numéro de téléphone — un coût permanent — et deux mises à
jour sans rapport métier (une adhésion, une correction de contact) entreraient
en conflit sur un seul compteur de version. Un agrégat définit une frontière de
cohérence transactionnelle ; l'adhésion et le contact n'en partagent aucune.

**Pourquoi la référence est un identifiant.** C'est la règle qui garde les deux
agrégats chargeables et cohérents indépendamment. Elle a un coût assumé : les
natures des deux acteurs doivent être **passées** à `admit()` plutôt que
récupérées, car un agrégat qui irait chercher un dépôt en aurait besoin d'un —
ce que référencer par identifiant existe précisément pour éviter.

**Pourquoi deux fins distinctes.** `RESIGNED` et `EXCLUDED` sont deux faits
différents sur une personne. Un état `ENDED` unique perdrait lequel s'est
produit dès l'écriture de la ligne, et c'est exactement la question posée
ensuite dans un litige coopératif.

### 3. `Fleet`, `Driver`, `Vehicle` et `Warehouse` restent au futur Logistics Master

Aucun des quatre n'est un acteur économique : un entrepôt est un **lieu**, une
flotte une **collection de véhicules**, un chauffeur une **personne habilitée
à conduire pour un transporteur**.

Ils référenceront `ActorId` — `operatedBy`, `ownedBy`, `employedBy` — sans
dépendance inverse. Le Master des acteurs ne connaîtra jamais la logistique.

**Pourquoi cette séparation plutôt que des agrégats ici.** Ce sont des données
**opérationnelles** : elles bougent avec l'activité, pas avec l'identité. Le
critère appliqué à tout ce sprint est le suivant :

> Cette donnée change-t-elle avec l'activité, ou seulement si l'acteur change
> de métier ?

La surface cultivée change chaque saison, la taille d'une flotte change chaque
mois : opérationnel. Être éleveur plutôt que pêcheur ne change qu'en changeant
de métier : qualification, donc ici.

Ce critère est aussi ce qui a vidé les rôles de leurs champs opérationnels —
filières, capacité d'entreposage, zones de distribution, corridors — qu'une
première version du modèle y avait placés.

**Un cas mérite d'être explicité.** `Driver` est bien une `Person`, donc un
`Actor`. Mais « conduire pour un transporteur » est une **habilitation**, pas
une identité. Le séparer permet à un chauffeur de changer d'employeur sans que
son identité juridique soit touchée.

### 4. La conformité reste séparée

`VerificationLevel` est un **niveau** — `NONE < BASIC < ENHANCED` — et rien de
plus. Ce que le dossier contient, qui l'a examiné, quand, avec quelles pièces
et pour quelle durée n'appartient pas au Master des acteurs.

**Pourquoi.** Trois raisons distinctes :

- **Cycle de vie.** Un dossier de conformité se périme, se réexamine et
  s'archive selon des règles propres, sans rapport avec le cycle de vie
  commercial de l'acteur.
- **Sensibilité.** Pièces d'identité, justificatifs de domicile et documents
  bancaires ont des exigences de conservation et d'accès que le registre des
  acteurs n'a pas. Les mêler obligerait à traiter tout le Master au niveau de
  protection du document le plus sensible.
- **Volume.** Le dossier est bien plus lourd que l'acteur, et il est lu par
  d'autres personnes, à d'autres moments.

Le Master des acteurs consomme donc un **résultat** — le niveau atteint — et
non le raisonnement qui y mène.

`VerificationLevel` est par ailleurs un axe **distinct** d'`ActorStatus`. Un
acteur peut rester `ACTIVE` en `BASIC` indéfiniment : il commerce légitimement
sans jamais importer ni être un établissement financier. Fusionner les deux
énumérations paraîtrait plus simple et interdirait ce cas parfaitement
ordinaire.

## Conséquences

**Ce qu'on gagne.** Les combinaisons illégales deviennent inconstructibles
plutôt que détectables : une personne physique importatrice, une coopérative
banque, une société en forme coopérative, une adhésion d'une coopérative à
elle-même. Le domaine se teste sans conteneur, sans base et sans serveur — 214
tests en quelques secondes.

**Ce qu'on perd.** Répondre à « qui sont les membres de cette coopérative ? »
demande deux chargements au lieu d'un, et il n'existe aucun endroit unique
donnant un acteur avec sa flotte, ses entrepôts et son dossier de conformité.
Une vue de lecture devra les recomposer. C'est le prix de frontières de
cohérence étroites, et il se paie à chaque lecture transverse.

**Ce qui n'est pas décidé.** Les habilitations réglementaires — code douane,
licence de transport, agrément BCRG — sont hors périmètre d'ACTOR-001. La
matrice d'éligibilité dit _qui peut_ tenir un rôle ; rien n'atteste aujourd'hui
qu'un acteur y est _autorisé_ en pratique. Leur place, ici ou dans le contexte
conformité, reste ouverte.

**Un point de migration connu.** `Address.region` est une chaîne libre. Elle
deviendra une référence vers le futur Geography Master. Une chaîne qu'un agent
de terrain peut remplir vaut mieux qu'une clé étrangère vers une table que
personne n'a construite.
