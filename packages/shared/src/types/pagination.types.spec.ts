import {
  clampPageSize,
  MAX_PAGE_SIZE,
  DEFAULT_PAGE_SIZE,
} from '../constants/pagination';
import { buildPageMeta, pageOffset } from './pagination.types';

describe('pagination', () => {
  describe('clampPageSize', () => {
    it('keeps a valid size', () => {
      expect(clampPageSize(10)).toBe(10);
    });

    it('falls back to the default when absent or invalid', () => {
      expect(clampPageSize(undefined)).toBe(DEFAULT_PAGE_SIZE);
      expect(clampPageSize(0)).toBe(DEFAULT_PAGE_SIZE);
      expect(clampPageSize(-5)).toBe(DEFAULT_PAGE_SIZE);
      expect(clampPageSize(Number.NaN)).toBe(DEFAULT_PAGE_SIZE);
    });

    // Clamping rather than rejecting: an unbounded page is how one client
    // accidentally takes a service down.
    it('clamps above the maximum', () => {
      expect(clampPageSize(10_000)).toBe(MAX_PAGE_SIZE);
    });

    it('floors a fractional size', () => {
      expect(clampPageSize(10.9)).toBe(10);
    });
  });

  describe('buildPageMeta', () => {
    it('computes a middle page', () => {
      expect(buildPageMeta(2, 10, 35)).toEqual({
        page: 2,
        pageSize: 10,
        totalItems: 35,
        totalPages: 4,
        hasNextPage: true,
        hasPreviousPage: true,
      });
    });

    it('marks the first page as having no previous', () => {
      expect(buildPageMeta(1, 10, 35).hasPreviousPage).toBe(false);
    });

    it('marks the last page as having no next', () => {
      expect(buildPageMeta(4, 10, 35).hasNextPage).toBe(false);
    });

    // "Page 1 of 0" is nonsense in a UI.
    it('reports at least one page when there are no results', () => {
      const meta = buildPageMeta(1, 10, 0);
      expect(meta.totalPages).toBe(1);
      expect(meta.hasNextPage).toBe(false);
      expect(meta.hasPreviousPage).toBe(false);
    });
  });

  describe('pageOffset', () => {
    it('is zero for the first page', () => {
      expect(pageOffset(1, 25)).toBe(0);
    });

    it('skips whole pages', () => {
      expect(pageOffset(3, 25)).toBe(50);
    });

    it('never goes negative', () => {
      expect(pageOffset(0, 25)).toBe(0);
      expect(pageOffset(-2, 25)).toBe(0);
    });
  });
});
