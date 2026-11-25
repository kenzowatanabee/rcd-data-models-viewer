import js from '@eslint/js';
import prettierConfig from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default [
  { ignores: ['dist/', 'build/', 'node_modules/'] },
  {
    files: ['*.js'],
    ...js.configs.recommended,
    languageOptions: { globals: globals.node },
  },
  ...tseslint.configs.recommended,
  ...tseslint.configs.stylistic,
  {
    files: ['src/**/*.ts'],
    languageOptions: { globals: globals.node },
  },
  prettierConfig,
];
