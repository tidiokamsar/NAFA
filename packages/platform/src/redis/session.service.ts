import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { randomUUID } from 'node:crypto';
import { REDIS_CLIENT } from './redis.constants';

const SESSION_PREFIX = 'session:';
const USER_SESSIONS_PREFIX = 'user-sessions:';

export interface SessionRecord {
  userId: string;
  createdAt: string;
  /** Free-form extras (device, ip, roles snapshot, ...). */
  metadata?: Record<string, unknown>;
}

export type NewSession = Omit<SessionRecord, 'createdAt'>;

/**
 * Redis-backed session store.
 *
 * Deliberately transport-agnostic: it stores and revokes session records but
 * takes no view on how a session id reaches the client (cookie, header, or
 * bearer token). Services layer their own auth semantics on top.
 */
@Injectable()
export class SessionService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  private key(sessionId: string): string {
    return `${SESSION_PREFIX}${sessionId}`;
  }

  private userKey(userId: string): string {
    return `${USER_SESSIONS_PREFIX}${userId}`;
  }

  /** Creates a session and returns its id. */
  async create(data: NewSession, ttlSeconds: number): Promise<string> {
    const sessionId = randomUUID();
    const record: SessionRecord = {
      ...data,
      createdAt: new Date().toISOString(),
    };

    // The user index lets `destroyAllForUser` revoke every session at once
    // (password change, forced logout) without scanning the keyspace.
    await this.redis
      .multi()
      .set(this.key(sessionId), JSON.stringify(record), 'EX', ttlSeconds)
      .sadd(this.userKey(data.userId), sessionId)
      .expire(this.userKey(data.userId), ttlSeconds)
      .exec();

    return sessionId;
  }

  async get(sessionId: string): Promise<SessionRecord | null> {
    const raw = await this.redis.get(this.key(sessionId));
    return raw ? (JSON.parse(raw) as SessionRecord) : null;
  }

  /** Slides the expiry window on an active session. */
  async touch(sessionId: string, ttlSeconds: number): Promise<boolean> {
    const result = await this.redis.expire(this.key(sessionId), ttlSeconds);
    return result === 1;
  }

  async destroy(sessionId: string): Promise<void> {
    const record = await this.get(sessionId);
    const pipeline = this.redis.multi().del(this.key(sessionId));
    if (record) {
      pipeline.srem(this.userKey(record.userId), sessionId);
    }
    await pipeline.exec();
  }

  async destroyAllForUser(userId: string): Promise<number> {
    const sessionIds = await this.redis.smembers(this.userKey(userId));
    if (sessionIds.length === 0) return 0;

    await this.redis
      .multi()
      .del(...sessionIds.map((id) => this.key(id)))
      .del(this.userKey(userId))
      .exec();

    return sessionIds.length;
  }
}
