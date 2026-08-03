import { ESLint } from 'eslint';
import { join } from 'node:path';

const packageRoot = join(import.meta.dirname, '..');
const eslint = new ESLint({ cwd: packageRoot });
const filePath = join(packageRoot, 'src/actor/domain/actor.aggregate.ts');
const source = [
  "import type { ActorRepository } from '../application/ports/actor-repository.port';",
  "import type { PrismaActorRepository } from '../infrastructure/prisma/actor.repository';",
  'export type Probe = ActorRepository | PrismaActorRepository;',
].join('\n');

const [result] = await eslint.lintText(source, { filePath });
const blocked = result.messages.filter(
  (message) => message.ruleId === 'no-restricted-imports',
);

if (blocked.length !== 2) {
  throw new Error('ESLint did not reject both forbidden domain imports.');
}
