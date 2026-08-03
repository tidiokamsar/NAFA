import {
  ConflictException,
  HttpException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  EmailAlreadyRegisteredError,
  InvalidCredentialsError,
} from '../../application';
import { toHttpException } from './auth-error.mapper';

/**
 * The refactor moved status codes out of the use cases. This is the file that
 * proves nothing was lost on the way: same status, same message as the
 * exceptions the use cases used to throw themselves.
 */
describe('toHttpException', () => {
  it('turns a duplicate email into 409 with the original wording', () => {
    try {
      toHttpException(new EmailAlreadyRegisteredError());
      fail('expected toHttpException to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(ConflictException);
      expect((error as HttpException).getStatus()).toBe(409);
      expect((error as HttpException).message).toBe('Email already registered');
    }
  });

  it('turns bad credentials into 401 with the original wording', () => {
    try {
      toHttpException(new InvalidCredentialsError());
      fail('expected toHttpException to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(UnauthorizedException);
      expect((error as HttpException).getStatus()).toBe(401);
      expect((error as HttpException).message).toBe('Invalid credentials');
    }
  });

  it('rethrows anything it does not recognise, untouched', () => {
    // A genuine bug must keep reaching the global filter as a 500 rather than
    // being flattened into a 4xx that reads like a client mistake.
    const bug = new TypeError('cannot read property of undefined');

    expect(() => toHttpException(bug)).toThrow(bug);
    try {
      toHttpException(bug);
    } catch (error) {
      expect(error).not.toBeInstanceOf(HttpException);
      expect(error).toBe(bug);
    }
  });
});
