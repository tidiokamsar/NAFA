# Architecture Decision Records

Une décision d'architecture par fichier, numérotée et immuable une fois
acceptée. Quand une décision est remise en cause, on écrit une nouvelle ADR qui
remplace l'ancienne — on ne réécrit pas l'historique : savoir ce qu'on a cru
vrai, et pourquoi on a changé d'avis, vaut autant que la décision elle-même.

| ADR                                                          | Titre                                                | Statut   |
| ------------------------------------------------------------ | ---------------------------------------------------- | -------- |
| [0001](0001-ddd-layering-for-services.md)                    | Découpage DDD en quatre couches pour les services    | Acceptée |
| [0002](0002-foundation-package-for-business-contracts.md)    | `@nafa/foundation` pour les contrats métier partagés | Acceptée |
| [0003](0003-ports-and-adapters-for-persistence.md)           | Ports et adaptateurs pour la persistance             | Acceptée |
| [0004](0004-enforce-architecture-boundaries-with-nx-tags.md) | Frontières d'architecture appliquées par les tags Nx | Acceptée |

## Format

Contexte, décision, conséquences. Les conséquences incluent ce qu'on perd :
une ADR qui n'énumère que des avantages n'a pas arbitré grand-chose.
