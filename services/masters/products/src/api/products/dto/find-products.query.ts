import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { PRODUCT_CATEGORIES } from '@nafa/products';

/**
 * The list endpoint's filters.
 *
 * The category list comes from the domain rather than being retyped here.
 * A hand-written copy would be a second source of truth for the vocabulary
 * the Master owns, and it would drift the first time a category is added —
 * silently, since a stale enum rejects a value the domain accepts.
 *
 * `name` and `category` are mutually exclusive by design rather than by
 * validation: the repository exposes two separate lookups and no combined
 * one, so honouring both would mean inventing an intersection the Master
 * never defined. The controller documents the precedence instead of
 * pretending to support the combination.
 */
export class FindProductsQuery {
  @ApiPropertyOptional({
    description:
      'Matches the official name and the aliases, case-insensitively.',
    example: 'fonio',
  })
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'name must be at least 2 characters' })
  name?: string;

  @ApiPropertyOptional({ enum: PRODUCT_CATEGORIES, example: 'CEREAL' })
  @IsOptional()
  @IsIn([...PRODUCT_CATEGORIES], {
    message: `category must be one of: ${PRODUCT_CATEGORIES.join(', ')}`,
  })
  category?: string;
}
