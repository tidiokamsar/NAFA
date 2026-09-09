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
 * services own and fails when one writes an aggregate without draining it into
 * the outbox — which is the exact shape of the mistake, catchable at the only
 * moment it is still cheap: before the events are gone.
 *
 * It is a text search, and it knows it. It would pass on a repository that
 * mentions `pullEvents` in a comment and never calls it. That is a worse
 * failure to invent than to miss, and the e2e suites assert the rows actually
 * land. This is the net that catches a *new* repository written by someone
 * who never read ADR-0008.
 *
 * The scan covers `services/<layer>/<service>` rather than the Masters alone
 * (ADR-0018). Widening it naively would have failed IAM, whose repository
 * legitimately does not drain because its aggregates emit no domain events —
 * so the assertions are split: the Masters must all drain, and *anything*
 * elsewhere that drains must do it correctly.
 */

const WORKSPACE_ROOT = join(__dirname, '..', '..', '..', '..');
const SERVICES = join(WORKSPACE_ROOT, 'services');
const MASTERS_LAYER = 'masters';

interface RepositorySource {
  readonly layer: string;
  readonly service: string;
  readonly file: string;
  readonly source: string;
}

function repositorySources(): RepositorySource[] {
  if (!existsSync(SERVICES)) return [];

  const found: RepositorySource[] = [];

  for (const layer of readdirSync(SERVICES)) {
    const layerDir = join(SERVICES, layer);
    if (!existsSync(layerDir)) continue;

    let services: string[];
    try {
      services = readdirSync(layerDir);
    } catch {
      // `services/` holds a README next to its layer directories.
      continue;
    }

    for (const service of services) {
      const dir = join(
        layerDir,
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
          layer,
          service,
          file,
          source: readFileSync(join(dir, file), 'utf8'),
        });
      }
    }
  }

  return found;
}

const repositories = repositorySources();
const masters = repositories.filter((r) => r.layer === MASTERS_LAYER);
const drainers = repositories.filter((r) => r.source.includes('.pullEvents()'));

function label(r: RepositorySource): string {
  return `${r.layer}/${r.service}/${r.file}`;
}

describe('every Masters repository drains its aggregate into the outbox', () => {
  it('finds the repositories at all', () => {
    // Without this the whole suite passes vacuously the day the layout
    // moves — a green probe that inspects nothing is worse than no probe.
    expect(masters.length).toBeGreaterThanOrEqual(6);
  });

  it('finds repositories outside the Masters too', () => {
    // The scan used to stop at services/masters. IAM has a repository and it
    // was invisible to this probe; so would be the first Process or Engine to
    // grow one.
    expect(repositories.length).toBeGreaterThan(masters.length);
  });

  it.each(masters.map((r) => [label(r), r] as const))(
    '%s calls pullEvents and appends to the outbox',
    (_label, repository) => {
      expect(repository.source).toContain('.pullEvents()');
      expect(repository.source).toContain('appendToOutbox(');
    },
  );
});

describe('any repository that drains does it correctly', () => {
  it.each(drainers.map((r) => [label(r), r] as const))(
    '%s writes the row and the events in one transaction',
    (_label, repository) => {
      // Appending outside the transaction compiles and reads almost the
      // same, and gives up the only guarantee the outbox exists for.
      expect(repository.source).toContain('$transaction');
      expect(repository.source).toContain('appendToOutbox(');
    },
  );

  it('is asserting on something', () => {
    // The Masters are drainers, so this list can never legitimately be empty
    // while the suite above passes.
    expect(drainers.length).toBeGreaterThanOrEqual(6);
  });
});

describe('a repository that does not drain is not assumed broken', () => {
  it('leaves non-draining repositories alone', () => {
    // IAM's aggregates emit no domain events, so its repository has nothing to
    // drain and must not be failed for it. The day IAM does emit events, the
    // suite above starts asserting on it the moment it calls pullEvents —
    // which is the correct trigger, and the reason this probe checks the act
    // of draining rather than the mere existence of a repository.
    const nonDrainers = repositories.filter(
      (r) => !r.source.includes('.pullEvents()'),
    );

    for (const repository of nonDrainers) {
      expect(repository.layer).not.toBe(MASTERS_LAYER);
    }
  });
});
