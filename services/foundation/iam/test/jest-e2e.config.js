module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testEnvironment: 'node',
  testRegex: '.e2e-spec.ts$',
  // Only TypeScript goes through ts-jest. The previous `(t|j)s` pattern also
  // matched the compiled .js that @nafa/platform and @nafa/foundation expose
  // from dist/, which made ts-jest warn once per file on every run because
  // allowJs is false. Those files are already valid CommonJS and need no
  // transform — narrowing the pattern is the fix, not turning allowJs on.
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  // Provisions and cleans nafa_test.
  globalSetup: '<rootDir>/e2e-global-setup.ts',
  // Forces .env.test over the environment Nx injects. See e2e-env.ts.
  setupFiles: ['<rootDir>/e2e-env.ts'],
};
