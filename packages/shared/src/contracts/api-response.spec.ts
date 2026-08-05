import { ErrorCode } from '../errors/error-codes';
import {
  API_VERSION,
  errorResponse,
  isSuccessResponse,
  successResponse,
} from './api-response';

const AT = '2026-07-27T10:15:30.000Z';

describe('API response envelope', () => {
  describe('successResponse', () => {
    it('wraps the payload with the standard fields', () => {
      expect(
        successResponse({ id: '1' }, undefined, { timestamp: AT }),
      ).toEqual({
        success: true,
        data: { id: '1' },
        timestamp: AT,
        version: API_VERSION,
      });
    });

    it('includes the trace id when the context has one', () => {
      const response = successResponse(null, undefined, {
        traceId: 'trace-1',
        timestamp: AT,
      });
      expect(response.traceId).toBe('trace-1');
    });

    // Absent rather than explicitly null: clients checking `'traceId' in res`
    // should get a truthful answer.
    it('omits the trace id entirely when there is none', () => {
      expect(
        'traceId' in successResponse(null, undefined, { timestamp: AT }),
      ).toBe(false);
    });

    it('carries pagination metadata', () => {
      const response = successResponse([1, 2], {
        pagination: {
          page: 1,
          pageSize: 2,
          totalItems: 2,
          totalPages: 1,
          hasNextPage: false,
          hasPreviousPage: false,
        },
      });
      expect(response.meta?.pagination?.totalItems).toBe(2);
    });

    it('preserves a null payload rather than dropping it', () => {
      expect(successResponse(null).data).toBeNull();
    });
  });

  describe('errorResponse', () => {
    it('wraps the error with the standard fields', () => {
      const response = errorResponse(
        { code: ErrorCode.NOT_FOUND, message: 'Actor not found' },
        { path: '/actors/1', requestId: 'req-1', timestamp: AT },
      );

      expect(response).toEqual({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Actor not found' },
        path: '/actors/1',
        requestId: 'req-1',
        timestamp: AT,
        version: API_VERSION,
      });
    });

    it('carries per-field validation messages', () => {
      const response = errorResponse({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'Validation failed',
        fields: { email: ['must be an email'] },
      });
      expect(response.error.fields?.email).toEqual(['must be an email']);
    });
  });

  describe('isSuccessResponse', () => {
    it('narrows a success', () => {
      const response = successResponse({ id: '1' });
      expect(isSuccessResponse(response)).toBe(true);
      if (isSuccessResponse(response)) expect(response.data.id).toBe('1');
    });

    it('rejects a failure', () => {
      expect(
        isSuccessResponse(
          errorResponse({ code: ErrorCode.INTERNAL_ERROR, message: 'boom' }),
        ),
      ).toBe(false);
    });
  });
});
