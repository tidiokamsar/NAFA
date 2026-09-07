import { ErrorCode, NafaError } from '@nafa/shared';
import type {
  Product,
  ProductCategory,
  ProductCode,
  ProductId,
  ProductRepository,
} from '@nafa/products';

/**
 * Raised when a lookup by a natural key finds nothing.
 *
 * A `NafaError` rather than a NestJS exception: the application layer holds
 * no framework, and the global filter already turns `NOT_FOUND` into a 404
 * with the code echoed. That is the whole reason no error mapper is needed
 * here, unlike in IAM where the use cases predate the filter knowing the type.
 */
export class ProductNotFoundError extends NafaError {
  constructor(by: string, value: string) {
    super(ErrorCode.NOT_FOUND, `No product with ${by} "${value}".`);
  }
}

/**
 * Reads of the product catalogue.
 *
 * A plain class: no decorators, no container awareness, everything through
 * the constructor. The composition root in `api/` turns it into a provider.
 *
 * One class for the four reads rather than four classes, because they share
 * a single dependency and no logic — splitting them would produce four files
 * whose only content is a constructor.
 */
export class FindProductUseCase {
  constructor(private readonly products: ProductRepository) {}

  /** The catalogue's natural key. Absence is a 404, not an empty result. */
  async byCode(code: string): Promise<Product> {
    const product = await this.products.findByCode(code as ProductCode);
    if (!product) throw new ProductNotFoundError('code', code);
    return product;
  }

  async byId(id: string): Promise<Product> {
    const product = await this.products.findById(id as ProductId);
    if (!product) throw new ProductNotFoundError('id', id);
    return product;
  }

  /**
   * Search by name, official or alias.
   *
   * A list, and an empty one is a legitimate answer — unlike a lookup by key,
   * "nothing matched that word" is not a missing resource.
   */
  byName(name: string): Promise<readonly Product[]> {
    return this.products.findByName(name) as Promise<readonly Product[]>;
  }

  byCategory(category: string): Promise<readonly Product[]> {
    return this.products.findByCategory(category as ProductCategory) as Promise<
      readonly Product[]
    >;
  }
}
