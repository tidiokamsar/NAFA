import { randomUUID } from 'node:crypto';
import type { Uuid } from '../types/primitives';

/**
 * Identifier generation, as an injectable dependency.
 *
 * Same reason as {@link Clock}: an entity that generates its own random id is
 * awkward to assert on. Injecting the generator lets a test supply predictable
 * ids.
 */
export abstract class IdGenerator {
  abstract generate(): Uuid;
}

export class UuidGenerator extends IdGenerator {
  generate(): Uuid {
    return randomUUID() as Uuid;
  }
}

/** Returns ids from a fixed sequence, then falls back to a counter. */
export class SequentialIdGenerator extends IdGenerator {
  private index = 0;

  constructor(private readonly sequence: string[] = []) {
    super();
  }

  generate(): Uuid {
    const next = this.sequence[this.index] ?? `id-${this.index}`;
    this.index += 1;
    return next as Uuid;
  }
}
