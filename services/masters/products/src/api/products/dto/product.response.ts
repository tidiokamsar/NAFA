import { ApiProperty } from '@nestjs/swagger';
import type { Product } from '@nafa/products';

/**
 * What a product looks like over HTTP.
 *
 * A shape of its own rather than the aggregate or its snapshot. Three reasons,
 * and none of them is ceremony:
 *
 *  - `version` is an optimistic-concurrency counter. Publishing it invites a
 *    client to reason about it, and the API makes no promise about it yet.
 *  - a snapshot changes when the domain changes. A response shape that is
 *    literally `ProductSnapshot` turns every internal rename into a breaking
 *    change for every consumer.
 *  - brand types (ProductId, ProductCode) are strings at the wire, and saying
 *    so once here beats casting at every call site.
 */
export class ProductResponse {
  @ApiProperty({ example: '770e8400-e29b-41d4-a716-446655440002' })
  id!: string;

  @ApiProperty({ description: 'The catalogue key.', example: 'FONIO' })
  code!: string;

  @ApiProperty({ example: 'CEREAL' })
  category!: string;

  @ApiProperty({ example: 'Fonio' })
  officialName!: string;

  @ApiProperty({
    description:
      'Other names the product is known by, searched alongside the official one.',
    example: ['fonio blanc'],
    type: [String],
  })
  aliases!: string[];

  @ApiProperty({
    description:
      'Units the product may be traded in. An offer naming any other unit is refused.',
    example: [
      { code: 'KG', name: 'Kilogramme', kind: 'WEIGHT', factorToBase: 1 },
    ],
  })
  units!: unknown[];

  @ApiProperty({ example: 'PUBLISHED' })
  status!: string;

  static from(product: Product): ProductResponse {
    const snapshot = product.snapshot();
    return {
      id: snapshot.productId as string,
      code: snapshot.code as string,
      category: snapshot.category as string,
      officialName: snapshot.name.official,
      aliases: [...(snapshot.name.aliases ?? [])],
      units: snapshot.units.map((unit) => ({ ...unit })),
      status: snapshot.status as string,
    };
  }
}
