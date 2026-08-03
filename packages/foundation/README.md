# @nafa/foundation

Contrats mÃ©tier partagÃ©s de NAFA : modÃ¨les de domaine, agrÃ©gats, rÃ¨gles, et
**ports** que les services implÃ©mentent cÃ´tÃ© infrastructure.

**Aucune dÃ©pendance technique.** Pas de NestJS, pas de Prisma, pas de HTTP,
pas d'accÃ¨s disque ou rÃ©seau. La seule dÃ©pendance est `@nafa/shared`, elle-mÃªme
sans dÃ©pendance runtime â€” c'est ce qui permet Ã  cette rÃ¨gle de tenir. Voir
[ADR-0005](../../docs/adr/0005-domain-may-depend-on-the-shared-kernel.md).

ConcrÃ¨tement : ce package se teste sans conteneur, sans base et sans serveur.
Ses 234 tests tournent en quelques secondes.

## Ce qu'on y trouve

| Contexte   | Contenu                                                          |
| ---------- | ---------------------------------------------------------------- |
| `identity` | `IdentityUser`, port du dÃ©pÃ´t d'identitÃ©s techniques (IAM)    |
| `actor`    | Le Master des acteurs Ã©conomiques â€” l'essentiel de ce package |

## `foundation` face Ã  `shared` et `platform`

| Package      | Question Ã  laquelle il rÃ©pond                                    |
| ------------ | ------------------------------------------------------------------ |
| `shared`     | Â« de quoi tout code a besoin Â» â€” `Result`, erreurs, pagination |
| `platform`   | Â« comment un service NestJS dÃ©marre Â» â€” config, logs, santÃ©  |
| `foundation` | Â« ce que le mÃ©tier NAFA manipule Â» â€” modÃ¨les, rÃ¨gles, ports |

Le critÃ¨re de tri : si une chose disparaÃ®trait en changeant de framework, elle
va dans `platform` ; si elle survivrait Ã  un changement de mÃ©tier, elle va dans
`shared` ; si elle dÃ©crit le mÃ©tier lui-mÃªme, elle va ici.

## Domaine et ports

```
src/actor/domain/
├── actor.aggregate.ts          racine d'agrégat
├── identity/                   qui l'acteur est
├── roles/                      ce qu'il peut faire
├── membership/                 second agrégat
├── ports/                      contrats de persistance métier
├── value-objects/              les valeurs, toutes validées
├── services/                   règles qui dépassent un agrégat
└── factories/                  la seule porte d'entrée
```

Les ports appartiennent au domaine car ils expriment ses questions métier. Ils
ne contiennent aucune implémentation : un adaptateur Prisma, un client HTTP ou
un cache appartient au service qui les branche. Le domaine dépend seulement de
ces contrats et de `@nafa/shared`.

## Actor

```ts
const actor = await factory.createPerson({
  givenNames: 'Mamadou Alpha',
  familyName: 'Diallo',
  birthDate: '1985-03-17',
  nationality: 'GN',
  contacts: { phones: ['+224 620 00 00 00'] },
  address: { locality: 'Conakry', region: 'Conakry', countryCode: 'GN' },
});
```

`Actor` est une **classe**, alors que tout le reste du package est fonctionnel.
Un agrÃ©gat doit possÃ©der trois choses qu'un enregistrement ne peut pas : les
invariants qui rendent un Ã©tat lÃ©gal, la `version` qui rend les Ã©critures
concurrentes dÃ©tectables, et le tampon d'Ã©vÃ©nements produits par une mutation.

Toute mutation renvoie `Result<void, ActorRuleViolation>` â€” une rÃ¨gle mÃ©tier
refusÃ©e est une issue **attendue**, pas une exception.

| Attribut       | Type                | Note                                                    |
| -------------- | ------------------- | ------------------------------------------------------- |
| `id`           | `ActorId`           | UUID nominal                                            |
| `identity`     | `LegalIdentity`     | **immuable aprÃ¨s crÃ©ation**                           |
| `status`       | `ActorStatus`       | `DRAFT â†’ PENDING â†’ ACTIVE â‡„ SUSPENDED â†’ CLOSED` |
| `verification` | `VerificationLevel` | `NONE < BASIC < ENHANCED`                               |
| `contacts`     | `ContactPoint[]`    | au moins un                                             |
| `address`      | `Address`           | â€”                                                     |
| `roles`        | `ActorRole[]`       | un ensemble, jamais une hiÃ©rarchie                     |
| `version`      | `number`            | concurrence optimiste                                   |

