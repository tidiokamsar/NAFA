import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { AdministrativeArea, CountryProfile } from '@nafa/geography';

/**
 * An administrative area over HTTP.
 *
 * A shape of its own, not the snapshot. `version` is an optimistic-concurrency
 * counter this API promises nothing about, and a snapshot that changes with
 * the domain would turn every internal rename into a breaking change for
 * consumers (ADR-0014 §5).
 */
export class AreaResponse {
  @ApiProperty({ example: '770e8400-e29b-41d4-a716-446655440002' })
  id!: string;

  @ApiProperty({ example: 'GN' })
  countryCode!: string;

  @ApiProperty({
    description: 'Position in the country hierarchy.',
    example: 'LEVEL_1',
  })
  level!: string;

  @ApiProperty({
    description: 'Unique per country and level.',
    example: 'GN-KND',
  })
  code!: string;

  @ApiProperty({ example: 'Kindia' })
  officialName!: string;

  @ApiProperty({ type: [String], example: ['Kindya'] })
  aliases!: string[];

  @ApiPropertyOptional({
    description: 'Null for a COUNTRY-level area, which has no parent.',
    example: '660e8400-e29b-41d4-a716-446655440001',
    nullable: true,
  })
  parentId!: string | null;

  @ApiPropertyOptional({
    description: 'Representative point. Absent until an import provides one.',
    example: { latitude: 10.05, longitude: -12.86 },
    nullable: true,
  })
  centroid!: { latitude: number; longitude: number } | null;

  @ApiProperty({ example: 'ACTIVE' })
  status!: string;

  @ApiProperty({
    description: 'When the area started being valid. ISO date.',
    example: '2024-01-01',
  })
  validFrom!: string;

  @ApiPropertyOptional({
    description: 'When it stopped, for a merged or dissolved area.',
    example: null,
    nullable: true,
  })
  validTo!: string | null;

  static from(area: AdministrativeArea): AreaResponse {
    const s = area.snapshot();
    return {
      id: s.areaId as unknown as string,
      countryCode: s.countryCode as unknown as string,
      level: s.level as unknown as string,
      code: s.code as unknown as string,
      officialName: s.name.official,
      aliases: [...(s.name.aliases ?? [])],
      parentId: (s.parentId as unknown as string | null) ?? null,
      centroid: s.centroid
        ? { latitude: s.centroid.latitude, longitude: s.centroid.longitude }
        : null,
      status: s.status as unknown as string,
      validFrom: s.validity.startDate as unknown as string,
      validTo: (s.validity.endDate as unknown as string | null) ?? null,
    };
  }
}

/** A country's level template. */
export class CountryResponse {
  @ApiProperty({ example: 'GN' })
  countryCode!: string;

  @ApiProperty({ example: 'PUBLISHED' })
  status!: string;

  @ApiProperty({
    description:
      'The levels this country declares, in order. An area can only be registered at a declared level.',
    example: [
      { level: 'LEVEL_1', singular: 'Région', plural: 'Régions' },
      { level: 'LEVEL_2', singular: 'Préfecture', plural: 'Préfectures' },
    ],
  })
  levels!: { level: string; singular: string; plural: string }[];

  static from(profile: CountryProfile): CountryResponse {
    const s = profile.snapshot();
    return {
      countryCode: s.countryCode as unknown as string,
      status: s.status as unknown as string,
      levels: s.levels.map((l) => ({
        level: l.level as unknown as string,
        singular: l.label.singular,
        plural: l.label.plural,
      })),
    };
  }
}
