// Requires a live Postgres and Redis (infrastructure/docker/docker-compose.dev.yml).
//
// The adapter suite exercises repositories directly. This one boots the real
// application and speaks HTTP to it, which is the only way to assert the two
// things that live between a controller and a client: that a domain failure
// becomes the right status with its code, and that the response shape is the
// DTO rather than whatever the aggregate happens to hold today.
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { SystemClock, UuidGenerator } from '@nafa/shared';
import { createProduct, type Product, type UnitInput } from '@nafa/products';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/infrastructure/persistence/prisma/prisma.service';

function expectOk<T>(
  result: { ok: boolean; value?: T; error?: { message: string } },
  label: string,
): T {
  if (!result.ok) {
    throw new Error(`expectOk(${label}): ${result.error?.message}`);
  }
  return result.value as T;
}

const UNITS: UnitInput[] = [
  { code: 'KG', name: 'Kilogramme', kind: 'WEIGHT', factorToBase: 1 },
  {
    code: 'SAC_50',
    name: 'Sac de 50 kg',
    kind: 'WEIGHT',
    baseUnit: 'KG',
    factorToBase: 50,
  },
] as UnitInput[];

function publishedProduct(code: string, official: string): Product {
  const product = expectOk(
    createProduct({
      code,
      category: 'CEREAL',
      officialName: official,
      aliases: [`${official.toLowerCase()} local`],
      units: UNITS,
      clock: new SystemClock(),
      ids: new UuidGenerator(),
    }),
    code,
  );
  expectOk(
    product.publish({ clock: new SystemClock(), ids: new UuidGenerator() }),
    `publish ${code}`,
  );
  return product;
}

describe('products API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let seeded: Product;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    // The same pipe main.ts installs. Without it the query DTO would not be
    // validated and the 400 case below would silently become a 200.
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();

    prisma = app.get(PrismaService);
    seeded = publishedProduct('APIFONIO', 'Fonio api');
    const snapshot = seeded.snapshot();
    await prisma.product.create({
      data: {
        id: snapshot.productId as string,
        code: snapshot.code as string,
        category: snapshot.category as never,
        name: snapshot.name as never,
        units: snapshot.units as never,
        status: snapshot.status as never,
        version: snapshot.version,
      },
    });
  });

  afterAll(async () => {
    await prisma.product.deleteMany({ where: { code: 'APIFONIO' } });
    await app.close();
  });

  describe('GET /products/code/:code', () => {
    it('returns the product in the response shape, not the snapshot', async () => {
      const res = await request(app.getHttpServer())
        .get('/products/code/APIFONIO')
        .expect(200);

      expect(res.body).toEqual({
        id: seeded.productId as unknown as string,
        code: 'APIFONIO',
        category: 'CEREAL',
        officialName: 'Fonio api',
        aliases: ['fonio api local'],
        units: expect.any(Array),
        status: 'PUBLISHED',
      });

      // The concurrency counter stays inside. Publishing it would invite a
      // client to reason about a value this API promises nothing about.
      expect(res.body).not.toHaveProperty('version');
      expect(res.body).not.toHaveProperty('productId');
    });

    it('answers 404 with the domain code when nothing holds that key', async () => {
      const res = await request(app.getHttpServer())
        .get('/products/code/NOSUCHCODE')
        .expect(404);

      // The whole point of teaching the filter about NafaError: this used to
      // be a 500 with the code discarded.
      expect(res.body.code).toBe('NOT_FOUND');
      expect(res.body.message).toContain('NOSUCHCODE');
      expect(res.body.path).toBe('/products/code/NOSUCHCODE');
      expect(res.body.requestId).toBeDefined();
    });
  });

  describe('GET /products', () => {
    it('finds by name across official names and aliases', async () => {
      const byOfficial = await request(app.getHttpServer())
        .get('/products?name=Fonio api')
        .expect(200);
      expect(byOfficial.body.map((p: { code: string }) => p.code)).toContain(
        'APIFONIO',
      );

      const byAlias = await request(app.getHttpServer())
        .get('/products?name=fonio api local')
        .expect(200);
      expect(byAlias.body.map((p: { code: string }) => p.code)).toContain(
        'APIFONIO',
      );
    });

    it('finds by category', async () => {
      const res = await request(app.getHttpServer())
        .get('/products?category=CEREAL')
        .expect(200);

      expect(res.body.length).toBeGreaterThan(0);
      expect(
        res.body.every((p: { category: string }) => p.category === 'CEREAL'),
      ).toBe(true);
    });

    it('refuses a category the domain does not define', async () => {
      // The list comes from PRODUCT_CATEGORIES, so this test also fails the
      // day the DTO stops reading the domain and starts holding a copy.
      const res = await request(app.getHttpServer())
        .get('/products?category=VEGETABLE')
        .expect(400);

      expect(String(res.body.message)).toContain('category must be one of');
    });

    it('refuses an unknown filter rather than ignoring it', async () => {
      // forbidNonWhitelisted. A typo in a query parameter that silently
      // returns everything is worse than an error.
      await request(app.getHttpServer())
        .get('/products?categorie=CEREAL')
        .expect(400);
    });

    it('returns an empty list with no filter, and does not dump the catalogue', async () => {
      const res = await request(app.getHttpServer())
        .get('/products')
        .expect(200);

      expect(res.body).toEqual([]);
    });
  });
});
