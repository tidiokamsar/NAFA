# ADR-0013 — Table Outbox et écriture transactionnelle

- **Statut** : Acceptée
- **Date** : 2026-09-07
- **Ticket** : OUT-001
- **Complète** : [ADR-0008](0008-domain-event-buffer-and-outbox.md), dont elle
  livre la moitié restée sans implémentation.

## Contexte

ADR-0008 a décidé le tampon d'événements, `pullEvents()` qui vide, et le
principe que le repository persiste snapshot et événements dans la **même
transaction**. Elle a explicitement laissé ouverts « le schéma Outbox, son
relais, la politique de reprise et la rétention ».

Elle a aussi énoncé le risque qu'elle acceptait : « un adaptateur qui oublie
d'appeler `pullEvents()` perd les événements **en silence** : rien ne
l'avertit, aucun test du domaine ne peut l'attraper. »

C'était vrai à la lettre, et c'est resté vrai en pratique : au moment
d'écrire cette ADR, **aucun des six dépôts des quatre Masters n'appelait
`pullEvents()`**. Tous les événements produits depuis GEO-002 ont été perdus à
l'écriture.

## Décision 1 — une seule table, partagée

`outbox_events`, une table pour les quatre Masters. Un schéma, une base, et
donc un seul relais à écrire ensuite. Une table par Master aurait multiplié
par quatre le relais, la supervision et la purge sans rien acheter : les
événements ne sont pas plus isolés dans quatre files que dans une, puisque
c'est la même transaction qui les produit.

**Ce qu'on perd** : une file unique devient un point de contention si un
Master émet beaucoup plus que les autres. Aucun ne le fait aujourd'hui ; le
jour où c'est le cas, partitionner sur `aggregate` est une migration, pas une
refonte.

## Décision 2 — l'identifiant d'événement est la clé primaire

`outbox_events.id` **est** l'`eventId` que le domaine a généré. Pas de clé
technique séparée.

Un relais qui republie et un consommateur qui déduplique doivent s'accorder
sur une identité. ADR-0008 impose déjà aux consommateurs d'être idempotents
« sur `eventId` » — leur donner une autre clé aurait obligé à une table de
correspondance pour tenir cette promesse.

## Décision 3 — un événement par version d'agrégat, garanti par la base

`UNIQUE (aggregate, aggregateId, version)`.

Un agrégat avance sa version d'un cran par événement : le triplet est donc
unique par construction. L'inscrire comme contrainte transforme une propriété
du modèle en garantie du stockage — un dépôt qui écrirait deux fois le même
tampon vidé échoue bruyamment au lieu de dupliquer l'événement en aval.

Cette contrainte a payé dès son introduction. Elle a révélé que **cinq dépôts
sur six écrivaient `version: 1` en dur à l'insertion**, alors que les
fabriques émettent souvent deux événements — créer puis publier. La ligne
disait 1, l'agrégat comptait 2, et le chargement suivant rendait une version
que le domaine n'avait jamais produite. C'est le même défaut qu'ADR-0012 §3
avait corrigé sur le chemin de mise à jour, resté intact sur celui
d'insertion parce que rien ne le regardait.

## Décision 4 — `aggregateId` est du texte, pas un UUID

Première rédaction du schéma : `aggregateId String @db.Uuid`. Trois Masters
sur quatre s'en accommodaient.

`CountryProfile` est identifié par son code pays ISO. Un Outbox qui exigeait
un UUID refusait donc les événements d'un Master entier — et les refusait
**à l'intérieur de la transaction métier qui venait de les produire**, donc
en annulant l'écriture elle-même. Un journal technique ne doit pas rejeter un
événement pour une forme que le domaine n'a jamais promise.

`correlationId`, `causationId` et `tenantId` sont du texte pour la même
raison : `DomainEvent` les type `string` sans garantie de format.

## Décision 5 — pas de colonnes d'audit

`outbox_events` ne porte pas les six colonnes que toute table métier porte.
Ce n'est pas une entité métier : elle n'a pas d'auteur, n'est jamais supprimée
logiquement, et ses lignes sont consommées puis purgées plutôt que corrigées.

`version` y désigne la version de l'agrégat au moment de l'événement, pas un
compteur de concurrence optimiste — le seul endroit du schéma où ce mot change
de sens, ce qui justifie de le dire ici.

## Décision 6 — la garde contre l'oubli est une sonde de source

ADR-0008 disait qu'aucun test ne pouvait attraper un adaptateur qui oublie de
vider le tampon. C'est exact pour un test de domaine : rien du comportement de
l'agrégat ne change. Ce qui est vérifiable, c'est la source.

`packages/platform/src/outbox/outbox-drain.spec.ts` lit chaque dépôt des
Masters et échoue si l'un écrit un agrégat sans vider ses événements dans
l'Outbox, ou sans transaction. Elle assertit aussi qu'elle a bien trouvé au
moins six fichiers : une sonde verte qui n'inspecte rien est pire que pas de
sonde.

C'est une recherche textuelle, et elle l'assume. Elle passerait sur un dépôt
qui mentionne `pullEvents` en commentaire sans l'appeler. Les suites e2e
assertent que les lignes atterrissent vraiment ; la sonde, elle, existe pour
attraper un **nouveau** dépôt écrit par quelqu'un qui n'a pas lu ADR-0008.

**Ce qu'on perd** : un test qui connaît l'arborescence du dépôt. Il casse si
`services/masters/*/src/infrastructure/persistence/prisma/` bouge — ce qui
est le comportement voulu, mais il faudra le mettre à jour plutôt que le
supprimer.

## Non décisions

- **Le relais.** Rien ne publie encore. Les lignes s'accumulent avec
  `publishedAt IS NULL`, ce qui est un état correct et interrogeable, pas une
  panne. Sujet d'OUT-002 : politique de reprise, `FOR UPDATE SKIP LOCKED`,
  et le port de transport.
- **Le transport.** Aucun broker n'existe dans le dépôt. Redis est déjà là via
  `@nafa/platform` et ferait un premier adaptateur crédible, mais ADR-0008
  garde les Engines indépendants du transport : ce sera un port, décidé quand
  un consommateur existera.
- **La rétention.** Aucune purge. Une table qui ne se vide jamais est une
  dette, connue et datée d'ici.
- **L'ordre de publication.** Le relais n'existant pas, aucune garantie
  d'ordre n'est promise. `version` permet à un consommateur de détecter les
  trous ; c'est tout ce qui est offert aujourd'hui.
