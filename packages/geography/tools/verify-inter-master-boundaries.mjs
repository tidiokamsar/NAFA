// Permanent boundary probe for the Geography Master.
//
// The domain rule `layer:domain → layer:domain` reads, alone, as if any
// Master could import any other. The `scope:*` rules in
// `tools/eslint/module-boundaries.mjs` (ADR-0009 §8) re-close it edge by
// edge, leaving exactly one granted direction: foundation → geography.
//
// This probe turns that policy into a test that runs on every `pnpm lint`.
// It does not rely on vigilance: if someone removes a scope rule, the build
// breaks here. Mirrors the pattern of
// `packages/foundation/tools/verify-domain-boundaries.mjs`, applied to the
// inter-Master direction rather than the intra-package one.
//
// Implementation note — each `filePath` must point at a file that already
// exists and is covered by its package's tsconfig. typescript-eslint runs
// with `projectService: true`; a virtual path that no tsconfig includes
// aborts with a parsing error and short-circuits every rule, the boundary
// rule included. Foundation's probe uses its aggregate root for the same
// reason.
import { ESLint } from 'eslint';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..', '..');
const geographyRoot = join(ROOT, 'packages', 'geography');
const foundationRoot = join(ROOT, 'packages', 'foundation');

// ── 1. Forbidden direction: geography → foundation ──────────────────────
//
// `geography` carries `scope:geography`, whose rule permits `layer:util`
// only. Importing `@nafa/foundation` must be rejected by
// `@nx/enforce-module-boundaries`. If this stops failing, the scope rule
// for `scope:geography` has been weakened or removed.
const forbiddenLinter = new ESLint({ cwd: geographyRoot });
const [forbiddenResult] = await forbiddenLinter.lintText(
  "import { Actor } from '@nafa/foundation';\nexport type Probe = Actor;\n",
  { filePath: join(geographyRoot, 'src', 'index.ts') },
);
const forbiddenBlocked = forbiddenResult.messages.filter(
  (m) => m.ruleId === '@nx/enforce-module-boundaries',
);
if (forbiddenBlocked.length === 0) {
  throw new Error(
    'Boundary regression: geography was allowed to import foundation. ' +
      'The scope:geography rule no longer holds (ADR-0009 §8).',
  );
}

// ── 2. Granted direction: foundation → geography ────────────────────────
//
// `foundation` carries `scope:foundation`, whose rule permits `layer:util`
// and `scope:geography`. Importing `@nafa/geography` must be allowed. If
// this starts failing, the one inter-Master edge the migration of
// `Actor.Address` depends on has been cut.
const grantedLinter = new ESLint({ cwd: foundationRoot });
const [grantedResult] = await grantedLinter.lintText(
  "import { AdministrativeAreaId } from '@nafa/geography';\nexport type Probe = AdministrativeAreaId;\n",
  {
    filePath: join(
      foundationRoot,
      'src',
      'actor',
      'domain',
      'actor.aggregate.ts',
    ),
  },
);
const grantedBlocked = grantedResult.messages.filter(
  (m) => m.ruleId === '@nx/enforce-module-boundaries',
);
if (grantedBlocked.length !== 0) {
  throw new Error(
    'Boundary regression: foundation was forbidden to import geography. ' +
      'The granted inter-Master edge (ADR-0009 §8) no longer holds.',
  );
}
