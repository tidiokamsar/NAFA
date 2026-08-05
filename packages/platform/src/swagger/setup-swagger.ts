import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export interface SwaggerOptions {
  title: string;
  description: string;
  version?: string;
  /** Path the UI is served from. Defaults to `api/docs`. */
  path?: string;
  /** Extra tags to declare up front, in the order they should appear. */
  tags?: { name: string; description: string }[];
}

export const JWT_SECURITY_SCHEME = 'bearer';

/**
 * Mounts OpenAPI documentation with JWT bearer auth pre-configured, so the
 * "Authorize" button in the UI works against any `@ApiBearerAuth()` route.
 *
 * Emits OpenAPI 3.1: it aligns with JSON Schema proper, which matters for the
 * generated clients the api-portal will publish.
 */
export function setupSwagger(
  app: INestApplication,
  options: SwaggerOptions,
): void {
  const builder = new DocumentBuilder()
    .setTitle(options.title)
    .setDescription(options.description)
    .setVersion(options.version ?? '0.1.0')
    .setOpenAPIVersion('3.1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        in: 'header',
        name: 'Authorization',
        description: 'Paste the accessToken returned by the login endpoint.',
      },
      JWT_SECURITY_SCHEME,
    );

  for (const tag of options.tags ?? []) {
    builder.addTag(tag.name, tag.description);
  }

  const document = SwaggerModule.createDocument(app, builder.build());

  SwaggerModule.setup(options.path ?? 'api/docs', app, document, {
    swaggerOptions: {
      // Survives a page reload, so you do not re-paste the token every time.
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
  });
}
