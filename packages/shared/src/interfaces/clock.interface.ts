import type { IsoDateTime } from '../types/primitives';

/**
 * Time, as an injectable dependency.
 *
 * Domain code that calls `new Date()` directly cannot be tested for anything
 * date-dependent without freezing global time. Injecting a clock lets a test
 * pin "now" to a fixed instant instead.
 */
export abstract class Clock {
  abstract now(): Date;

  nowIso(): IsoDateTime {
    return this.now().toISOString() as IsoDateTime;
  }

  /** Epoch milliseconds. */
  timestamp(): number {
    return this.now().getTime();
  }
}

/** Real time. The production binding. */
export class SystemClock extends Clock {
  now(): Date {
    return new Date();
  }
}

/** A clock that stands still until moved. For tests. */
export class FixedClock extends Clock {
  constructor(private current: Date) {
    super();
  }

  now(): Date {
    return new Date(this.current);
  }

  set(instant: Date): void {
    this.current = instant;
  }

  advance(milliseconds: number): void {
    this.current = new Date(this.current.getTime() + milliseconds);
  }
}
