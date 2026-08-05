// @ts-check
import nx from '@nx/eslint-plugin';

/**
 * Dependency direction between workspace projects, enforced at lint time.
 *
 * Every project carries two tags in its `package.json` under `nx.tags`:
 *
 *   layer:*  where it sits in the architecture — constrained here
 *   scope:*  which business area it belongs to — assigned, not yet constrained
 *
 * Only the `layer` axis has rules today. `scope` is deliberately left open:
 * with a single business area (`foundation`) a scope rule would forbid nothing
 * that exists and would have to be rewritten the moment a second area lands.
 *
 * A project with no matching source tag is unconstrained, so a project that
 * forgets its tags silently escapes every rule — `layer:*` is therefore also
 * asserted by the catch-all entry at the end.
 *
 * @see docs/adr/0004-enforce-architecture-boundaries-with-nx-tags.md
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
    // `layer:util` is the single allowed dependency, and only because it is
    // itself dependency-free: importing it drags no technology into the
    // domain, which is the property this rule exists to protect. Anything
    // that boots, connects or serializes is a layer below and stays out.
    //
    // @see docs/adr/0005-domain-may-depend-on-the-shared-kernel.md
    sourceTag: 'layer:domain',
    onlyDependOnLibsWithTags: ['layer:util'],
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
