import { defineConfig } from 'prisma/config';

/**
 * Configuration of the schema owner.
 *
 * Scope: `prisma generate`, and nothing else. Deliberately declares no
 * datasource URL — generating clients reads the schema, never the database,
 * so this task runs before any environment exists (a fresh clone, a CI job
 * on a container with no Postgres yet).
 *
 * Everything that *does* open a session — `db:push`, `db:deploy`, `db:seed` —
 * stays in each service's own `prisma.config.ts`, where the connection
 * belongs.
 *
 * The single schema declares one generator per consuming service, so one
 * `prisma generate` writes all of them. Running it once per service, as the
 * repository used to, made N processes write the same N directories
 * concurrently and corrupt each other.
 */
export default defineConfig({
  schema: './schema/schema.prisma',
  migrations: {
    path: './migrations',
  },
});
