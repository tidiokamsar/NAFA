import { SetMetadata } from '@nestjs/common';
import { POLICIES_KEY } from './metadata.keys';

/**
 * Requires every named ABAC policy to permit the call.
 *
 * Policies are referenced by name and must be registered with
 * {@link PolicyEngine}; an unknown name denies rather than passes.
 *
 * ```ts
 * @Policies('same-tenant', 'business-hours')
 * @Get(':id')
 * findOne() { ... }
 * ```
 */
export const Policies = (...policies: string[]) =>
  SetMetadata(POLICIES_KEY, policies);
