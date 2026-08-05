/**
 * Bootstrap seed — technical data only.
 *
 * Creates the single administrative account needed to sign in to a fresh
 * environment. It deliberately seeds no business data: producers, buyers,
 * organisations and products belong to the masters layer and get their own
 * seeds when those services exist.
 *
 * Idempotent: safe to run repeatedly against the same database.
 *
 *   pnpm --filter @nafa/iam run db:seed
 */
import { config as loadEnv } from 'dotenv';
import { join } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcryptjs';
import { PrismaClient } from '../generated/prisma/client';

loadEnv({ path: join(__dirname, '../../../../../.env') });

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@nafa.local';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe!2026';

async function main(): Promise<void> {
  if (
    process.env.NODE_ENV === 'production' &&
    !process.env.SEED_ADMIN_PASSWORD
  ) {
    throw new Error(
      'Refusing to seed production with the default admin password. ' +
        'Set SEED_ADMIN_PASSWORD explicitly.',
    );
  }

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  try {
    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);

    const admin = await prisma.user.upsert({
      where: { email: ADMIN_EMAIL },
      // Never silently reset an existing account's password on re-run.
      update: {},
      create: {
        email: ADMIN_EMAIL,
        passwordHash,
      },
    });

    console.log(`Seed complete. Admin account: ${admin.email} (${admin.id})`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error('Seed failed:', error);
  process.exit(1);
});
