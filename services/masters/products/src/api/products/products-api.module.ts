import { Module } from '@nestjs/common';
import { PRODUCT_REPOSITORY, type ProductRepository } from '@nafa/products';
import { FindProductUseCase } from '../../application';
import { InfrastructureModule } from '../../infrastructure/infrastructure.module';
import { ProductsController } from './products.controller';

/**
 * Composition root for the products read slice: the only place that knows
 * both which use cases exist and which adapters satisfy them.
 *
 * The use case is built by factory rather than listed as a provider, because
 * it is a plain class — no `@Injectable()`, no `@Inject()`, nothing from
 * NestJS. Keeping the container out of `application/` is the point, and this
 * small ceremony is what buys it. Same pattern as IAM's AuthApiModule.
 */
@Module({
  imports: [InfrastructureModule],
  controllers: [ProductsController],
  providers: [
    {
      provide: FindProductUseCase,
      useFactory: (products: ProductRepository) =>
        new FindProductUseCase(products),
      inject: [PRODUCT_REPOSITORY],
    },
  ],
})
export class ProductsApiModule {}
