import { registerAs } from '@nestjs/config';

const toBool = (value: unknown, fallback: boolean): boolean => {
  if (value === undefined || value === '') return fallback;
  return value === true || value === 'true' || value === '1';
};

const toInt = (value: unknown, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export type NodeEnv = 'development' | 'test' | 'production';

export interface AppConfig {
  nodeEnv: NodeEnv;
  serviceName: string;
  port: number;
  isProduction: boolean;
  isTest: boolean;
}

export interface DatabaseConfig {
  url: string;
}

export interface RedisConfig {
  url: string;
  cacheTtlSeconds: number;
}

export interface AuthConfig {
  jwtSecret: string;
  jwtExpiresIn: string;
}

export interface RateLimitConfig {
  ttlSeconds: number;
  limit: number;
}

export interface LoggingConfig {
  level: string;
  pretty: boolean;
}

export interface TelemetryConfig {
  enabled: boolean;
  otlpEndpoint?: string;
  prometheusPort: number;
}

export interface StorageConfig {
  endpoint?: string;
  accessKey?: string;
  secretKey?: string;
  bucket?: string;
}

export const appConfig = registerAs<AppConfig>('app', () => {
  const nodeEnv = (process.env.NODE_ENV ?? 'development') as NodeEnv;
  return {
    nodeEnv,
    serviceName: process.env.SERVICE_NAME ?? 'nafa-service',
    port: toInt(process.env.PORT, 3000),
    isProduction: nodeEnv === 'production',
    isTest: nodeEnv === 'test',
  };
});

export const databaseConfig = registerAs<DatabaseConfig>('database', () => ({
  url: process.env.DATABASE_URL as string,
}));

export const redisConfig = registerAs<RedisConfig>('redis', () => ({
  url: process.env.REDIS_URL as string,
  cacheTtlSeconds: toInt(process.env.CACHE_TTL_SECONDS, 60),
}));

export const authConfig = registerAs<AuthConfig>('auth', () => ({
  jwtSecret: process.env.JWT_SECRET as string,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '1h',
}));

export const rateLimitConfig = registerAs<RateLimitConfig>('rateLimit', () => ({
  ttlSeconds: toInt(process.env.RATE_LIMIT_TTL_SECONDS, 60),
  limit: toInt(process.env.RATE_LIMIT_LIMIT, 100),
}));

export const loggingConfig = registerAs<LoggingConfig>('logging', () => ({
  level:
    process.env.LOG_LEVEL ??
    (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  pretty: toBool(process.env.LOG_PRETTY, process.env.NODE_ENV !== 'production'),
}));

export const telemetryConfig = registerAs<TelemetryConfig>('telemetry', () => ({
  enabled: toBool(process.env.OTEL_ENABLED, true),
  otlpEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
  prometheusPort: toInt(process.env.PROMETHEUS_PORT, 9464),
}));

export const storageConfig = registerAs<StorageConfig>('storage', () => ({
  endpoint: process.env.S3_ENDPOINT,
  accessKey: process.env.S3_ACCESS_KEY,
  secretKey: process.env.S3_SECRET_KEY,
  bucket: process.env.S3_BUCKET,
}));

export const platformConfigurations = [
  appConfig,
  databaseConfig,
  redisConfig,
  authConfig,
  rateLimitConfig,
  loggingConfig,
  telemetryConfig,
  storageConfig,
];
