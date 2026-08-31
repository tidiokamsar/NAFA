import {
  buildDomainEvent,
  type Clock,
  type DomainEvent,
  type IdGenerator,
  err,
  ok,
  type Result,
} from '@nafa/shared';
import { ProductRule, ProductRuleViolation } from './products.errors';
import { checkProductTransition, ProductStatus } from './product-status.vo';
import type { ProductCategory } from './product-category.vo';
import type { ProductCode } from './product-code.vo';
import type { ProductId } from './product-id.vo';
import type { ProductName } from './product-name.vo';
import type { UnitOfMeasure } from './unit-of-measure.vo';
import {
  ProductEventType,
  PRODUCT_AGGREGATE,
  type ProductAliasesChangedPayload,
  type ProductRegisteredPayload,
  type ProductRenamedPayload,
  type ProductStatusChangedPayload,
} from './product.events';

/** What a use case hands to `Product.register`. */
export interface RegisterProductInput {
  readonly productId: ProductId;
  readonly code: ProductCode;
  readonly category: ProductCategory;
  readonly name: ProductName;
  readonly units: readonly UnitOfMeasure[];
}

/** The persisted shape a repository hands back. */
export interface ProductSnapshot {
  readonly productId: ProductId;
  readonly code: ProductCode;
  readonly category: ProductCategory;
  readonly name: ProductName;
  readonly units: readonly UnitOfMeasure[];
  readonly status: ProductStatus;
  readonly version: number;
}

export interface ProductDependencies {
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

/**
 * A tradeable product — the species itself, not a variety, a lot or an
 * offer (ADR-0010).
 *
 * Invariants (8, numbered for the backlog and the tests):
 *  1. ProductId is a valid UUID                        (VO)
 *  2. ProductCode is well-formed, unique globally      (checker, not here)
 *  3. Category belongs to the generic enum             (VO)
 *  4. Official name non-empty, aliases deduplicated    (VO)
 *  5. Units are valid and consistent per dimension     (VO + checked here)
 *  6. Status transitions are valid                     (checked here)
 *  7. Category is immutable once PUBLISHED             (checked here)
 *  8. A DEPRECATED product changes no more             (checked here)
 */
export class Product {
  private readonly pending: DomainEvent[] = [];
  /** Where the aggregate was loaded at — what `save` expects. */
  private readonly loadedVersion: number;
  /** Absolute version — advances with every applied event, drained or not. */
  private currentVersion: number;

  private constructor(
    readonly productId: ProductId,
    private currentCode: ProductCode,
    private currentCategory: ProductCategory,
    private currentName: ProductName,
    private currentUnits: UnitOfMeasure[],
    private currentStatus: ProductStatus,
    loadedVersion: number,
    currentVersion: number,
  ) {
    this.loadedVersion = loadedVersion;
    this.currentVersion = currentVersion;
  }

  // ------------------------------------------------------------ factory

  /**
   * Registers a new product. Structural invariants a single aggregate can
   * check are checked here; uniqueness of the code (invariant 2) spans the
   * collection and is the caller's question to the store.
   */
  static register(
    input: RegisterProductInput,
    deps: ProductDependencies,
  ): Result<Product, ProductRuleViolation> {
    // Invariant 5 (aggregate part): at least one unit, no duplicate codes.
    if (input.units.length === 0) {
      return err(
        ProductRuleViolation.violated(
          ProductRule.INVALID_UNIT,
          'A product needs at least one unit of measure.',
        ),
      );
    }
    const seen = new Set<string>();
    for (const unit of input.units) {
      if (seen.has(unit.code)) {
        return err(
          ProductRuleViolation.violated(
            ProductRule.DUPLICATE_UNIT,
            `Unit ${unit.code} appears twice.`,
          ),
        );
      }
      seen.add(unit.code);
    }

    const product = new Product(
      input.productId,
      input.code,
      input.category,
      input.name,
      [...input.units],
      ProductStatus.DRAFT,
      0, // never stored — the first save is an insert (expectedVersion 0)
      0, // the registered event below moves it to 1
    );

    product.emit(
      ProductEventType.REGISTERED,
      {
        productId: input.productId,
        code: input.code,
        category: input.category,
        name: input.name,
        units: [...input.units],
      } satisfies ProductRegisteredPayload,
      deps,
    );

    return ok(product);
  }

  /** Rebuilds an aggregate from storage. No events, no re-validation. */
  static rehydrate(
    snapshot: ProductSnapshot,
    deps: ProductDependencies,
  ): Product {
    void deps; // kept for signature parity — rehydration emits nothing
    return new Product(
      snapshot.productId,
      snapshot.code,
      snapshot.category,
      snapshot.name,
      [...snapshot.units],
      snapshot.status,
      snapshot.version,
      snapshot.version,
    );
  }

  // --------------------------------------------------------- accessors

  get code(): ProductCode {
    return this.currentCode;
  }

  get category(): ProductCategory {
    return this.currentCategory;
  }

  get name(): ProductName {
    return this.currentName;
  }

