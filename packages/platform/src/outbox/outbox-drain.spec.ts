import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The guard ADR-0008 said could not exist.
 *
 * That ADR was explicit about the cost of keeping the domain pure: "an
 * adapter that forgets to call `pullEvents()` loses the events **silently** —
 * nothing warns it, and no domain test can catch it." It is right that no
 * *domain* test can. Nothing about the aggregate changes when a repository
 * ignores its buffer, so there is no behaviour to assert on.
 *
 * What can be asserted is the source. This probe reads every repository the
 * Masters own and fails when one writes an aggregate without draining it into
 * the outbox — which is the exact shape of the mistake, catchable at the only
 * moment it is still cheap: before the events are gone.
 *
 * It is a text search, and it knows it. It would pass on a repository that
 * mentions `pullEvents` in a comment and never calls it. That is a worse
 * failure to invent than to miss, and the e2e suites assert the rows actually
 * land. This is the net that catches a *new* repository written by someone
 * who never read ADR-0008.
 */

const WORKSPACE_ROOT = join(__dirname, '..', '..', '..', '..');
const MASTERS = join(WORKSPACE_ROOT, 'services', 'masters');

interface RepositorySource {
  readonly service: string;
  readonly file: string;
  readonly source: string;
}

function repositorySources(): RepositorySource[] {
  if (!existsSync(MASTERS)) return [];

  const found: RepositorySource[] = [];

  for (const service of readdirSync(MASTERS)) {
    const dir = join(
      MASTERS,
      service,
      'src',
      'infrastructure',
      'persistence',
      'prisma',
    );
    if (!existsSync(dir)) continue;

    for (const file of readdirSync(dir)) {
      if (!file.endsWith('.repository.ts')) continue;
      found.push({
        service,
        file,
        source: readFileSync(join(dir, file), 'utf8'),
      });
    }
  }

  return found;
}

const repositories = repositorySources();

describe('every Masters repository drains its aggregate into the outbox', () => {
  it('finds the repositories at all', () => {
    // Without this the whole suite passes vacuously the day the layout
    // moves — a green probe that inspects nothing is worse than no probe.
    expect(repositories.length).toBeGreaterThanOrEqual(6);
  });

  it.each(repositories.map((r) => [`${r.service}/${r.file}`, r] as const))(
    '%s calls pullEvents and appends to the outbox',
    (_label, repository) => {
      expect(repository.source).toContain('.pullEvents()');
      expect(repository.source).toContain('appendToOutbox(');
    },
  );

  it.each(repositories.map((r) => [`${r.service}/${r.file}`, r] as const))(
    '%s writes the row and the events in one transaction',
    (_label, repository) => {
      // Appending outside the transaction compiles and reads almost the
      // same, and gives up the only guarantee the outbox exists for.
      expect(repository.source).toContain('$transaction');
    },
  );
});
