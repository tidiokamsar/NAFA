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
      // The domain layer imports neither NestJS, nor Prisma, nor the
      // platform: see AGENTS.md §1 and docs/adr/0001-ddd-layering-for-services.md
      'no-restricted-imports': [
        'error',
        {
          patterns: ['@nafa/platform', '@nestjs/*', '@prisma/*'],
        },
      ],
    },
  },
);