  get units(): readonly UnitOfMeasure[] {
    return [...this.currentUnits];
  }

  get status(): ProductStatus {
    return this.currentStatus;
  }

  get version(): number {
    return this.currentVersion;
  }

  /** The version to pass to `save` — where the aggregate was loaded at. */
  get expectedVersion(): number {
    return this.loadedVersion;
  }

  snapshot(): ProductSnapshot {
    return {
      productId: this.productId,
      code: this.currentCode,
      category: this.currentCategory,
      name: this.currentName,
      units: [...this.currentUnits],
      status: this.currentStatus,
      version: this.version,
    };
  }

  /** Drains the event buffer — the outbox boundary (ADR-0008). */
  pullEvents(): readonly DomainEvent[] {
    return this.pending.splice(0, this.pending.length);
  }

  // ---------------------------------------------------------- mutations

  /**
   * Changes the official name (and aliases with it). Allowed while
   * PUBLISHED: local naming evolves, the reference follows.
   */
  rename(
    next: ProductName,
    deps: ProductDependencies,
  ): Result<void, ProductRuleViolation> {
    const guard = this.ensureMutable('rename');
    if (!guard.ok) return guard;

    if (next.official === this.currentName.official) {
      return err(
        ProductRuleViolation.violated(
          ProductRule.INVALID_PRODUCT_NAME,
          'The official name is unchanged.',
        ),
      );
    }

    const previous = this.currentName;
    this.currentName = next;
    this.emit(
      ProductEventType.RENAMED,
      {
        productId: this.productId,
        previousName: previous,
        newName: next,
      } satisfies ProductRenamedPayload,
      deps,
    );
    return ok(undefined);
  }

  /**
   * Replaces the alias list. Allowed while PUBLISHED — a new local name
   * must be searchable the day the market uses it.
   */
  changeAliases(
    aliases: readonly string[],
    deps: ProductDependencies,
  ): Result<void, ProductRuleViolation> {
    const guard = this.ensureMutable('changeAliases');
    if (!guard.ok) return guard;

    const previous = [...this.currentName.aliases];
    this.currentName = {
      official: this.currentName.official,
      aliases: [...aliases],
    };
    this.emit(
      ProductEventType.ALIASES_CHANGED,
      {
        productId: this.productId,
        previousAliases: previous,
        newAliases: [...aliases],
      } satisfies ProductAliasesChangedPayload,
      deps,
    );
    return ok(undefined);
  }

  /**
   * Publishes the product to the catalogue. One-way with `deprecate`:
   * offers may now list this product.
   */
  publish(deps: ProductDependencies): Result<void, ProductRuleViolation> {
    return this.transition(ProductStatus.PUBLISHED, deps);
  }

  /** Retires the product from the catalogue. Historical data keeps resolving. */
  deprecate(deps: ProductDependencies): Result<void, ProductRuleViolation> {
    return this.transition(ProductStatus.DEPRECATED, deps);
  }

  // ------------------------------------------------------------ private

  /**
   * Invariant 6 — one legal step through the status machine. Invariant 7
   * rides along: the category never changes after publication, so the only
   * transitions left carry no structural change to guard.
   */
  private transition(
    to: ProductStatus,
    deps: ProductDependencies,
  ): Result<void, ProductRuleViolation> {
    const from = this.currentStatus;

    if (!checkProductTransition(from, to)) {
      return err(
        ProductRuleViolation.transition(
          ProductRule.INVALID_STATUS_TRANSITION,
          `Cannot transition a ${from} product to ${to}.`,
        ),
      );
    }

    this.currentStatus = to;
    this.emit(
      to === ProductStatus.PUBLISHED
        ? ProductEventType.PUBLISHED
        : ProductEventType.DEPRECATED,
      {
        productId: this.productId,
        from,
        to,
      } satisfies ProductStatusChangedPayload,
      deps,
    );
    return ok(undefined);
  }

  /**
   * Invariant 8 — a DEPRECATED product is frozen. Every mutation funnels
   * through this guard first.
   */
  private ensureMutable(operation: string): Result<void, ProductRuleViolation> {
    if (this.currentStatus === ProductStatus.DEPRECATED) {
      return err(
        ProductRuleViolation.transition(
          ProductRule.PRODUCT_DEPRECATED,
          `A deprecated product cannot be modified ("${operation}").`,
        ),
      );
    }
    return ok(undefined);
  }

  /**
   * Emits an event at the version the aggregate will hold once it is
   * applied — the same convention as the geography aggregates.
   */
  private emit(
    eventType: string,
    payload: Record<string, unknown>,
    deps: ProductDependencies,
  ): void {
    this.currentVersion += 1;
    this.pending.push(
      buildDomainEvent(
        {
          eventType,
          aggregate: PRODUCT_AGGREGATE,
          aggregateId: this.productId,
          version: this.currentVersion,
          occurredAt: deps.clock.nowIso(),
          payload,
        },
        deps.ids.generate,
      ),
    );
  }
}