`status` et `verification` sont **deux axes distincts**, volontairement. Un
acteur peut rester `ACTIVE` en `BASIC` indÃ©finiment : il commerce lÃ©gitimement
sans jamais importer. Les fusionner paraÃ®trait plus simple et interdirait ce
cas parfaitement ordinaire.

`CLOSED` n'a aucune transition sortante. Rouvrir un acteur montrerait une vie
continue lÃ  oÃ¹ il y en a eu deux.

## LegalIdentity â€” ce que l'acteur _est_

Une **union fermÃ©e**, pas une hiÃ©rarchie de classes :

| Variante              | Registre                              | Identifiants             |
| --------------------- | ------------------------------------- | ------------------------ |
| `PersonIdentity`      | â€”                                   | nom, naissance, NIF opt. |
| `CompanyIdentity`     | RCCM                                  | RCCM + NIF               |
| `CooperativeIdentity` | Registre des sociÃ©tÃ©s coopÃ©ratives | RSCoop + NIF             |

Les trois natures ne sont pas des variations l'une de l'autre : elles relÃ¨vent
de textes diffÃ©rents et de registres diffÃ©rents. Une union discriminÃ©e oblige
le compilateur Ã  faire traiter les trois cas ; une classe de base commune ne
l'oblige Ã  rien.

RÃ©fÃ©rentiel retenu : **OHADA**, dont la GuinÃ©e est membre. Les formes
coopÃ©ratives (`SCOOPS`, `SCOOPCA`) et les formes de sociÃ©tÃ© sont mutuellement
exclusives â€” construire une `CompanyIdentity` en `SCOOPS` est refusÃ©.

## Economic Roles â€” ce que l'acteur _fait_

Un **ensemble** attachÃ© Ã  l'acteur. Une coopÃ©rative de Kindia est
simultanÃ©ment productrice, acheteuse et grossiste ; un hÃ©ritage forcerait un
seul choix et casserait au premier acteur rÃ©el.

| RÃ´le         | Person | Company | Cooperative | VÃ©rification | Qualification      |
| ------------- | :----: | :-----: | :---------: | ------------- | ------------------ |
| `PRODUCER`    |  âœ…   |   âœ…   |     âœ…     | `BASIC`       | `ProductionKind[]` |
| `MERCHANT`    |  âœ…   |   âœ…   |     âœ…     | `BASIC`       | â€”                |
| `WHOLESALER`  |  âœ…   |   âœ…   |     âœ…     | `BASIC`       | â€”                |
| `BUYER`       |  âœ…   |   âœ…   |     âœ…     | `BASIC`       | â€”                |
| `TRANSPORTER` |  âœ…   |   âœ…   |     âœ…     | `BASIC`       | `TransportMode[]`  |
| `IMPORTER`    |   âŒ   |   âœ…   |     âœ…     | `ENHANCED`    | â€”                |
| `FINANCIAL`   |   âŒ   |   âœ…   |     âŒ      | `ENHANCED`    | `InstitutionKind`  |

Un rÃ´le exprime **une capacitÃ©, une condition d'Ã©ligibilitÃ© et un niveau de
vÃ©rification requis** â€” rien d'autre. Surface cultivÃ©e, tonnage, flotte,
entrepÃ´ts et encours appartiennent Ã  d'autres Masters.

Trois rÃ´les portent une qualification, quatre non. Une qualification rÃ©pond Ã 
Â« de quelle espÃ¨ce est ce rÃ´le Â» et ne change qu'en changeant de mÃ©tier.
Inventer un champ pour les quatre autres, par symÃ©trie, serait inventer de la
donnÃ©e.

**`InstitutionKind` est la distinction la plus lourde du package.** En GuinÃ©e,
Orange Money et MTN MoMo sont des **EMI** â€” Ã©tablissements de monnaie
Ã©lectronique â€” et non des banques : agrÃ©ment BCRG diffÃ©rent, plafonds
diffÃ©rents, obligations diffÃ©rentes.

`RoleEligibilityPolicy` est une **fonction pure** sur des donnÃ©es simples. Elle
dÃ©tient la matrice en un seul endroit, ce qui empÃªche une rÃ¨gle de diverger
entre la fabrique et l'agrÃ©gat, et se teste exhaustivement sans rien construire.

## CooperativeMembership â€” un agrÃ©gat sÃ©parÃ©

