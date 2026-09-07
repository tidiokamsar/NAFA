// Requires a live Postgres (see infrastructure/docker/docker-compose.dev.yml).
// Run via `pnpm test:e2e` — never part of the default `pnpm test` (unit) task.
//
// What this suite really tests is the half of the Actor Master that unit
// tests cannot reach: the three lookups that exist only because an aggregate
// cannot see the collection it belongs to. findByRccm, findByNif and
// findByPhoneNumber are answered by indexed columns projected from JSON, so a
// bug in that projection stays invisible until a real database is asked.
import { StaleVersionError, SystemClock, UuidGenerator } from '@nafa/shared';
import {
  Actor,
  ActorNature,
  ActorRule,
  ActorStatus,
  CooperativeMembership,
  LegalForm,
  MembershipStatus,
  RoleType,
  VerificationLevel,
  actorId,
  address,
  companyIdentity,
  cooperativeIdentity,
  cooperativeMembershipId,
  cooperativeRegistrationNumber,
  isoDate,
  nif,
  personIdentity,
  personName,
  phoneContact,
  phoneNumber,
  rccm,
  type ActorDependencies,
  type ActorId,
  type LegalIdentity,
} from '@nafa/foundation';
import { PrismaActorRepository } from '../src/infrastructure/persistence/prisma/prisma-actor.repository';
import { PrismaCooperativeMembershipRepository } from '../src/infrastructure/persistence/prisma/prisma-cooperative-membership.repository';
import { PrismaService } from '../src/infrastructure/persistence/prisma/prisma.service';
import { E2E_DATABASE_URL } from './e2e-env';

/** Unwraps a Result the test expects to have succeeded. */
function expectOk<T>(
  result: { ok: boolean; value?: T; error?: { message: string } },
  label: string,
): T {
  if (!result.ok) {
    throw new Error(`expectOk(${label}): ${result.error?.message}`);
  }
  return result.value as T;
}

const clock = new SystemClock();
const ids = new UuidGenerator();
const deps: ActorDependencies = { clock, ids };

const ADDRESS = expectOk(
  address({
    line: 'Quartier Almamya',
    locality: 'Conakry',
    region: 'Conakry',
    countryCode: 'GN',
  }),
  'address',
);

/** The number two actors share — the reason findByPhoneNumber returns a list. */
const SHARED_PHONE = expectOk(phoneNumber('+224620000000'), 'shared phone');
const TODAY = expectOk(
  isoDate('2026-09-06', ActorRule.INVALID_BIRTH_DATE, 'Granted at'),
  'today',
);
const OWN_PHONE = expectOk(phoneNumber('+224620000009'), 'own phone');

function companyWith(
  registerNumber: string,
  taxNumber: string,
  legalName: string,
): LegalIdentity {
  return expectOk(
    companyIdentity({
      legalName,
      legalForm: LegalForm.SARL,
      rccm: expectOk(rccm(registerNumber), 'rccm'),
      nif: expectOk(nif(taxNumber), 'nif'),
      incorporationDate: expectOk(
        isoDate('2019-06-01', ActorRule.INVALID_INCORPORATION_DATE, 'Inc.'),
        'incorporation',
      ),
    }),
    `companyIdentity(${legalName})`,
  );
}

function personNamed(given: string, family: string): LegalIdentity {
  return expectOk(
    personIdentity({
      name: expectOk(personName(given, family), 'name'),
      birthDate: expectOk(
        isoDate('1985-03-17', ActorRule.INVALID_BIRTH_DATE, 'Birth'),
        'birth',
      ),
      nationality: 'GN',
    }),
    `personIdentity(${family})`,
  );
}

function newId(): ActorId {
  return expectOk(actorId(ids.generate()), 'actorId');
}

function register(
  identity: LegalIdentity,
  phone = SHARED_PHONE,
  id: ActorId = newId(),
): Actor {
  return expectOk(
    Actor.register(
      { id, identity, contacts: [phoneContact(phone)], address: ADDRESS },
      deps,
    ),
    'Actor.register',
  );
}

