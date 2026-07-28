# @nafa/shared

Socle commun de NAFA : constantes, types, interfaces, utilitaires, erreurs,
contrats et événements.

**Zéro dépendance runtime** — pas même NestJS. C'est délibéré : ce package est
au bas du graphe de dépendances, donc tout peut l'importer (services back-end,
portails Next.js, futurs SDK) sans traîner de framework, et aucun cycle n'est
possible.

## Contenu

| Dossier       | Contenu                                                           |
| ------------- | ----------------------------------------------------------------- |
| `constants/`  | en-têtes HTTP, pagination, canaux, environnements                 |
| `types/`      | primitives (`Brand`, `Nullable`, `DeepPartial`), pagination       |
| `interfaces/` | `Clock`, `IdGenerator` — le temps et les identifiants injectables |
| `utils/`      | `Result`, gardes de type, `redact`                                |
| `errors/`     | hiérarchie `NafaError`, codes d'erreur stables                    |
| `contracts/`  | enveloppe de réponse API unique                                   |
| `events/`     | Enterprise Audit Framework, événements de domaine                 |

## Contrat de réponse API

Toute API NAFA répond avec la même enveloppe, en succès comme en erreur — un
client écrit **un** gestionnaire de réponse, pas un par service.

```json
{
  "success": true,
  "data": {},
  "meta": { "pagination": {} },
  "traceId": "...",
  "timestamp": "2026-07-27T10:15:30.000Z",
  "version": "v1"
}
```

L'enveloppe est ajoutée par un intercepteur, jamais par un contrôleur : celui-ci
retourne ses données et ignore tout du format.

## Enterprise Audit Framework

`AuditEvent` couvre toutes les catégories, pas seulement la sécurité : `Data`,
`Access`, `Admin`, `Business`, `System`, `Integration`.

Les champs ambiants (`actorId`, `tenantId`, `ip`, `device`, `channel`,
`traceId`) sont remplis depuis le contexte de requête par le service émetteur,
pas par chaque appel. Tous les champs sauf `eventId`, `category`, `action` et
`timestamp` sont optionnels : **un journal d'audit avec des trous vaut mieux
qu'un journal avec des valeurs inventées**.

`AuditEvent` répond à « qui a fait quoi », `DomainEvent` à « qu'est-ce qui
vient de se passer, que d'autres doivent traiter ». Une même action produit
souvent les deux.

## Décisions et leurs raisons

**Les en-têtes sont en minuscules** — Node normalise les en-têtes entrants en
minuscules ; comparer à un littéral capitalisé ne matche jamais, silencieusement.

**`clampPageSize` borne au lieu de rejeter** — une page non bornée est la façon
dont un client met un service à genoux par accident. Refuser la requête serait
plus hostile sans être plus sûr.

**`buildPageMeta` renvoie au minimum 1 page** — annoncer 0 page produit des
« page 1 sur 0 » dans les interfaces.

**Les codes d'erreur sont stables, les messages non** — un client branche sur
`code`. Les messages sont reformulés et traduits ; changer le sens d'un code
existant est une rupture.

**`NafaError` ignore le framework** — le code domaine lève ces erreurs sans
importer NestJS, et la couche HTTP les traduit. C'est ce qui permet à la même
logique métier de tourner derrière une API HTTP, un consommateur de file ou une
CLI.

**`Result` ne remplace pas les exceptions** — il sert là où l'échec est un
résultat attendu (validation, règle métier). Les exceptions restent pour ce qui
est réellement exceptionnel : une base indisponible, un bug.

**`redact` matche par sous-chaîne** — `userPassword` et `PASSWORD_HASH` doivent
tomber autant que `password`. La façon la plus courante dont un mot de passe
finit dans un log est un corps de requête entier dumpé sur erreur.

**`Clock` et `IdGenerator` sont injectables** — du code qui appelle `new Date()`
ou génère un UUID en dur n'est pas testable sur son comportement temporel sans
geler l'horloge globale.

## Limites connues

- **Aucun intercepteur n'applique encore l'enveloppe** : le contrat existe, son
  branchement dans `@nafa/platform` reste à faire. Les services répondent donc
  toujours au format précédent.
- **`AuditSink` n'a aucune implémentation ici** : le package est sans
  dépendance, donc il définit le contrat et laisse `platform` fournir le puits.
- **`buildAuditEvent` et `buildDomainEvent` utilisent `crypto.randomUUID` par
  défaut** ; passer un `IdGenerator` pour rendre les tests déterministes.
- **Le champ `currency` du contexte de requête n'est encore alimenté par rien** —
  il attend que la tarification existe.

## Tests

```bash
pnpm exec nx run @nafa/shared:test
```

47 tests : bornage de la pagination, cas limites des métadonnées, redaction
(casse, séparateurs, imbrication, cycles, non-mutation), `Result`, hiérarchie
d'erreurs (`instanceof` à travers les sous-classes) et enveloppe de réponse.