```ts
const membership = await membershipFactory.create({ cooperative, member });
```

Il dÃ©tient **deux `ActorId` et jamais un `Actor`**. Une coopÃ©rative peut
compter des milliers de membres : les loger dans `Actor` obligerait Ã  charger
tout le rÃ´le pour corriger un numÃ©ro de tÃ©lÃ©phone, et deux mises Ã  jour sans
rapport entreraient en conflit sur un seul compteur de version.

`RESIGNED` et `EXCLUDED` sont distincts et terminaux. Partir de son plein grÃ©
et Ãªtre radiÃ© sont deux faits diffÃ©rents sur une personne ; un `ENDED` unique
perdrait lequel s'est produit â€” exactement la question posÃ©e dans un litige.
Une rÃ©admission est une **nouvelle** adhÃ©sion, avec son propre identifiant.

Hors pÃ©rimÃ¨tre : parts sociales, cotisations, assemblÃ©es gÃ©nÃ©rales, documents
statutaires. Voir [ADR-0006](../../docs/adr/0006-actor-and-cooperative-membership-boundaries.md).

## Domain Events

Convention `<agrÃ©gat>.<verbe au passÃ©>`, dÃ©jÃ  en vigueur dans `@nafa/shared`.

| `Actor` (12)                                                | `CooperativeMembership` (3)       |
| ----------------------------------------------------------- | --------------------------------- |
| `registered` Â· `submitted-for-verification` Â· `activated` | `cooperative-membership.admitted` |
| `verification-upgraded` Â· `verification-revoked`           | `cooperative-membership.resigned` |
| `role-granted` Â· `role-revoked`                            | `cooperative-membership.excluded` |
| `contact-changed` Â· `address-changed`                      |                                   |
| `suspended` Â· `reactivated` Â· `closed`                    |                                   |

Deux propriÃ©tÃ©s valent d'Ãªtre connues :

**Un point de passage unique.** Toute mutation passe par un `record()` privÃ©
qui incrÃ©mente la version **puis** met l'Ã©vÃ©nement en tampon. Â« Une mutation,
une version, au moins un Ã©vÃ©nement Â» est donc structurel, pas une rÃ¨gle que
chaque mÃ©thode doit se rappeler. L'Ã©vÃ©nement porte la version _aprÃ¨s_ le
changement, ce qui permet Ã  un consommateur d'ordonner un flux et d'y repÃ©rer
un trou.

**Aucune donnÃ©e personnelle dans les charges utiles.** L'Ã©vÃ©nement de contact
annonce les canaux et leur nombre, jamais les valeurs ; celui d'adresse, la
rÃ©gion et le pays. Un flux d'Ã©vÃ©nements est recopiÃ© dans des endroits oÃ¹ un
numÃ©ro de tÃ©lÃ©phone n'a rien Ã  faire.

`pullEvents()` **vide** le tampon plutÃ´t que de l'exposer : publier deux fois
est pire que ne pas publier.

## Factories

`ActorFactory.createPerson() / createCompany() / createCooperative()` et
`CooperativeMembershipFactory.create()`.

Elles prennent des **chaÃ®nes brutes**, pas des value objects. Accepter des VO
dÃ©jÃ  construits obligerait l'appelant Ã  les construire â€” et un appelant capable
d'en construire est capable d'en construire la moitiÃ© et de s'arrÃªter, ce qui
est prÃ©cisÃ©ment l'objet invalide que la fabrique existe pour empÃªcher. Prendre
l'entrÃ©e brute fait de Â« tout acteur du registre a Ã©tÃ© validÃ© Â» une propriÃ©tÃ©
du code plutÃ´t qu'une convention.

Elles reÃ§oivent `IdGenerator` et `Clock` de `@nafa/shared`, ce qui rend les
tests dÃ©terministes sans geler d'horloge globale. **L'identifiant n'est tirÃ©
qu'aprÃ¨s toutes les validations** : un enregistrement refusÃ© n'en consomme
aucun, donc la sÃ©quence ne se troue pas.

Ã€ savoir : un seul `IdGenerator` sert deux espaces d'identifiants. Un
enregistrement en consomme **deux** â€” un pour l'`ActorId`, un pour l'Ã©vÃ©nement.

## Repository Ports

| Port                              | Jeton                               |
| --------------------------------- | ----------------------------------- |
| `ActorRepository`                 | `ACTOR_REPOSITORY`                  |
| `CooperativeMembershipRepository` | `COOPERATIVE_MEMBERSHIP_REPOSITORY` |
| `IdentityUserRepository`          | `IDENTITY_USER_REPOSITORY`          |

