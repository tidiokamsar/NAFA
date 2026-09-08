# ADR-0016 — Transport de l'Outbox : Kafka via Redpanda

- **Statut** : Acceptée
- **Date** : 2026-09-08
- **Ticket** : OUT-003
- **Complète** : [ADR-0015](0015-outbox-relay-and-retry-policy.md), dont elle
  lève la non décision principale.

## Contexte

ADR-0013 a livré la table, ADR-0015 le relais. Les deux ont refusé de choisir
un transport, au même motif : aucun consommateur n'existait, et ADR-0008 tient
à garder les Engines indépendants du broker.

Ce refus avait un coût, énoncé dans l'ADR-0015 : le relais est livré **inerte**.
`OutboxRelayModule.forRoot()` exige un `DomainEventPublisher` et échoue au
démarrage sans lui, donc aucun service ne l'importe, et les lignes s'accumulent
avec `publishedAt IS NULL`.

Cette ADR choisit le transport. C'est le dernier verrou entre l'Outbox et son
utilité.

## Décision 1 — Kafka, servi par Redpanda

Le dépôt avait déjà pris cette décision trois fois sans l'écrire.

**ADR-0008 nomme le broker dans son flux visé** :
`repository → relais → broker → consommateurs`. Elle cite Kafka et RabbitMQ
comme les adaptations d'infrastructure à venir. Redis n'y figure jamais comme
bus.

**Le stack le provisionne intégralement.** `docker-compose.dev.yml` fait tourner
Redpanda avec l'API Kafka en 9092, un Schema Registry en 8081, un proxy HTTP en
8082, une API admin en 9644, un healthcheck `rpk cluster health` et un volume
persistant. Une console lui est même adjointe en 8080. Ce n'est pas un service
posé là par hasard.

**`docs/PARALLEL-AGENTS.md` déclare déjà les variables**, `KAFKA_BROKERS` et
`KAFKA_TOPIC_PREFIX`, dans le `.env.local` de chaque lane. L'isolation par
préfixe de topic était conçue avant qu'un producteur existe.

Redis est bien dans le stack, et `ioredis` est déjà une dépendance de
`@nafa/platform`. Mais il y sert les sessions et la limitation de débit. « La
dépendance est déjà là » n'est pas un argument d'architecture : il faudrait
aller contre les trois points ci-dessus pour en faire un bus.

## Décision 2 — Kafka plutôt que RabbitMQ, qui est pourtant là aussi

Les deux tournent dans le stack, le choix méritait donc d'être argumenté et pas
seulement hérité.

L'Outbox produit un journal ordonné et rejouable, clé par agrégat. ADR-0008
impose aux consommateurs de dédupliquer sur `eventId`, et ADR-0013 leur donne
`version` pour détecter les trous. Un log avec rétention et partitionnement par
clé sert exactement ce contrat : un consommateur qui rate des événements peut
revenir en arrière.

Une file qui supprime à l'acquittement ne donne pas le rejeu, et l'ordre par
agrégat y demande un travail supplémentaire. RabbitMQ reste le bon outil pour
du travail à distribuer ; ce n'est pas ce que l'Outbox produit.

**Ce qu'on perd** : la simplicité opérationnelle d'une file. Kafka demande de
penser aux partitions, à la rétention et aux groupes de consommateurs, dont
rien n'est nécessaire tant qu'il n'y a qu'un producteur.

## Décision 3 — le client est `@platformatic/kafka`, pas `kafkajs`

`kafkajs` est le réflexe, et c'est le piège de ce ticket. Sa dernière
publication date de **février 2023**, plus de trois ans et demi. Adopter un
client abandonné comme colonne vertébrale du bus d'événements serait une dette
contractée le jour même.

`@platformatic/kafka` est en 2.11.0, mis à jour une semaine avant cette ADR.

**Ce qu'on perd, et c'est réel.** Le paquet exige Node ≥ 22.22 ou ≥ 24.6, ce qui
relève le plancher effectif du dépôt pour tout ce qui importe `@nafa/platform` :
la CI est sur Node 22 et le poste de développement sur 24.18, donc compatible,
mais la contrainte est nouvelle et n'existait pas avant. Et c'est un client
moins répandu que `kafkajs` : le jour où quelque chose casse, il y aura moins de
réponses toutes faites.

**Le paquet est ESM pur, et ça se paie à trois endroits.** `@nafa/platform`
compile en CommonJS — `tsconfig.base.json` déclare `"module": "commonjs"` et
`moduleResolution: "node"`, et ce fichier est sous validation humaine, donc
hors de portée de ce ticket. Trois vérifications, faites plutôt que supposées :

