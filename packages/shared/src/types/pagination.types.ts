/** Sort direction, lowercase to match what arrives on a query string. */
export type SortDirection = 'asc' | 'desc';

export interface SortSpec {
  field: string;
  direction: SortDirection;
}

/** What a client asks for. */
export interface PageRequest {
  /** 1-based. Page 1 is the first page. */
  page: number;
  pageSize: number;
  sort?: SortSpec[];
}

/** Everything a client needs to render pagination controls. */
export interface PageMeta {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

/** A page of results plus its metadata. */
export interface Page<T> {
  items: T[];
  meta: PageMeta;
}

/**
 * Builds the metadata for a page.
 *
 * `totalPages` is at least 1 even with no results: reporting 0 pages makes
 * "page 1 of 0" appear in UIs, and clamps to a page that does not exist.
 */
export function buildPageMeta(
  page: number,
  pageSize: number,
  totalItems: number,
): PageMeta {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  return {
    page,
    pageSize,
    totalItems,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
  };
}

/** Offset for a 1-based page number, ready for `skip`/`OFFSET`. */
export function pageOffset(page: number, pageSize: number): number {
  return Math.max(0, (page - 1) * pageSize);
}
