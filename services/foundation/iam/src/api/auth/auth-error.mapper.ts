import { ConflictException, UnauthorizedException } from '@nestjs/common';
import {
  EmailAlreadyRegisteredError,
  InvalidCredentialsError,
} from '../../application';

/**
 * The one place application failures become HTTP.
 *
 * A mapper rather than an `ExceptionFilter`: `@nafa/platform` already installs
 * a global filter that renders every `HttpException` into the shared
 * `ErrorResponse` envelope. Re-throwing the exact exception the use cases used
 * to throw feeds that filter identical input, so the response bodies are
 * unchanged by construction — a controller-scoped filter would have taken
 * precedence over the global one and forced this layer to reproduce the
 * envelope by hand.
 *
 * Anything unrecognised is rethrown untouched, so a genuine bug still reaches
 * the global filter as a 500 instead of being flattened into a 4xx.
 */
export function toHttpException(error: unknown): never {
  if (error instanceof EmailAlreadyRegisteredError) {
    throw new ConflictException(error.message);
  }

  if (error instanceof InvalidCredentialsError) {
    throw new UnauthorizedException(error.message);
  }

  throw error;
}
