import { Injectable } from '@nestjs/common';
// `Clock` and `IdGenerator` are imported as VALUES, not types. They are
// abstract classes used as DI tokens, and a `type` import is erased at
// compile time — `emitDecoratorMetadata` then records `Function` instead of
// the class, and Nest has no token to resolve. The service still typechecks,
// still builds, and fails only when something actually boots the module.
// Nothing did until the first HTTP e2e (ADR-0014 §4).
import { Clock, IdGenerator, StaleVersionError } from '@nafa/shared';
import {
  Actor,
  type ActorId,
  type ActorRepository,
  type Nif,
  type PhoneNumber,
  type Rccm,
} from '@nafa/foundation';
import { PrismaService } from './prisma.service';
import {
  actorToRow,
  actorToSnapshot,
  type ActorPrismaRow,
} from '../mappers/actor.mapper';

/**
 * Prisma adapter for the ActorRepository port.
 *
 * Two things are worth knowing about this class.
 *
 * The three lookups by RCCM, NIF and phone number read the projected
 * columns, not the JSON. That is the whole reason those columns exist: a
 * uniqueness question is about the collection, and only an index can answer
 * it at the size the registry will reach.
 *
 * `save` updates every column but one, unlike the offer repository which
 * narrows to price and status. An offer has an immutable identity; an actor
 * does not — a legal name is corrected, a company changes address, a role is
 * granted, the verification level rises. Every one of those is a legitimate
 * mutation of a stored actor, so narrowing the update would silently drop
 * whichever the domain had just changed. `expectedVersion` in the WHERE
 * clause is what keeps that safe.
 *
 * The exception is `nature`. A person does not become a company: the nature
 * is fixed when the identity is, so it is written on insert and never
 * touched again. Leaving it out of the update is the column-level statement
 * of that rule.
 */
@Injectable()
export class PrismaActorRepository implements ActorRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  async findById(id: ActorId): Promise<Actor | null> {
    const row = await this.prisma.actor.findFirst({
      where: { id: id as string, deletedAt: null },
    });
    return row ? this.rehydrate(row) : null;
  }

  async findByRccm(rccm: Rccm): Promise<Actor | null> {
    const row = await this.prisma.actor.findFirst({
      where: { rccm: rccm as string, deletedAt: null },
    });
    return row ? this.rehydrate(row) : null;
  }

  async findByNif(nif: Nif): Promise<Actor | null> {
    const row = await this.prisma.actor.findFirst({
      where: { nif: nif as string, deletedAt: null },
    });
    return row ? this.rehydrate(row) : null;
  }

  /**
   * Every actor reachable on this number.
   *
   * `has` is a containment test on the array column, served by the GIN
   * index. A list rather than one actor because sharing a handset is
   * ordinary in these markets — the port says so explicitly.
   */
  async findByPhoneNumber(phone: PhoneNumber): Promise<readonly Actor[]> {
    const rows = await this.prisma.actor.findMany({
      where: { phoneNumbers: { has: phone as string }, deletedAt: null },
    });
    return rows.map((row) => this.rehydrate(row));
  }

  async save(actor: Actor, expectedVersion: number): Promise<void> {
    const row = actorToRow(actor.snapshot());

    if (expectedVersion === 0) {
      await this.prisma.actor.create({
        data: {
          id: row.id,
          nature: row.nature as never,
          identity: row.identity as never,
          address: row.address as never,
          contacts: row.contacts as never,
          roles: row.roles as never,
          status: row.status as never,
          verification: row.verification as never,
          rccm: row.rccm,
          nif: row.nif,
          phoneNumbers: row.phoneNumbers,
          version: row.version,
        },
      });
      return;
    }

    const result = await this.prisma.actor.updateMany({
      where: { id: row.id, version: expectedVersion, deletedAt: null },
      data: {
        identity: row.identity as never,
        address: row.address as never,
        contacts: row.contacts as never,
        roles: row.roles as never,
        status: row.status as never,
        verification: row.verification as never,
        rccm: row.rccm,
        nif: row.nif,
        phoneNumbers: row.phoneNumbers,
        // The aggregate's own count, not `increment: 1`. An actor can apply
        // several mutations before one save — verify, grant a role, activate
        // — and its version moves once per event. Incrementing by one would
        // store 3 where the aggregate says 5, so the next load would hand a
        // use case a version the domain never produced.
        version: row.version,
      },
    });

    if (result.count === 0) {
      throw new StaleVersionError('Actor', expectedVersion, actor.version);
    }
  }

  private rehydrate(row: ActorPrismaRow): Actor {
    return Actor.rehydrate(actorToSnapshot(row), {
      clock: this.clock,
      ids: this.ids,
    });
  }
}
