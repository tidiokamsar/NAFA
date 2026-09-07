import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { ErrorResponse } from '@nafa/platform';
import { FindProductUseCase } from '../../application';
import { FindProductsQuery } from './dto/find-products.query';
import { ProductResponse } from './dto/product.response';

/**
 * Read access to the product catalogue.
 *
 * No error mapper, unlike IAM's auth slice. The use case raises `NafaError`s
 * that already carry their status and code, and the platform filter renders
 * them — a mapper here would only restate what the shared kernel decided.
 *
 * No authentication either, and that is a decision rather than an omission:
 * the catalogue is public reference data (ADR-0014 §3). Writes are a separate
 * ticket and will not be public.
 */
@ApiTags('products')
@Controller('products')
export class ProductsController {
  constructor(private readonly products: FindProductUseCase) {}

  @Get()
  @ApiOperation({
    summary: 'List products, filtered by name or by category',
    description:
      'With neither filter the list is empty rather than the whole catalogue: ' +
      'an unbounded read is a decision this API has not taken (no pagination yet). ' +
      'When both are given, `name` wins — the Master exposes no combined lookup.',
  })
  @ApiOkResponse({ type: [ProductResponse] })
  async find(@Query() query: FindProductsQuery): Promise<ProductResponse[]> {
    if (query.name) {
      const found = await this.products.byName(query.name);
      return found.map(ProductResponse.from);
    }

    if (query.category) {
      const found = await this.products.byCategory(query.category);
      return found.map(ProductResponse.from);
    }

    return [];
  }

  @Get('code/:code')
  @ApiOperation({ summary: 'One product by its catalogue code' })
  @ApiParam({ name: 'code', example: 'FONIO' })
  @ApiOkResponse({ type: ProductResponse })
  @ApiNotFoundResponse({ type: ErrorResponse })
  async byCode(@Param('code') code: string): Promise<ProductResponse> {
    return ProductResponse.from(await this.products.byCode(code));
  }

  @Get(':id')
  @ApiOperation({ summary: 'One product by its identifier' })
  @ApiOkResponse({ type: ProductResponse })
  @ApiNotFoundResponse({ type: ErrorResponse })
  async byId(@Param('id') id: string): Promise<ProductResponse> {
    return ProductResponse.from(await this.products.byId(id));
  }
}