- **À l'exécution, ça passe.** Node charge l'ESM depuis CommonJS via
  `require(esm)` depuis la 22.12, ce qui recoupe le plancher déjà imposé par le
  paquet lui-même.
- **À la compilation, ça passe.** TypeScript résout les types malgré
  `moduleResolution: "node"`, vérifié par un typecheck réel avant d'écrire une
  ligne d'adaptateur.
- **Sous Jest, ça ne passe pas.** Jest tourne en CommonJS et n'analyse pas la
  syntaxe ESM : un import statique du client fait échouer la suite entière
  avant le premier test.

D'où le chargement paresseux du client, dans la seule méthode qui ouvre une
connexion. Ce n'est pas un contournement de confort : c'est la condition pour
que l'adaptateur soit testable du tout. Effet secondaire heureux, un service
qui importe le module sans jamais publier n'ouvre aucune socket.

## Décision 4 — aucun nouveau port

`@nafa/shared` déclare `DomainEventPublisher`, classe abstraite avec `publish`
et `publishAll`. Elle n'avait **aucun usage dans le dépôt** : elle attendait ce
ticket depuis ADR-0008.

Écrire un `OutboxPublisher` à côté aurait produit deux ports pour une seule
question, ce que `AGENTS.md` interdit sur les paquets partagés. L'adaptateur
implémente donc le port existant, et le relais ne change pas d'une ligne.

## Décision 5 — les réglages sont des options de module, pas de la configuration globale

L'adaptateur reçoit ses courtiers et son préfixe de topic en options passées par
le service qui l'importe. Il ne lit pas `process.env` et n'interroge pas le
`ConfigService`.

Le périmètre exclusif de ce ticket est `packages/platform/src/outbox` : ajouter
`KAFKA_TOPIC_PREFIX` au schéma de validation de `packages/platform/src/config`
en sortirait. La contrainte a forcé le bon choix : un adaptateur d'Outbox n'a
pas à fouiller la configuration du processus qui l'héberge, et le service reste
libre de composer ses options comme il veut.

**Conséquence** : le jour où un service câble ce transport, c'est lui qui doit
lire `KAFKA_BROKERS` et le passer. Ajouter le préfixe au schéma commun sera un
ticket de configuration, pas d'Outbox.

## Décision 6 — un topic par agrégat, la clé de partition est `aggregateId`

Le nom du topic est `<préfixe><agrégat en minuscules>`, par exemple `a.actor`.
Le préfixe est celui de la lane, ce que `PARALLEL-AGENTS.md` prévoyait déjà pour
éviter que deux agents publient dans le même topic.

La clé de partition est `aggregateId`. C'est elle qui garantit l'ordre **par
agrégat**, et c'est exactement l'ordre que `version` permet au consommateur de
vérifier.

**Ce qu'on ne promet pas** : l'ordre global. Deux relais concurrents publient en
parallèle et rien ne les sérialise entre agrégats. ADR-0015 l'avait déjà laissé
en non décision ; cette ADR le confirme plutôt que de le corriger, parce qu'un
ordre global coûterait une partition unique et donc un débit unique.

## Non décisions

- **Le câblage dans les Masters.** Aucun service n'importe encore
  `OutboxRelayModule`. Le faire demande de décider quel service porte le relais,
  et si les quatre le portent tous ou un seul. C'est un ticket de service, pas
  de plateforme.
- **Le Schema Registry.** Redpanda en fournit un en 8081, ce transport ne s'en
  sert pas : les événements partent en JSON. Le jour où un consommateur existe
  dans un autre langage, la question se posera pour de bon.
- **La rétention côté broker.** Distincte de la rétention de la table, qui est
  le sujet d'OUT-004. Les deux devront s'accorder.
- **Les groupes de consommateurs.** Il n'y a pas de consommateur.

## Ce que cette ADR ne prouve pas

L'adaptateur n'a **jamais publié vers un vrai broker**. Redpanda ne tourne pas
sur le poste au moment d'écrire ces lignes, son image a été supprimée lors d'un
nettoyage de disque, et le DNS de Docker y est instable — le même incident qui
empêche INFRA-001 de construire ses images.

Les tests couvrent la traduction événement vers message, le nommage des topics,
la clé de partition et la remontée d'erreur, contre un producteur d'essai. Ils
ne couvrent pas la connexion, la sérialisation réelle ni le comportement du
broker sous charge. Le premier câblage devra le faire, et c'est à ce moment que
le choix du client sera réellement mis à l'épreuve.
