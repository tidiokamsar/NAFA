// @ts-check
import nx from '@nx/eslint-plugin';

/**
 * Dependency direction between workspace projects, enforced at lint time.
 *
 * Every project carries two tags in its `package.json` under `nx.tags`:
 *
 *   layer:*  where it sits in the architecture — constrained by the rules below
 *   scope:*  which business area it belongs to — constrains inter-Master edges
 *
 * Nx applies *every* rule whose `sourceTag` matches a project and intersects
 * them (logical AND). The `layer` axis is opened up here; the `scope` axis
 * closes again, edge by edge. Their intersection is what a project may
 * actually import.
 *
 * Concretely for the two Masters today: `layer:domain → layer:domain` reads,
 * alone, as if any domain could depend on any other. It cannot. The
 * `scope:geography` rule below is what forbids `geography → foundation`,
 * while `foundation → geography` stays open because foundation is itself
 * `layer:domain`. **The rule is not decorative**: removing it would silently
 * open an inter-Master dependency that no review would catch.
 *
 * Note on the asymmetry — there is *no* `scope:foundation` rule here, by
 * design. The `foundation` scope is not homogeneous: it covers both the
 * domain package (`layer:domain`) and the IAM service (`layer:service`).
 * Constraining `scope:foundation` as a whole would tighten the service to
 * the domain's budget and break it. The grant `foundation → geography` does
 * not need a scope rule anyway: foundation is `layer:domain`, geography is
 * `layer:domain`, and the `layer:domain` rule already permits that. Only the
 * reverse direction needs a scope rule to close it.
 *
 * A project with no matching source tag is unconstrained, so a project that
 * forgets its tags silently escapes every rule — `layer:*` is therefore also
 * asserted by the catch-all entry at the end.
 *
 * @see docs/adr/0004-enforce-architecture-boundaries-with-nx-tags.md
 * @see docs/adr/0009-geography-master-boundaries.md (§8 — the scope mechanism)
 */
const depConstraints = [
  {
    // Zero-dependency primitives. Everything may import them; they import
    // nothing, which is what keeps them cycle-free.
    sourceTag: 'layer:util',
    onlyDependOnLibsWithTags: [],
  },
  {
    // Business contracts, ports and domain models.
    //
    // `layer:util` remains the technology-free base every domain needs. From
    // GEO-001 (ADR-0009 §8) `layer:domain` is also permitted, so that one
    // Master may reference another — the migration of `Actor.Address` to an
    // `AdministrativeAreaId` requires it.
    //
    // WARNING — read with the `scope:geography` rule below. This entry alone
    // makes domain → domain look globally open. It is not: the scope rule
    // closes `geography → foundation`, and foundation → geography passes
    // through only because both are `layer:domain`. Removing the
    // `layer:domain` token here would re-forbid all inter-Master edges (safe
    // but loses the migration); removing the scope rule would silently
    // *open* one (unsafe). The scope rule is what carries the real
    // constraint.
    //
    // @see docs/adr/0005-domain-may-depend-on-the-shared-kernel.md
    // @see docs/adr/0009-geography-master-boundaries.md (§8)
    sourceTag: 'layer:domain',
    onlyDependOnLibsWithTags: ['layer:util', 'layer:domain'],
  },
  {
    // Technical foundation: config, logging, health, Redis, telemetry.
    // Knows how a service boots, never what it is for.
    sourceTag: 'layer:platform',
    onlyDependOnLibsWithTags: ['layer:util'],
  },
  {
    // Typed API clients. Consumed by apps, so they must not pull a server
    // runtime into a browser bundle.
    sourceTag: 'layer:client',
    onlyDependOnLibsWithTags: ['layer:util'],
  },
  {
    // Back-end services: the only layer allowed to combine domain contracts
    // with platform machinery.
    sourceTag: 'layer:service',
    onlyDependOnLibsWithTags: ['layer:domain', 'layer:platform', 'layer:util'],
  },
  {
    // Front-ends talk to services over HTTP through the SDK, never by
    // importing them.
    sourceTag: 'layer:app',
    onlyDependOnLibsWithTags: ['layer:client', 'layer:domain', 'layer:util'],
  },
  // ── scope axis — inter-Master edges (ADR-0009 §8) ───────────────────────
  //
  // This is the half of the boundary rule the `layer` axis cannot express.
  // Read with the `layer:domain` rule above: their intersection is the only
  // thing that keeps Masters apart. Since the grant
  // `layer:domain → layer:domain` landed (GEO-001), each entry below is
  // load-bearing — removing one silently opens that grant for its scope.
  //
  //   geography : allowed → layer:util only
  //
  // Geography may import its shared kernel and nothing else — in particular
  // not `@nafa/foundation`. The forward direction, `foundation → geography`,
  // needs no scope rule: both are `layer:domain`, so the layer rule already
  // grants it. A new inter-Master edge is a line added here, hence an act
  // visible in review and justifiable by an ADR — not a convention.
  //
  // There is intentionally no `scope:foundation` rule: that scope spans both
  // a domain package and a service (IAM), so a single budget would not fit
  // both. Only homogeneous reference scopes are constrained.
  {
    sourceTag: 'scope:geography',
    onlyDependOnLibsWithTags: ['layer:util'],
  },
  //   product : allowed → layer:util only
  //
  // Same reasoning as geography: the Product Master is reference data and
  // owns its vocabulary alone. Without this entry the domain-to-domain
  // grant would let it import @nafa/foundation or @nafa/geography.
  //
  // @see docs/adr/0010-product-master-boundaries.md
  {
    sourceTag: 'scope:product',
    onlyDependOnLibsWithTags: ['layer:util'],
  },
  //   trade : allowed → the shared kernel + the three reference Masters
  //
  // The scope revision ADR-0009 §8 promised, and the FIRST rule that
  // grants rather than closes. Trade is the first consuming Master: an
  // offer cannot exist without naming a seller (foundation), a product
  // (products) and, when known, a pickup area (geography). Every edge is
  // named and justified in ADR-0011 §3, and the package carries a probe
  // asserting both directions — the three granted imports pass, everything
  // else (platform, SDK, a future Master) is rejected. Adding an edge is a
  // tag added to this list: an act visible in review and justifiable by an
  // ADR — not a convention.
  //
  // @see docs/adr/0011-trade-master-boundaries.md
  {
    sourceTag: 'scope:trade',
    onlyDependOnLibsWithTags: [
      'layer:util',
      'scope:foundation',
      'scope:geography',
      'scope:product',
    ],
  },
  {
    // Catch-all: an untagged project may not be depended upon, which turns a
    // forgotten tag into a lint error instead of a silent hole.
    sourceTag: '*',
    onlyDependOnLibsWithTags: ['layer:*'],
  },
];

export default [
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx', '**/*.mjs'],
    plugins: { '@nx': nx },
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: false,
          allow: [],
          depConstraints,
        },
      ],
    },
  },
];
