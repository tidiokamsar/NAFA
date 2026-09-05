// Permanent boundary probe for the Product Master.
//
// The Product Master is a reference data domain: it owns the vocabulary of
// tradeable agricultural products and depends on nothing but the shared
// kernel. Importing another Master (@nafa/foundation today, @nafa/geography
// when it lands) must be rejected by @nx/enforce-module-boundaries.
//
// Two layers of defence make that true:
//  - on this branch (main), the `layer:domain` rule already permits
//    `layer:util` only, so the import below fails on the layer axis;
//  - once ADR-0009's layer:domain → layer:domain grant lands (GEO-001),
//    the `scope:product` rule added alongside this probe re-closes the
//    axis for this package specifically.
//
// This probe turns that policy into a test that runs on every `pnpm lint`.
// It does not rely on vigilance: if someone removes a rule, the build
// breaks here. Mirrors the pattern of
// packages/foundation/tools/verify-domain-boundaries.mjs.
//
// Implementation note — the `filePath` must point at a file that already
// exists and is covered by this package's tsconfig. typescript-eslint runs
// with `projectService: true`; a virtual path that no tsconfig includes
// aborts with a parsing error and short-circuits every rule, the boundary
// rule included.
import { ESLint } from 'eslint';
import { join } from 'node:path';

const packageRoot = join(import.meta.dirname, '..');

const linter = new ESLint({ cwd: packageRoot });
const [result] = await linter.lintText(
  "import { Actor } from '@nafa/foundation';\nexport type Probe = Actor;\n",
  { filePath: join(packageRoot, 'src', 'index.ts') },
);
const blocked = result.messages.filter(
  (m) => m.ruleId === '@nx/enforce-module-boundaries',
);
if (blocked.length === 0) {
  throw new Error(
    'Boundary regression: the Product Master was allowed to import ' +
      '@nafa/foundation. Reference data owns its vocabulary alone ' +
      '(ADR-0010).',
  );
}
