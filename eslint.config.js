import js from '@eslint/js';
import prettierConfig from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
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
    files: ['src/indexer/**/*.ts', 'src/server/**/*.ts'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['src/ui/**/*.{ts,tsx}'],
    ...reactHooks.configs.flat['recommended-latest'],
    languageOptions: { globals: globals.browser },
  },
  prettierConfig,
];
