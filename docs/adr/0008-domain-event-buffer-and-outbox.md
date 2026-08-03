# ADR-0008 — Tampon d'événements de domaine et future Outbox

**Statut** : Acceptée — ACTOR-001
**Voir aussi** : [ADR-0003](0003-ports-and-adapters-for-persistence.md), [ADR-0006](0006-actor-and-cooperative-membership-boundaries.md)

## Contexte

`Actor` et `CooperativeMembership` produisent un événement de domaine à chaque
mutation acceptée. Ils doivent rester purs : ils ne connaissent ni broker, ni
base de données, ni mécanisme de publication.

Publier directement depuis l'agrégat rendrait la publication non atomique avec
la persistance, et les deux ordres possibles échouent chacun à leur façon. Une
écriture réussie suivie d'un échec de publication perd l'événement ; l'ordre
inverse publie un événement pour une écriture qui n'a jamais abouti.

## Décision

Chaque agrégat conserve ses événements non publiés dans un tampon privé.
`pullEvents()` les remet à l'appelant **et vide le tampon**, de sorte qu'un même
objet ne puisse pas les republier par accident.

Le repository est responsable de persister le snapshot et les événements dans
la **même transaction**. Une implémentation future écrira une ligne Outbox par
événement, qu'un relais technique publiera ensuite avec reprise et
déduplication.

Le domaine ne publie rien et ne dépend d'aucune infrastructure. Son contrat se
limite aux snapshots, aux versions attendues et aux événements rendus par
`pullEvents()`.

## Conséquences

**Ce qu'on gagne.** La mutation et son événement restent cohérents sans que
Kafka, RabbitMQ ou une transaction distribuée n'entrent dans le domaine.

**Ce que le repository doit faire.** Écrire avec la version attendue, persister
les événements tirés du tampon, et ne confirmer qu'une fois les deux acquis.

**Ce que le domaine ne garantit pas.** Une livraison exactement-une-fois. Les
consommateurs doivent rester idempotents et dédupliquer sur `eventId`.

**Ce qu'on perd.** Un adaptateur qui oublie d'appeler `pullEvents()` perd les
événements **en silence** : rien ne l'avertit, aucun test du domaine ne peut
l'attraper. C'est la contrepartie directe du fait que le domaine ne publie
rien lui-même, et c'est le point à vérifier en revue du premier adaptateur.

**Ce qui reste à faire.** Définir le schéma Outbox, son relais, la politique de
reprise et la rétention — dans la couche infrastructure, quand un service Actor
existera.

## Flux visé

```text
cas d'usage → agrégat → repository (transaction : snapshot + Outbox)
            → relais → broker → consommateurs
```

## Hors périmètre

Kafka, RabbitMQ, un client SQL, un publisher et un worker ne sont pas
introduits par cette ADR. Ce sont des adaptations d'infrastructure futures, pas
des responsabilités du Master des acteurs.

Cette décision garde aussi les Engines indépendants du transport : ils
consommeront un contrat d'événement stable, jamais une implémentation de
broker.
