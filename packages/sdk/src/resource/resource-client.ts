import {
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
  clampPageSize,
  type Page,
  type PageRequest,
  type SortSpec,
} from '@nafa/shared';
import type { HttpClient } from '../client/http-client';
import type { RequestOptions } from '../client/http-client.types';

export interface ListQuery extends Partial<PageRequest> {
  /** Free-text search, when the endpoint supports it. */
  search?: string;
  /** Extra endpoint-specific filters. */
  filters?: Record<string, string | number | boolean | undefined>;
}

/** Serialises sort specs as `field:direction`, comma-separated. */
function serialiseSort(sort?: SortSpec[]): string | undefined {
  if (!sort || sort.length === 0) return undefined;
  return sort.map((s) => `${s.field}:${s.direction}`).join(',');
}

/**
 * Typed CRUD over one REST resource.
 *
 * Saves every caller from re-deriving paths, query serialisation and
 * pagination. `TCreate` and `TUpdate` are separate from `T` because what you
 * send rarely matches what you get back — a server assigns ids and audit
 * columns.
 *
 * ```ts
 * const actors = new ResourceClient<Actor>(http, '/actors');
 * for await (const actor of actors.iterate()) { ... }
 * ```
 */
export class ResourceClient<T, TCreate = Partial<T>, TUpdate = Partial<T>> {
  constructor(
    private readonly http: HttpClient,
    private readonly basePath: string,
  ) {}

  /** One page. The server's envelope metadata drives pagination. */
  list(query: ListQuery = {}, options: RequestOptions = {}): Promise<Page<T>> {
    return this.http.get<Page<T>>(this.basePath, {
      ...options,
      query: {
        page: query.page ?? DEFAULT_PAGE,
        pageSize: clampPageSize(query.pageSize ?? DEFAULT_PAGE_SIZE),
        sort: serialiseSort(query.sort),
        search: query.search,
        ...query.filters,
      },
    });
  }

  findById(id: string, options: RequestOptions = {}): Promise<T> {
    return this.http.get<T>(
      `${this.basePath}/${encodeURIComponent(id)}`,
      options,
    );
  }

  /**
   * @param idempotencyKey pass one to make the create safely retryable —
   *   without it a network blip on a POST cannot be retried, by design.
   */
  create(
    payload: TCreate,
    options: RequestOptions & { idempotencyKey?: string } = {},
  ): Promise<T> {
    return this.http.post<T>(this.basePath, payload, options);
  }

  update(
    id: string,
    payload: TUpdate,
    options: RequestOptions = {},
  ): Promise<T> {
    return this.http.patch<T>(
      `${this.basePath}/${encodeURIComponent(id)}`,
      payload,
      options,
    );
  }

  replace(
    id: string,
    payload: TCreate,
    options: RequestOptions = {},
  ): Promise<T> {
    return this.http.put<T>(
      `${this.basePath}/${encodeURIComponent(id)}`,
      payload,
      options,
    );
  }

  remove(id: string, options: RequestOptions = {}): Promise<void> {
    return this.http.delete<void>(
      `${this.basePath}/${encodeURIComponent(id)}`,
      options,
    );
  }

  /**
   * Walks every page, yielding items one by one.
   *
   * Fetches lazily: a consumer that stops early stops the requests too, so
   * "find the first match" does not download the whole collection.
   */
  async *iterate(
    query: ListQuery = {},
    options: RequestOptions = {},
  ): AsyncGenerator<T, void, undefined> {
    let page = query.page ?? DEFAULT_PAGE;

    for (;;) {
      const result = await this.list({ ...query, page }, options);
      for (const item of result.items) {
        yield item;
      }
      if (!result.meta?.hasNextPage) return;
      page += 1;
    }
  }

  /**
   * Collects every page into one array.
   *
   * @param maxItems safety valve — without a bound, one call against a large
   *   collection can exhaust memory. Defaults to 10 000.
   */
  async listAll(
    query: ListQuery = {},
    maxItems = 10_000,
    options: RequestOptions = {},
  ): Promise<T[]> {
    const items: T[] = [];
    for await (const item of this.iterate(query, options)) {
      items.push(item);
      if (items.length >= maxItems) break;
    }
    return items;
  }
}
