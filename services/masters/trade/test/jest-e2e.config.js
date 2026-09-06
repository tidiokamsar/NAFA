module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testEnvironment: 'node',
  testRegex: '.e2e-spec.ts$',
  // Only TypeScript goes through ts-jest — compiled .js from workspace
  // packages is already valid CommonJS and needs no transform.
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  // Provisions and cleans nafa_test (shared with IAM's e2e suite — the
  // suites touch disjoint tables).
  globalSetup: '<rootDir>/e2e-global-setup.ts',
  // Forces .env.test over the environment Nx injects. See e2e-env.ts.
  setupFiles: ['<rootDir>/e2e-env.ts'],
};
