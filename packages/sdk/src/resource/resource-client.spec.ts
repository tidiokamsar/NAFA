import type { Page } from '@nafa/shared';
import { HttpClient } from '../client/http-client';
import type { FetchLike } from '../client/http-client.types';
import { ResourceClient } from './resource-client';

interface Actor {
  id: string;
  name: string;
}

function page(
  items: Actor[],
  pageNumber: number,
  totalPages: number,
): Page<Actor> {
  return {
    items,
    meta: {
      page: pageNumber,
      pageSize: items.length,
      totalItems: totalPages * items.length,
      totalPages,
      hasNextPage: pageNumber < totalPages,
      hasPreviousPage: pageNumber > 1,
    },
  };
}

function envelope<T>(data: T) {
  return {
    success: true,
    data,
    timestamp: '2026-07-28T10:00:00.000Z',
    version: 'v1',
  };
}

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => body,
  } as unknown as Response;
}

function setup(pages: Page<Actor>[]) {
  const calls: string[] = [];
  let index = 0;

  const impl: FetchLike = async (url) => {
    calls.push(url);
    const body = pages[Math.min(index, pages.length - 1)];
    index += 1;
    return jsonResponse(envelope(body));
  };

  const http = new HttpClient({
    baseUrl: 'https://api.nafa.test',
    fetch: impl,
    sleep: async () => undefined,
  });

  return { actors: new ResourceClient<Actor>(http, '/actors'), calls };
}

describe('ResourceClient', () => {
  describe('list', () => {
    it('sends default pagination', async () => {
      const { actors, calls } = setup([page([{ id: '1', name: 'A' }], 1, 1)]);
      await actors.list();
      expect(calls[0]).toContain('page=1');
      expect(calls[0]).toContain('pageSize=25');
    });

    // Guards against a caller taking the service down with pageSize=100000.
    it('clamps an oversized page size', async () => {
      const { actors, calls } = setup([page([], 1, 1)]);
      await actors.list({ pageSize: 10_000 });
      expect(calls[0]).toContain('pageSize=100');
    });

    it('serialises sort specs', async () => {
      const { actors, calls } = setup([page([], 1, 1)]);
      await actors.list({ sort: [{ field: 'name', direction: 'asc' }] });
      expect(decodeURIComponent(calls[0])).toContain('sort=name:asc');
    });

    it('passes through search and filters', async () => {
      const { actors, calls } = setup([page([], 1, 1)]);
      await actors.list({ search: 'conakry', filters: { status: 'active' } });
      expect(calls[0]).toContain('search=conakry');
      expect(calls[0]).toContain('status=active');
    });
  });

  describe('single-item operations', () => {
    it('encodes the id in the path', async () => {
      const { actors, calls } = setup([page([], 1, 1)]);
      await actors.findById('a/b');
      expect(calls[0]).toBe('https://api.nafa.test/actors/a%2Fb');
    });
  });

  describe('iterate', () => {
    it('walks every page', async () => {
      const { actors } = setup([
        page([{ id: '1', name: 'A' }], 1, 3),
        page([{ id: '2', name: 'B' }], 2, 3),
        page([{ id: '3', name: 'C' }], 3, 3),
      ]);

      const seen: string[] = [];
      for await (const actor of actors.iterate()) seen.push(actor.id);

      expect(seen).toEqual(['1', '2', '3']);
    });

    // Lazy fetching: "find the first match" must not download everything.
    it('stops requesting when the consumer breaks early', async () => {
      const { actors, calls } = setup([
        page([{ id: '1', name: 'A' }], 1, 3),
        page([{ id: '2', name: 'B' }], 2, 3),
        page([{ id: '3', name: 'C' }], 3, 3),
      ]);

      for await (const actor of actors.iterate()) {
        if (actor.id === '1') break;
      }

      expect(calls).toHaveLength(1);
    });

    it('handles a single page', async () => {
      const { actors, calls } = setup([page([{ id: '1', name: 'A' }], 1, 1)]);
      const seen: string[] = [];
      for await (const actor of actors.iterate()) seen.push(actor.id);
      expect(seen).toEqual(['1']);
      expect(calls).toHaveLength(1);
    });

    it('handles an empty collection', async () => {
      const { actors } = setup([page([], 1, 1)]);
      const seen: Actor[] = [];
      for await (const actor of actors.iterate()) seen.push(actor);
      expect(seen).toEqual([]);
    });
  });

  describe('listAll', () => {
    it('collects every page', async () => {
      const { actors } = setup([
        page([{ id: '1', name: 'A' }], 1, 2),
        page([{ id: '2', name: 'B' }], 2, 2),
      ]);
      await expect(actors.listAll()).resolves.toHaveLength(2);
    });

    // Without a bound, one call against a large collection exhausts memory.
    it('stops at maxItems', async () => {
      const { actors } = setup([
        page([{ id: '1', name: 'A' }], 1, 99),
        page([{ id: '2', name: 'B' }], 2, 99),
      ]);
      await expect(actors.listAll({}, 1)).resolves.toHaveLength(1);
    });
  });
});
