// Permanent boundary probe for the Trade Master.
//
// Trade is the first consuming Master: it references the three reference
// Masters (foundation for ActorId, geography for AdministrativeAreaId,
// products for ProductId/UnitCode) — every edge named and justified in
// docs/adr/0011-trade-master-boundaries.md. The scope:trade rule grants
// exactly those and nothing else.
//
// This probe turns that policy into a test that runs on every `pnpm lint`:
//  - the three granted imports must PASS the boundary rule;
//  - two forbidden ones (@nafa/platform, @nafa/sdk) must be REJECTED.
// It does not rely on vigilance: if someone removes a line of the rule, the
// build breaks here.
//
// Implementation note — each `filePath` must point at a file that already
// exists and is covered by this package's tsconfig; typescript-eslint runs
// with `projectService: true` and a virtual path would short-circuit every
// rule.
import { ESLint } from 'eslint';
import { join } from 'node:path';

const packageRoot = join(import.meta.dirname, '..');
const linter = new ESLint({ cwd: packageRoot });

async function boundaryMessages(source, filePath) {
  const [result] = await linter.lintText(source, { filePath });
  return result.messages.filter(
    (m) => m.ruleId === '@nx/enforce-module-boundaries',
  );
}

const entry = join(packageRoot, 'src', 'index.ts');

// ── 1. Granted edges: the three reference Masters ──────────────────────
for (const granted of [
  "import type { ActorId } from '@nafa/foundation';\nexport type P1 = ActorId;\n",
  "import type { AdministrativeAreaId } from '@nafa/geography';\nexport type P2 = AdministrativeAreaId;\n",
  "import type { ProductId } from '@nafa/products';\nexport type P3 = ProductId;\n",
]) {
  const blocked = await boundaryMessages(granted, entry);
  if (blocked.length !== 0) {
    throw new Error(
      'Boundary regression: a granted Trade edge was rejected. The ' +
        'scope:trade rule no longer allows the three reference Masters ' +
        '(ADR-0011).',
    );
  }
}

// ── 2. Forbidden: the platform, the client SDK ─────────────────────────
for (const forbidden of [
  "import { PlatformConfigModule } from '@nafa/platform';\nexport const P = PlatformConfigModule;\n",
  "import { createClient } from '@nafa/sdk';\nexport const C = createClient;\n",
]) {
  const blocked = await boundaryMessages(forbidden, entry);
  if (blocked.length === 0) {
    throw new Error(
      'Boundary regression: the Trade Master was allowed to import a ' +
        'forbidden package. The scope:trade allowlist (ADR-0011) has been ' +
        'widened without an ADR.',
    );
  }
}
