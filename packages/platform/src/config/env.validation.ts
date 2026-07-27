import * as Joi from 'joi';

/**
 * Single source of truth for every environment variable the platform reads.
 * Validation runs once at bootstrap: a service with a bad or missing variable
 * fails immediately and loudly rather than at the first request that needs it.
 */
export const envValidationSchema = Joi.object({
  // --- runtime ---
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  SERVICE_NAME: Joi.string().default('nafa-service'),
  PORT: Joi.number().port().default(3000),

  // --- database ---
  DATABASE_URL: Joi.string()
    .uri({ scheme: [/postgres(ql)?/] })
    .required(),

  // --- redis ---
  REDIS_URL: Joi.string()
    .uri({ scheme: ['redis', 'rediss'] })
    .required(),
  CACHE_TTL_SECONDS: Joi.number().min(0).default(60),

  // --- auth ---
  // Production must not fall back to a weak default; development may.
  JWT_SECRET: Joi.string().min(32).required(),
  JWT_EXPIRES_IN: Joi.string().default('1h'),

  // --- rate limiting ---
  RATE_LIMIT_TTL_SECONDS: Joi.number().min(1).default(60),
  RATE_LIMIT_LIMIT: Joi.number().min(1).default(100),

  // --- logging ---
  LOG_LEVEL: Joi.string()
    .valid('fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent')
    .default(
      Joi.ref('NODE_ENV', {
        adjust: (env: string) => (env === 'production' ? 'info' : 'debug'),
      }),
    ),
  LOG_PRETTY: Joi.boolean().default(
    Joi.ref('NODE_ENV', { adjust: (env: string) => env !== 'production' }),
  ),

  // --- telemetry ---
  OTEL_ENABLED: Joi.boolean().default(true),
  OTEL_EXPORTER_OTLP_ENDPOINT: Joi.string().uri().optional(),
  PROMETHEUS_PORT: Joi.number().port().default(9464),

  // --- messaging (declared here so a misconfiguration fails at boot) ---
  KAFKA_BROKERS: Joi.string().optional(),
  RABBITMQ_URL: Joi.string()
    .uri({ scheme: ['amqp', 'amqps'] })
    .optional(),

  // --- object storage ---
  S3_ENDPOINT: Joi.string().uri().optional(),
  S3_ACCESS_KEY: Joi.string().optional(),
  S3_SECRET_KEY: Joi.string().optional(),
  S3_BUCKET: Joi.string().optional(),
});

export function validateEnv(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const { error, value } = envValidationSchema.validate(config, {
    allowUnknown: true,
    abortEarly: false,
  });

  if (error) {
    const details = error.details.map((d) => `  - ${d.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }

  return value as Record<string, unknown>;
}
