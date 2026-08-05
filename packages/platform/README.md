# @nafa/platform

Infrastructure transverse partagée par tous les services NestJS de NAFA.
**Aucune logique métier** : ce package ne connaît ni producteurs, ni commandes,
ni organisations. Il fournit ce que chaque service doit avoir de façon
identique.

Un service consomme ce package plutôt que de recopier ces briques ; c'est ce
qui garantit que les logs, les erreurs, les sondes et les métriques ont le même
format d'un service à l'autre.

## Contenu

| Module                                     | Rôle                                                                                                |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| `PlatformConfigModule`                     | configuration typée par namespace, validation Joi au démarrage, chargement `.env` par environnement |
| `PlatformLoggingModule`                    | logs JSON (pino), request id + correlation id, redaction des secrets                                |
| `PlatformHealthModule`                     | `GET /live`, `GET /ready`, `GET /health` avec indicateurs enfichables                               |
| `PlatformErrorsModule`                     | filtre d'exceptions global, réponses d'erreur normalisées, logging                                  |
| `PlatformRedisModule`                      | client Redis partagé + `SessionService`                                                             |
| `PlatformCacheModule`                      | cache distribué adossé à Redis                                                                      |
| `PlatformThrottlerModule`                  | limites de débit déclarées (garde non installée)                                                    |
| `PlatformTelemetryModule` + `startTracing` | OpenTelemetry : traces, métriques, export Prometheus                                                |
| `setupSwagger`                             | OpenAPI 3.1 avec authentification JWT préconfigurée                                                 |

## Utilisation

`startTracing` doit s'exécuter **avant tout autre import**, sinon
l'auto-instrumentation OpenTelemetry n'a rien à instrumenter. D'où le fichier
`tracing.bootstrap.ts` importé en première ligne de `main.ts` — voir
`services/foundation/iam` comme référence.

```ts
@Module({
  imports: [
    PlatformConfigModule.forRoot(REPO_ROOT),
    PlatformLoggingModule.forRoot(),
    PlatformTelemetryModule.forRoot(),
    PlatformErrorsModule,
    PlatformRedisModule,
    PlatformCacheModule.forRoot(),
    PlatformThrottlerModule.forRoot(),
    PlatformHealthModule.forRoot({
      imports: [PrismaModule],
      indicators: [PrismaHealthIndicator, RedisHealthIndicator],
    }),
  ],
})
export class AppModule {}
```

## Sondes

| Endpoint      | Sémantique                                                                                                                                                                                |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /live`   | le processus répond. Ne teste **aucune** dépendance : une base indisponible ne doit pas provoquer le redémarrage du conteneur, ce qui ne ferait qu'ajouter de la charge pendant la panne. |
| `GET /ready`  | les dépendances sont joignables. Renvoie 503 sinon, pour que l'orchestrateur cesse d'y router du trafic.                                                                                  |
| `GET /health` | rapport détaillé, destiné aux humains et aux tableaux de bord.                                                                                                                            |

Un service déclare ses propres dépendances en implémentant
`PlatformHealthIndicator` (voir `PrismaHealthIndicator` dans `iam`).

## Traçabilité des requêtes

Chaque requête reçoit deux identifiants, renvoyés dans les en-têtes de réponse
et présents dans chaque ligne de log :

- `x-request-id` — une requête HTTP. Repris de l'en-tête entrant s'il existe.
- `x-correlation-id` — une transaction métier pouvant traverser plusieurs
  services. Propagé tel quel d'un service à l'autre.

Les deux figurent aussi dans les réponses d'erreur, ce qui permet à un
utilisateur de citer un identifiant qu'on retrouve directement dans les logs.

## Limites connues

- Le stockage du rate limiting est en mémoire, donc **par instance** : les
  limites sont sous-comptées dès qu'un service tourne en plusieurs réplicas.
  Basculer sur un stockage Redis avant de s'y fier en production.
- `PlatformThrottlerModule` déclare les limites mais n'installe pas de garde :
  chaque service décide où les appliquer.
