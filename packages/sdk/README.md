# @nafa/sdk

Client typé pour appeler les APIs NAFA — depuis un autre service, un portail
Next.js ou un navigateur.

Ne dépend que de `@nafa/shared`. Aucun client HTTP tiers : bâti sur `fetch`,
natif dans Node 22 comme dans les navigateurs, donc le même code tourne côté
serveur et côté client sans adaptation.

## Contenu

| Dossier     | Rôle                                                              |
| ----------- | ----------------------------------------------------------------- |
| `client/`   | `HttpClient` — transport, timeout, en-têtes, enveloppe, erreurs   |
| `retry/`    | politique de réessai : backoff, jitter, idempotence               |
| `resource/` | `ResourceClient` — CRUD typé et pagination sur une ressource REST |

## Utilisation

```ts
const http = new HttpClient({
  baseUrl: 'https://iam.nafa.gov.gn',
  getContext: () => {
    const ctx = getRequestContext(); // @nafa/security
    return {
      correlationId: ctx?.correlationId,
      traceId: ctx?.traceId,
      tenantId: ctx?.user?.tenantId,
      accessToken: currentToken(),
    };
  },
});

const actors = new ResourceClient<Actor>(http, '/actors');

const page = await actors.list({ page: 1, pageSize: 50 });
for await (const actor of actors.iterate()) {
  /* ... */
}
```

`getContext` est une **fonction**, pas une valeur : sur un serveur, la
corrélation change à chaque requête entrante, et capturer la valeur à la
construction ferait fuiter le contexte d'une requête dans une autre.

## Trois choses qu'un appel écrit à la main oublie souvent

**La propagation du contexte.** Corrélation, trace, tenant, locale et jeton
sont injectés automatiquement, donc une transaction métier garde un seul
identifiant de corrélation d'un service à l'autre — condition pour retrouver
un incident dans les logs.

**Ne réessayer que ce qui est sûr.** `GET`, `HEAD`, `OPTIONS`, `PUT` et
`DELETE` sont idempotents, donc réessayables. `POST` et `PATCH` ne le sont
pas : rejouer un `POST` peut créer un doublon ou débiter deux fois. Le SDK
refuse donc de les réessayer, **sauf** si l'appel porte une clé
d'idempotence — auquel cas il le fait volontiers.

**Déballer l'enveloppe.** Le client retourne `data` directement, et lève un
`NafaError` porteur du vrai code d'erreur distant plutôt qu'un statut HTTP
à interpréter.

## Décisions et leurs raisons

**Backoff exponentiel avec _full jitter_** — un backoff sans aléa fait
réessayer au même instant tous les clients tombés au même instant : le serveur
en cours de rétablissement reprend une vague synchronisée et retombe.
Randomiser sur toute la fenêtre les étale.

**Aucun réessai sur 4xx** (sauf 429) — un 400 sera toujours un 400 dans deux
secondes ; réessayer ne fait qu'ajouter de la charge.

**`Retry-After` prime sur la formule, mais reste plafonné** — un serveur qui
indique le délai en sait plus que nous ; un `Retry-After: 86400` mal configuré
ou hostile ne doit pas pour autant figer l'appelant.

**Une erreur réseau est réessayée sur les méthodes idempotentes seulement** —
la requête n'a peut-être jamais atteint le serveur, mais pour un `POST` on ne
peut pas savoir s'il l'a traitée avant la coupure.

**Timeout par tentative, via `AbortController`** — un `signal` fourni par
l'appelant reste opérant : annulation utilisateur et timeout coexistent.

**Le corps non-JSON n'est pas fatal** — une page d'erreur HTML d'un proxy ne
doit pas masquer le statut, qui reste l'information utile.

**`listAll` est borné (10 000 par défaut)** — sans plafond, un appel sur une
grande collection épuise la mémoire. `iterate` est paresseux : un consommateur
qui s'arrête tôt arrête aussi les requêtes.

## Limites connues

- **Aucun appel réel n'a été fait** : tous les tests injectent un faux `fetch`.
  Le SDK n'a jamais parlé à un vrai service NAFA.
- **Pas de module NestJS** : `HttpClient` s'instancie à la main ou via un
  provider maison. Un `SdkModule.forRoot()` viendra quand un service le
  consommera réellement.
- **Pas de rafraîchissement de jeton** : `getContext` fournit le jeton courant,
  mais le SDK ne sait pas réagir à un 401 en le renouvelant.
- **La clé d'idempotence doit être honorée côté serveur.** Aucun service NAFA
  ne l'implémente aujourd'hui : la passer autorise le réessai côté client, mais
  ne protège pas encore des doublons côté serveur.
- **Pas de circuit breaker** : sur une dépendance durablement en panne, le SDK
  continue de réessayer selon la politique au lieu de couper court.

## Tests

```bash
pnpm exec nx run @nafa/sdk:test
```

73 tests : matrice d'idempotence par méthode, statuts réessayables ou non,
`Retry-After` (secondes, date HTTP, plafonnement, valeur illisible), jitter,
propagation des en-têtes, contexte relu à chaque appel, mapping des erreurs,
timeout, et pagination paresseuse (dont l'arrêt anticipé du consommateur).
