# ADR-0014 — API HTTP de lecture des Masters de référence

- **Statut** : Acceptée
- **Date** : 2026-09-07
- **Ticket** : API-001
- **Complète** : [ADR-0001](0001-ddd-layering-for-services.md) (découpage en
  quatre couches), et lève la non-décision « aucune API HTTP » d'ADR-0009,
  ADR-0010, ADR-0011 et ADR-0012.

## Contexte

Les quatre Masters s'arrêtaient aux adaptateurs. Aucun n'exposait quoi que ce
soit : 47 zones administratives et 26 produits importés que rien ne permettait
de lire, et un seul service du dépôt — `@nafa/iam` — avec une couche `api/`.

Ce ticket ouvre les deux Masters de **référence** en lecture. Trade et Actor
portent des écritures et une question d'identité ; ils viendront après.

## Décision 1 — la lecture d'abord, sur les deux Masters de référence

Geography et Products. Ce sont les seuls dont les données existent déjà, et
les seuls dont l'exposition ne pose pas de question d'autorisation.

**Ce qu'on perd** : l'API ne fait rien écrire. Elle ne démontre donc pas la
chaîne complète cas d'usage → agrégat → dépôt, seulement sa moitié lecture.

## Décision 2 — pas de mapper d'erreurs, le filtre global apprend `NafaError`

IAM traduit ses échecs applicatifs en `HttpException` dans un
`auth-error.mapper.ts`. Les Masters n'en ont aucun, et c'est délibéré.

Le noyau partagé savait déjà tout ce qu'il faut : `NafaError` porte `code` et
`status`, et `ERROR_CODE_STATUS` mappe les seize codes —
`VALIDATION_FAILED` → 400, `NOT_FOUND` → 404, `STALE_VERSION` → 409,
`BUSINESS_RULE_VIOLATION` → 422. Chaque `RuleViolation` des quatre Masters en
hérite.

Ce qui manquait était le dernier maillon : `AllExceptionsFilter` ne
connaissait que `HttpException`. Une violation de règle qui l'atteignait
devenait un **500 générique**, `status` et `code` jetés — une défaillance bien
modélisée devenait indistinguable d'un plantage.

Le filtre lit désormais les deux familles. Le `code` est renvoyé dans la
réponse pour qu'un client branche sur la règle plutôt que sur la prose.

`details` n'est **pas** renvoyé. Le domaine y met ce qu'il veut, et un filtre
est le mauvais endroit pour décider ce qui est publiable.

**Ce qu'on perd** : quatre Masters dépendent maintenant d'un comportement du
filtre. Deux tests gardent la règle des 5xx — un `NafaError` en
`INTERNAL_ERROR` reste un 500 muet, connaître le type ne devient pas une
fuite.

## Décision 3 — aucune authentification sur ces lectures

Les divisions administratives et le catalogue produits sont des **données de
référence publiques**. Les mettre derrière un jeton que seul IAM sait émettre
bloquerait tout consommateur sans rien protéger.

Les écritures, elles, en exigeront un. Ce n'est pas une omission qu'on
régularisera : c'est une frontière, et elle passe entre lecture de référence
et mutation.

**Ce qu'on perd** : ces routes sont ouvertes. La limitation de débit de
`@nafa/platform` s'y applique, mais rien d'autre. Un déploiement public devra
décider s'il veut une limite plus stricte devant.

## Décision 4 — un test de câblage par service

Ce ticket a découvert que **les quatre Masters ne pouvaient pas démarrer**.

Les six dépôts importaient leurs jetons d'injection en `type` :

```ts
import { StaleVersionError, type Clock, type IdGenerator } from '@nafa/shared';
```

TypeScript efface un import `type`. `emitDecoratorMetadata` enregistre donc
`Function` au lieu de la classe, et Nest n'a aucun jeton :

```
Nest can't resolve dependencies of the PrismaProductRepository
(PrismaService, ?, Function)
```

Ça compile, ça passe le typecheck, ça build, ça passe les e2e d'adaptateurs —
et l'application ne démarre pas.

Rien ne l'avait vu parce que **rien ne démarrait jamais ces modules** : les
suites e2e existantes construisent les dépôts à la main avec `new`, ce qui
contourne l'injection. Le premier test HTTP de ce ticket est la première chose
du dépôt à appeler `Test.createTestingModule({ imports: [AppModule] })` sur un
Master.

IAM a ce test depuis le Sprint 0. Son commentaire nomme exactement cette
classe de défaut : « la seule classe de défaut que ni `tsc` ni le build ne
peuvent voir ». Il était protégé ; les quatre Masters ne l'étaient pas.

Chaque Master a désormais son `app.module.spec.ts`. Il tourne dans `nx test`,
sans Postgres ni Redis, donc à chaque poussée.

## Décision 5 — une forme de réponse propre, jamais le snapshot

`ProductResponse`, `AreaResponse`, `CountryResponse`. Trois raisons, aucune
n'étant du cérémonial :

- `version` est un compteur de concurrence optimiste. Le publier invite un
  client à raisonner dessus, et l'API ne promet rien à son sujet.
- un snapshot change quand le domaine change. Une réponse qui _est_ le
  snapshot transforme chaque renommage interne en rupture pour tous les
  consommateurs.
- les types marqués (`ProductId`, `AreaCode`) sont des chaînes sur le fil ; le
  dire une fois ici vaut mieux que de convertir à chaque appel.

## Décision 6 — pas de liste sans filtre

`GET /products` et `GET /areas` sans filtre renvoient une liste **vide**, pas
le catalogue entier.

Une lecture non bornée est une décision que cette API n'a pas prise : il n'y a
pas de pagination, et 26 produits aujourd'hui ne disent rien de ce que la
table contiendra. Renvoyer vide est explicite ; renvoyer tout serait un
engagement pris par inadvertance.

`country` est en revanche **obligatoire** sur la recherche de zones : un code
est unique par pays et par niveau, et les noms se répètent d'une frontière à
l'autre. Une recherche sans pays balaierait tous les pays ou en choisirait un
en silence.

## Non décisions

- **Aucune écriture.** Pas de POST, pas de PATCH. La question de
  l'autorisation se pose avec elles, pas avant.
- **Aucune pagination.** Elle deviendra nécessaire avant que les listes ne
  grossissent ; la renvoyer vide sans filtre est ce qui achète ce délai.
- **Trade et Actor n'ont pas d'API.** Ils gardent leur test de câblage, qui
  était le vrai enjeu, mais aucune route.
- **Aucun cache.** `@nafa/platform` fournit un cache Redis que ces lectures
  n'utilisent pas. Des données de référence quasi immuables sont le cas d'école
  d'un cache, et c'est précisément pour ça que ça mérite sa propre décision.
