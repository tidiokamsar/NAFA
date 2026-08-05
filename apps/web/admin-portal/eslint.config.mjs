// @ts-check
import eslint from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import moduleBoundaries from '../../../tools/eslint/module-boundaries.mjs';

export default tseslint.config(
  {
    ignores: ['eslint.config.mjs', '.next/**', 'next-env.d.ts'],
  },
  ...moduleBoundaries,
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },
);
