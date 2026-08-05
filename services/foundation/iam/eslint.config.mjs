// @ts-check
import eslint from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import moduleBoundaries from '../../../tools/eslint/module-boundaries.mjs';

export default tseslint.config(
  {
    ignores: ['eslint.config.mjs', 'dist/**', '**/generated/**', 'coverage/**'],
  },
  ...moduleBoundaries,
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      sourceType: 'commonjs',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-floating-promises': 'warn',
    },
  },
  // Nx tags (spread above) police dependencies *between* projects. These rules
  // police the layer split *inside* this one, which the project graph cannot
  // see: to Nx, all four layers are the same node.
  {
    files: ['src/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: ['@nestjs/*', '@prisma/*', '@nafa/platform', 'bcryptjs'],
        },
      ],
    },
  },
  {
    // The application layer holds use cases and ports, and nothing else may
    // leak in: no framework, no crypto library, no adapter. It depends on
    // `domain/` and on its own ports — that is the whole allowed surface.
    //
    // The relative patterns are listed at every depth that exists rather than
    // globbed: `no-restricted-imports` matches the literal specifier, so
    // `**/infrastructure/**` would not catch `../infrastructure/x`.
    files: ['src/application/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            // Frameworks. A use case that imports these can only ever run
            // behind an HTTP server.
            '@nestjs/*',
            '@nafa/platform',
            // Password hashing is behind the PasswordHasher port.
            'bcryptjs',
            // Persistence is behind the IdentityUserRepository port.
            '@prisma/*',
            'prisma',
            '**/generated/**',
            // Adapters. The dependency arrow points inwards, never out.
            '../infrastructure',
            '../infrastructure/**',
            '../../infrastructure',
            '../../infrastructure/**',
            '../../../infrastructure',
            '../../../infrastructure/**',
            '../../../../infrastructure',
            '../../../../infrastructure/**',
            // Same for the layer above.
            '../api',
            '../api/**',
            '../../api',
            '../../api/**',
            '../../../api',
            '../../../api/**',
            '../../../../api',
            '../../../../api/**',
          ],
        },
      ],
    },
  },
  {
    files: ['src/infrastructure/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: ['../api/**', '../../api/**', '../../../api/**'],
        },
      ],
    },
  },
);
