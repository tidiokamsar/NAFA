# ADR-0005 — Le domaine peut dépendre du noyau partagé

**Statut** : Acceptée — ACTOR-001
**Voir aussi** : [ADR-0002](0002-foundation-package-for-business-contracts.md), [ADR-0004](0004-enforce-architecture-boundaries-with-nx-tags.md)

## Contexte

ADR-0004 a posé `layer:domain → onlyDependOnLibsWithTags: []` : le domaine ne
dépend de rien. Elle annonçait aussi le moment où cette règle serait mise à
l'épreuve :

> La première fois que `foundation` aura besoin d'un utilitaire de `shared`, ce
> sera un arbitrage explicite — soit dupliquer l'utilitaire, soit ouvrir la
> règle et le documenter ici.

Ce moment est ACTOR-001. Construire le Master des acteurs économiques suppose
d'émettre des événements de domaine, de renvoyer des échecs de règle métier, de
typer des identifiants de façon nominale et de rendre le temps injectable.
`@nafa/shared` fournit déjà les quatre : `DomainEvent` et `buildDomainEvent`,
`Result` / `ok` / `err`, `Brand<T, K>`, `Clock` et `IdGenerator`.

Ce n'est pas une coïncidence. La docstring de `DomainEvent` prend
`actor.registered` et `Actor` comme exemples : ces primitives ont été écrites
pour un domaine qui n'existait pas encore.

## Décision

Autoriser `layer:domain` à dépendre de `layer:util`, et de rien d'autre.

```js
{
  sourceTag: 'layer:domain',
  onlyDependOnLibsWithTags: ['layer:util'],
}
```

**Pourquoi ce n'est pas un affaiblissement.** La règle de ADR-0004 protège une
propriété précise, énoncée dans son commentaire : « dépendre de quoi que ce
soit ferait entrer une technologie dans la définition du domaine ». Or
`@nafa/shared` est **sans aucune dépendance runtime** — pas de NestJS, pas de
Prisma, pas de HTTP, pas d'accès disque ou réseau. C'est une contrainte
affichée dans son README et vérifiée par son propre `layer:util` qui ne dépend
de rien. Importer `shared` depuis le domaine n'y fait entrer aucune
technologie : la propriété protégée reste intacte.

La règle interdisait donc plus que ce que sa raison d'être exigeait.

**Pourquoi pas dupliquer.** L'alternative était de redéfinir `Result`,
`DomainEvent`, `Brand` et la hiérarchie `NafaError` dans `foundation`. Deux
définitions de la même chose divergent — c'est une question de temps, pas de
discipline. Et la divergence serait invisible : deux `Result` structurellement
compatibles compilent ensemble jusqu'au jour où l'un gagne un champ.

**Ce qui reste interdit.** `layer:platform`, `layer:client`, `layer:service`,
`layer:app`. Le domaine ne connaît toujours ni la configuration, ni les logs,
ni la santé, ni Redis, ni un client HTTP. La direction du graphe est inchangée
partout ailleurs.

## Conséquences

**Ce qu'on gagne.** Une seule définition de l'échec métier (`Result`), de
l'événement de domaine, de l'identifiant nominal et des ports temporels. Le
domaine devient testable de façon déterministe sans geler d'horloge globale,
puisque `Clock` et `IdGenerator` s'injectent.

**Ce qu'on perd.** `@nafa/foundation` cesse d'être un package sans aucune
dépendance. Sa promesse devient « aucune dépendance **technique** », ce qui est
plus faible et plus difficile à vérifier d'un coup d'œil : il faut savoir que
`shared` est lui-même vide de dépendances pour que la garantie tienne. Cette
ADR est ce qui rend ce raisonnement explicite plutôt que tacite.

**Le risque à surveiller.** `@nafa/shared` devient un point de passage
privilégié. La tentation sera d'y déposer ce qui ne trouve pas sa place
ailleurs — un client HTTP « léger », un helper de sérialisation — et de le
faire entrer dans le domaine par la porte ouverte ici. La contrepartie de cette
ADR est que toute addition à `shared` doit rester sans dépendance runtime. Le
jour où ce ne sera plus vrai, cette décision devra être rouverte.

**Ce qui n'est pas décidé.** L'axe `scope:*` reste non contraint, comme dans
ADR-0004.

## Validation

Vérifié en introduisant volontairement une violation, puis en la retirant :

- `@nafa/foundation` important `@nafa/shared` → accepté ;
- `@nafa/foundation` important `@nafa/platform` → refusé :
  _A project tagged with "layer:domain" can only depend on libs tagged with
  "layer:util"_.
