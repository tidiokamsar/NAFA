# @nafa/security

Bibliothèque de sécurité partagée par tous les microservices NAFA.

**Aucun code métier, aucune dépendance à IAM.** Ce package ne connaît ni
producteurs, ni commandes, ni organisations, et n'importe rien depuis
`services/`. Il fournit les mécanismes ; chaque service décide de la politique.

## Contenu

| Domaine       | Éléments                                                                       |
| ------------- | ------------------------------------------------------------------------------ |
| `auth/`       | `AuthenticatedUser`, `NafaJwtClaims`, `TokenPair`, contrat `PrincipalResolver` |
| `jwt/`        | `JwtService` (jose), `JwtKeyStore` avec `kid` et rotation                      |
| `rbac/`       | `RbacService` — rôles, permissions `resource:action`, jokers                   |
| `abac/`       | `PolicyEngine`, `Policy`, `PolicyContext`                                      |
| `decorators/` | `@Public()`, `@Roles()`, `@Permissions()`, `@Policies()`, `@CurrentUser()`     |
| `guards/`     | `JwtAuthGuard`, `RolesGuard`, `PermissionsGuard`, `PoliciesGuard`              |
| `context/`    | `RequestContext` (AsyncLocalStorage) + middleware                              |
| `headers/`    | Helmet, CORS, contrats CSRF                                                    |
| `crypto/`     | AES-256-GCM, Argon2id, HMAC-SHA256                                             |
| `rate-limit/` | `RateLimitStore` + implémentation Redis                                        |
| `audit/`      | `SecurityAuditService`, `SecurityEventType`                                    |

## Mise en place

```ts
SecurityModule.forRoot({
  jwt: {
    issuer: 'nafa',
    audience: 'nafa-api',
    accessTokenTtl: 900,
    refreshTokenTtl: 1_209_600,
  },
  keys: [
    {
      kid: 'k1',
      algorithm: 'HS256',
      privateKey: process.env.JWT_SECRET!,
      active: true,
    },
  ],
  encryptionKey: process.env.ENCRYPTION_KEY,
});
```

Le module n'installe **aucune garde globale** : quelles routes sont protégées
est une décision par service. Le montage recommandé est `JwtAuthGuard` en
`APP_GUARD` et `@Public()` sur les exceptions — ainsi oublier un décorateur
laisse une route protégée plutôt qu'ouverte.

`RequestContextMiddleware` doit être le **premier** middleware enregistré :
tout ce qui s'exécute avant lui perd les identifiants de requête et de
corrélation.

## Décisions et leurs raisons

**`jose` plutôt que `jsonwebtoken`** — la rotation de clés exige la gestion du
`kid` et le support JWKS comme fonctionnalités de premier plan. La version 5
est retenue et non la 6, qui est ESM-only et incompatible avec nos builds
CommonJS.

**Rotation sans déconnexion** — signature et vérification sont séparées. On
ajoute une clé active, on passe la précédente à `active: false` (elle continue
de vérifier ses propres jetons), puis on la retire quand tous ont expiré.
Aucune étape n'invalide un jeton encore légitime.

**Le jeton de rafraîchissement ne porte ni rôles ni permissions** — ils sont
relus au rafraîchissement, sinon rejouer un vieux jeton ressusciterait un rôle
révoqué.

**ABAC : deny-overrides, et l'ensemble vide refuse** — ajouter une politique ne
peut que restreindre, jamais élargir. Et une route dont le nom de politique est
mal orthographié échoue fermée au lieu de laisser tout passer.

**AES-256-GCM et non CBC** — GCM authentifie en plus de chiffrer : une
altération est détectée au déchiffrement au lieu de produire silencieusement
des données corrompues que le code aval traite comme valides. L'IV est
régénéré à chaque appel et n'est jamais un paramètre : le réutiliser sous la
même clé casse GCM complètement.

**Argon2id et non bcrypt** — mémoire-dur, donc bien plus résistant aux attaques
GPU/ASIC. `@node-rs/argon2` fournit des binaires précompilés : pas de node-gyp,
pas de chaîne de compilation dans les images Alpine.

**Messages d'erreur opaques** — les gardes renvoient toujours
`Insufficient permissions`, sans préciser le rôle ou la permission manquante :
la différence cartographierait le modèle d'autorisation pour un attaquant. Le
détail part dans l'audit de sécurité.

**Rate limiting : échec ouvert** — si Redis est indisponible, les requêtes
passent. Refuser tout transformerait une panne de cache en panne totale, ce qui
est pire que quelques instants sans limite.

## Limites connues

- **CSRF n'est pas implémenté**, seulement contractualisé. Les services
  s'authentifient par jeton dans l'en-tête `Authorization`, que le navigateur
  n'attache pas automatiquement — ils ne sont donc pas vulnérables aujourd'hui.
  Cela devient obligatoire dès qu'une surface passe aux sessions par cookie.
- **La fenêtre de rate limiting est fixe**, ce qui autorise une rafale allant
  jusqu'à 2× la limite au passage d'une fenêtre. Acceptable pour bloquer des
  abus, insuffisant pour un lissage strict.
- **`ClaimsPrincipalResolver` fait confiance au jeton** : une permission
  révoquée reste effective jusqu'à expiration. C'est pourquoi les jetons
  d'accès doivent rester courts. Un service qui ne peut pas s'en accommoder
  fournit son propre `PrincipalResolver`.
- **Aucune clé n'est chargée depuis un gestionnaire de secrets** : elles
  arrivent par `SecurityModule.forRoot`. Le branchement Vault / Key Vault /
  Secrets Manager reste à faire.

## Tests

```bash
pnpm exec nx run @nafa/security:test
```

77 tests couvrant le filtrage des permissions (dont les cas où un préfixe ne
doit **pas** matcher), le moteur de politiques, la rotation de clés JWT, le
chiffrement (altération, mauvaise clé, chaîne vide), Argon2, HMAC, la garde des
permissions et l'isolation du contexte entre requêtes concurrentes.
