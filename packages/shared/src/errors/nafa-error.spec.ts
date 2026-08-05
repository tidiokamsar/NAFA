import { ErrorCode } from './error-codes';
import {
  BusinessRuleError,
  ForbiddenError,
  NafaError,
  NotFoundError,
  StaleVersionError,
} from './nafa-error';

describe('NafaError', () => {
  it('derives the HTTP status from the code', () => {
    expect(new NotFoundError('Actor').status).toBe(404);
    expect(new ForbiddenError().status).toBe(403);
    expect(new BusinessRuleError('nope').status).toBe(422);
  });

  it('lets the status be overridden', () => {
    const error = new NafaError(ErrorCode.CONFLICT, 'custom', { status: 418 });
    expect(error.status).toBe(418);
  });

  // Subclassing Error breaks the prototype chain without an explicit fix,
  // which would make every `instanceof` check silently false.
  it('keeps instanceof working through the hierarchy', () => {
    const error = new NotFoundError('Actor', '42');
    expect(error).toBeInstanceOf(NotFoundError);
    expect(error).toBeInstanceOf(NafaError);
    expect(error).toBeInstanceOf(Error);
  });

  it('reports the concrete subclass name', () => {
    expect(new NotFoundError('Actor').name).toBe('NotFoundError');
  });

  it('recognises its own errors', () => {
    expect(NafaError.isNafaError(new ForbiddenError())).toBe(true);
    expect(NafaError.isNafaError(new Error('plain'))).toBe(false);
    expect(NafaError.isNafaError('not an error')).toBe(false);
  });

  it('builds a message with and without an id', () => {
    expect(new NotFoundError('Actor', '42').message).toBe('Actor 42 not found');
    expect(new NotFoundError('Actor').message).toBe('Actor not found');
  });

  it('carries structured details', () => {
    const error = new NotFoundError('Actor', '42');
    expect(error.details).toMatchObject({ entity: 'Actor', id: '42' });
  });

  it('preserves the underlying cause', () => {
    const cause = new Error('connection reset');
    const error = new NafaError(ErrorCode.INTERNAL_ERROR, 'wrapped', { cause });
    expect(error.cause).toBe(cause);
  });

  it('reports both versions on a stale write', () => {
    const error = new StaleVersionError('Actor', 3, 5);
    expect(error.code).toBe(ErrorCode.STALE_VERSION);
    expect(error.status).toBe(409);
    expect(error.details).toMatchObject({ expected: 3, actual: 5 });
  });
});
