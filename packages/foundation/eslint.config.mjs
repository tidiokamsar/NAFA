// @ts-check
import eslint from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import moduleBoundaries from '../../tools/eslint/module-boundaries.mjs';

export default tseslint.config(
  {
    ignores: ['eslint.config.mjs', 'dist/**'],
  },
  ...moduleBoundaries,
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: globals.node,
      sourceType: 'commonjs',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: ['@nafa/platform', '@nestjs/*', '@prisma/*'],
        },
      ],
    },
  },
  // Layers inside this package. Nx tags (spread above) police dependencies
  // *between* projects; to the project graph, every folder here is one node.
  //
  // This block is the rule that was missing when the repository ports sat in
  // `application/`: `domain/` imported them, `application/` imported the
  // aggregates back, and nothing failed. ADR-0001 places business ports in
  // `domain/`, so the direction below is the only one that exists.
  //
  // Relative patterns are listed at every depth that occurs rather than
  // globbed: `no-restricted-imports` matches the literal specifier, so
  // `**/application/**` would not catch `../application/x`.
  {
    files: ['src/*/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            '@nafa/platform',
            '@nestjs/*',
            '@prisma/*',
            '../application',
            '../application/**',
            '../../application',
            '../../application/**',
            '../../../application',
            '../../../application/**',
            '../infrastructure',
            '../infrastructure/**',
            '../../infrastructure',
            '../../infrastructure/**',
            '../../../infrastructure',
            '../../../infrastructure/**',
          ],
        },
      ],
    },
  },
);