Un port est une interface **plus un jeton d'injection**. Le jeton est un
`Symbol` : une chaÃ®ne peut entrer en collision entre modules, un `Symbol` non.
Le prix Ã  payer est que NestJS ne peut plus rÃ©soudre le port par infÃ©rence de
type â€” chaque injection porte un `@Inject(...)` explicite.

Le jeton vit Ã  cÃ´tÃ© de l'interface, jamais dans le service : sinon deux
services implÃ©mentant le mÃªme port inventent deux jetons diffÃ©rents, et plus
rien n'est substituable.

`ActorRepository` expose des recherches par RCCM, NIF et tÃ©lÃ©phone pour une
seule raison : l'unicitÃ© sur le registre ne peut pas Ãªtre vÃ©rifiÃ©e par un
agrÃ©gat, qui ne voit que lui-mÃªme.

### Concurrence optimiste

Les deux ports d'écriture ont **la même signature**, délibérément :

```ts
save(actor: Actor, expectedVersion: number): Promise<void>;
save(membership: CooperativeMembership, expectedVersion: number): Promise<void>;
```

Deux contrats divergents laisseraient croire qu'un agrégat a besoin d'un
contrôle de concurrence et l'autre non. Les deux en ont besoin : un membre
qui démissionne pendant qu'un administrateur le radie est exactement la
course que cela attrape.

L'appelant passe l'`expectedVersion` de l'agrégat — **la version au
chargement**, figée — et non `version`, qui a déjà bougé au moment de
l'écriture. Zéro signifie que l'objet n'a jamais été stocké, ce qui distingue
un insert d'un update sans seconde question.

Le paramètre est dans la signature plutôt que lu depuis l'agrégat : un
adaptateur qui ne le voit jamais est un adaptateur qui écrase silencieusement
les écritures concurrentes, sans que rien n'échoue.

## Services de domaine

**`ActorUniquenessChecker`** â€” RCCM et NIF uniques. C'est un contrÃ´le, pas un
verrou : deux enregistrements concurrents peuvent passer tous les deux, et
l'index unique en base tranche en dernier. Le vÃ©rifier ici transforme le cas
courant en refus mÃ©tier lisible plutÃ´t qu'en violation de contrainte remontant
trois couches plus haut.

Le **numÃ©ro de tÃ©lÃ©phone n'est dÃ©libÃ©rÃ©ment pas unique**. Partager un combinÃ©
est ordinaire ici : un producteur s'enregistre sur le tÃ©lÃ©phone d'un parent, un
agent enrÃ´le vingt membres depuis une seule ligne. Une rÃ¨gle dure rendrait ces
personnes non enrÃ´lables â€” un Ã©chec plus grave qu'un doublon. La collision est
rapportÃ©e par `findPhoneNumberCollisions()`, et l'appelant dÃ©cide.

**`CooperativeMembershipService`** â€” l'admission engage deux agrÃ©gats, et
l'unicitÃ© d'une adhÃ©sion active porte sur toute la collection. Aucun agrÃ©gat ne
voit ses frÃ¨res : c'est ce qui en fait un service plutÃ´t qu'une mÃ©thode.

## Limites connues

- **Aucune habilitation rÃ©glementaire.** Code douane, licence de transport,
  agrÃ©ment BCRG : la matrice dit _qui peut_ tenir un rÃ´le, rien n'atteste qu'il
  y est _autorisÃ©_ en pratique. ReportÃ©.
- **`Address.region` est une chaÃ®ne libre** â€” elle deviendra une rÃ©fÃ©rence vers
  le futur Geography Master. C'est le point de migration connu de ce contexte.
- **Pas de fusion ni de dÃ©duplication.** `ActorUniquenessChecker` empÃªche la
  crÃ©ation d'un doublon ; il ne rÃ©concilie rien d'existant.
- **Le lien `User` (IAM) â†” `Actor` n'est pas modÃ©lisÃ©.** C'est un rattachement,
  pas une identitÃ©.

## Tests

```bash
pnpm exec nx run @nafa/foundation:test
```

**234 tests**, sans aucune infrastructure. Les doubles de repository sont
Ã©crits Ã  la main plutÃ´t que gÃ©nÃ©rÃ©s : un Ã©chec pointe alors vers une rÃ¨gle
mÃ©tier et non vers une attente de mock non satisfaite.
