import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length, MinLength } from 'class-validator';

/**
 * The area search filters.
 *
 * `country` is required rather than optional. A code is unique per country
 * and level, and names repeat across borders — a search without a country
 * would either scan every country or silently pick one, and both are worse
 * than asking.
 */
export class FindAreasQuery {
  @ApiProperty({ description: 'ISO 3166-1 alpha-2.', example: 'GN' })
  @IsString()
  @Length(2, 2, { message: 'country must be a 2-letter ISO code' })
  country!: string;

  @ApiPropertyOptional({
    description: 'Matches official names and aliases in that country.',
    example: 'Kindia',
  })
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'name must be at least 2 characters' })
  name?: string;

  @ApiPropertyOptional({
    description: 'The area code, unique for the country and level.',
    example: 'GN-KND',
  })
  @IsOptional()
  @IsString()
  code?: string;
}