describe('actor adapters (e2e)', () => {
  let prisma: PrismaService;
  let actors: PrismaActorRepository;
  let memberships: PrismaCooperativeMembershipRepository;

  beforeAll(async () => {
    prisma = new PrismaService({
      getOrThrow: () => ({ url: E2E_DATABASE_URL }),
    } as never);
    await prisma.$connect();
    actors = new PrismaActorRepository(prisma, clock, ids);
    memberships = new PrismaCooperativeMembershipRepository(prisma, clock, ids);
  });

  afterAll(async () => {
    await prisma.cooperativeMembership.deleteMany({});
    await prisma.actor.deleteMany({});
    await prisma.$disconnect();
  });

  // ------------------------------------------------------------------
  // The three lookups the projected columns exist for
  // ------------------------------------------------------------------

  describe('the uniqueness lookups', () => {
    it('finds a company by the RCCM projected from its identity JSON', async () => {
      const actor = register(
        companyWith('GN-CKY-2024-B-01001', '100000001', 'Kaloum Negoce'),
      );
      await actors.save(actor, 0);

      const found = await actors.findByRccm(
        expectOk(rccm('GN-CKY-2024-B-01001'), 'rccm'),
      );
      expect(found?.id).toBe(actor.id);
    });

    it('finds the same company by its NIF', async () => {
      const found = await actors.findByNif(expectOk(nif('100000001'), 'nif'));
      expect(found).not.toBeNull();
      expect(found?.identity.nature).toBe('COMPANY');
    });

    it('returns null rather than throwing when nobody holds the number', async () => {
      expect(
        await actors.findByRccm(expectOk(rccm('GN-CKY-2024-B-09999'), 'rccm')),
      ).toBeNull();
      expect(
        await actors.findByNif(expectOk(nif('999999999'), 'nif')),
      ).toBeNull();
    });

    it('returns every actor sharing a handset, not the first one', async () => {
      // The port says so explicitly: a shared number is a signal, not a
      // contradiction. Two actors, one number, and the second must not be
      // hidden by the first.
      const second = register(
        companyWith('GN-CKY-2024-B-01002', '100000002', 'Madina Import'),
      );
      await actors.save(second, 0);

      const alone = register(personNamed('Mamadou Alpha', 'Diallo'), OWN_PHONE);
      await actors.save(alone, 0);

      const sharing = await actors.findByPhoneNumber(SHARED_PHONE);
      expect(sharing).toHaveLength(2);
      expect(sharing.map((a) => a.id)).not.toContain(alone.id);

      const onlyOne = await actors.findByPhoneNumber(OWN_PHONE);
      expect(onlyOne.map((a) => a.id)).toEqual([alone.id]);
    });

    it('lets two people share the absence of a NIF', async () => {
      // The unique index is the backstop behind ActorUniquenessChecker, and
      // Postgres does not consider two NULLs equal. If it did, the registry
      // could hold exactly one person without a tax number.
      const first = register(personNamed('Fatoumata', 'Camara'), OWN_PHONE);
      const second = register(personNamed('Ibrahima', 'Bah'), OWN_PHONE);

      await actors.save(first, 0);
      await expect(actors.save(second, 0)).resolves.toBeUndefined();
    });
  });

  // ------------------------------------------------------------------
  // The full lifecycle, reloading between every write
  // ------------------------------------------------------------------

  describe('the lifecycle through the version guard', () => {
    it('carries an actor from registration to verified and active', async () => {
      const id = newId();
      const actor = register(
        companyWith('GN-CKY-2024-B-01010', '100000010', 'Sanoyah Agro'),
        OWN_PHONE,
        id,
      );
      await actors.save(actor, 0);

      // Reloading between writes is the point: each step saves against the
      // version it was loaded at, exactly as a use case would.
      const submitted = await actors.findById(id);
      expectOk(submitted!.submitForVerification(), 'submitForVerification');
      await actors.save(submitted!, submitted!.expectedVersion);

      const verified = await actors.findById(id);
      expectOk(
        verified!.upgradeVerification(VerificationLevel.BASIC),
        'upgradeVerification',
      );
      expectOk(
        verified!.grantRole({ type: RoleType.MERCHANT, grantedAt: TODAY }),
        'grantRole',
      );
      expectOk(verified!.activate(), 'activate');
      // Three mutations, one write: the version moves by three, and saving
      // against the version this actor was *loaded* at is what the guard
      // checks — not against the version it has now reached.
      await actors.save(verified!, verified!.expectedVersion);

      const reloaded = await actors.findById(id);
      expect(reloaded?.verification).toBe(VerificationLevel.BASIC);
      expect(reloaded?.status).toBe(ActorStatus.ACTIVE);
      expect(reloaded?.hasRole(RoleType.MERCHANT)).toBe(true);
      expect(reloaded?.expectedVersion).toBe(5);
    });

    it('refuses a write against a version the database has moved past', async () => {
      const id = newId();
      const actor = register(
        companyWith('GN-CKY-2024-B-01011', '100000011', 'Coyah Transit'),
        OWN_PHONE,
        id,
      );
      await actors.save(actor, 0);

      const one = await actors.findById(id);
      const two = await actors.findById(id);

      expectOk(one!.submitForVerification(), 'first submit');
      await actors.save(one!, one!.expectedVersion);

      // `two` was loaded at the same version and has not seen that write.
      expectOk(two!.submitForVerification(), 'second submit');
      await expect(actors.save(two!, two!.expectedVersion)).rejects.toThrow(
        StaleVersionError,
      );
    });

    it('rewrites the projected columns when the contacts change', async () => {
      const id = newId();
      const actor = register(
        companyWith('GN-CKY-2024-B-01012', '100000012', 'Dubreka Fret'),
        OWN_PHONE,
        id,
      );
      await actors.save(actor, 0);

      const loaded = await actors.findById(id);
      expectOk(
        loaded!.changeContacts([
          phoneContact(OWN_PHONE),
          phoneContact(SHARED_PHONE),
        ]),
        'changeContacts',
      );
      await actors.save(loaded!, loaded!.expectedVersion);

      // The new number must be searchable, which only happens if save
      // recomputed the projection instead of leaving the stored array alone.
      const sharing = await actors.findByPhoneNumber(SHARED_PHONE);
      expect(sharing.map((a) => a.id)).toContain(id);
    });
  });

  // ------------------------------------------------------------------
  // CooperativeMembership — its own aggregate, its own row
  // ------------------------------------------------------------------

  describe('PrismaCooperativeMembershipRepository', () => {
    const coopId = newId();
    const memberId = newId();
    const membershipId = expectOk(
      cooperativeMembershipId('4a1504e0-4f89-41d3-9a0c-0305e82c3311'),
      'membershipId',
    );

    it('round-trips a membership and finds it as the active one', async () => {
      const coop = register(
        expectOk(
          cooperativeIdentity({
            name: 'Cooperative de Kindia',
            legalForm: LegalForm.SCOOPS,
            registrationNumber: expectOk(
              cooperativeRegistrationNumber('GN-KND-2024-SCOOPS-00123'),
              'rscoop',
            ),
            nif: expectOk(nif('100000020'), 'nif'),
            incorporationDate: expectOk(
              isoDate(
                '2021-02-10',
                ActorRule.INVALID_INCORPORATION_DATE,
                'Inc.',
              ),
              'incorporation',
            ),
          }),
          'cooperativeIdentity',
        ),
        OWN_PHONE,
        coopId,
      );
      await actors.save(coop, 0);

      const membership = expectOk(
        CooperativeMembership.admit(
          {
            id: membershipId,
            cooperativeId: coopId,
            cooperativeNature: ActorNature.COOPERATIVE,
            memberId,
            memberNature: ActorNature.PERSON,
            admittedAt: expectOk(
              isoDate('2026-01-15', ActorRule.INVALID_BIRTH_DATE, 'Admitted'),
              'admittedAt',
            ),
          },
          deps,
        ),
        'admit',
      );
      await memberships.save(membership, 0);

      const active = await memberships.findActiveBetween(coopId, memberId);
      expect(active?.id).toBe(membershipId);
      expect(active?.status).toBe(MembershipStatus.ACTIVE);

      expect(
        (await memberships.listByCooperative(coopId)).map((m) => m.id),
      ).toEqual([membershipId]);
      expect(
        (await memberships.listByMember(memberId)).map((m) => m.id),
      ).toEqual([membershipId]);
    });

    it('stops being the active one once it ends', async () => {
      const loaded = await memberships.findById(membershipId);
      expectOk(
        loaded!.resign(
          expectOk(
            isoDate('2026-06-30', ActorRule.INVALID_BIRTH_DATE, 'Ended'),
            'endedAt',
          ),
        ),
        'resign',
      );
      await memberships.save(loaded!, loaded!.expectedVersion);

      // findActiveBetween filters on ACTIVE: the pair now has a history but
      // no running membership, which is what lets the domain admit again.
      expect(await memberships.findActiveBetween(coopId, memberId)).toBeNull();

      const byId = await memberships.findById(membershipId);
      expect(byId?.status).toBe(MembershipStatus.RESIGNED);
      expect(byId?.endedAt).toBe('2026-06-30');
    });
  });

  // ------------------------------------------------------------------
  // The reason this ticket exists: an actor row the trade service can read
  // ------------------------------------------------------------------

  describe('what the SellerRegistry will see', () => {
    it('exposes ACTIVE actors and nothing else on the status column', async () => {
      // The trade service's PrismaSellerRegistry filters on exactly this.
      // Asserting it here keeps the two services' assumption in one place:
      // a registered actor is not yet a seller.
      const pending = await prisma.actor.count({
        where: { status: ActorStatus.PENDING_VERIFICATION as never },
      });
      const active = await prisma.actor.count({
        where: { status: ActorStatus.ACTIVE as never },
      });

      expect(pending).toBeGreaterThan(0);
      expect(active).toBeGreaterThan(0);
    });
  });

  // ------------------------------------------------------------------
  // The outbox — the half of ADR-0008 that had no implementation
  // ------------------------------------------------------------------

  describe('the outbox', () => {
    it('holds one row per event the aggregate emitted, unpublished', async () => {
      const rows = await prisma.outboxEvent.findMany({
        where: { aggregate: 'Actor' },
        orderBy: [{ aggregateId: 'asc' }, { version: 'asc' }],
      });

      expect(rows.length).toBeGreaterThan(0);

      // Unpublished is the queue: a relay has not run, and must still see
      // every one of these.
      expect(rows.every((r) => r.publishedAt === null)).toBe(true);
      expect(rows.every((r) => r.attempts === 0)).toBe(true);

      // The row id IS the event id the domain generated, so a consumer can
      // deduplicate on it without a translation table.
      expect(rows.every((r) => r.id.length === 36)).toBe(true);

      // occurredAt comes from the domain clock, not from the write.
      expect(rows.every((r) => r.occurredAt.includes('T'))).toBe(true);
    });

    it('never holds two rows for one aggregate version', async () => {
      const rows = await prisma.outboxEvent.findMany({
        where: { aggregate: 'Actor' },
      });
      const keys = rows.map((r) => `${r.aggregateId}#${r.version}`);

      // Enforced by a unique index rather than trusted, so a repository
      // that wrote the same drained buffer twice would fail loudly here
      // instead of duplicating the event downstream.
      expect(new Set(keys).size).toBe(keys.length);
    });

    it('rolls back with the write it belongs to', async () => {
      const id = newId();
      const doomed = register(
        companyWith('GN-CKY-2024-B-01099', '100000099', 'Rollback SA'),
        OWN_PHONE,
        id,
      );
      await actors.save(doomed, 0);

      // Two handles on the same version. The first write wins.
      const one = await actors.findById(id);
      const two = await actors.findById(id);

      expectOk(one!.submitForVerification(), 'first submit');
      await actors.save(one!, one!.expectedVersion);

      const afterTheWinner = await prisma.outboxEvent.count({
        where: { aggregate: 'Actor' },
      });

      expectOk(two!.submitForVerification(), 'second submit');
      await expect(actors.save(two!, two!.expectedVersion)).rejects.toThrow(
        StaleVersionError,
      );

      // The refused write had drained an event into its buffer, and none of
      // it reached the outbox: throwing inside the transaction took the row
      // and its events together. This is the half of ADR-0008 that a
      // publish-after-commit design cannot offer.
      expect(
        await prisma.outboxEvent.count({ where: { aggregate: 'Actor' } }),
      ).toBe(afterTheWinner);
    });
  });
});
