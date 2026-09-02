import tseslint from 'typescript-eslint';

export default tseslint.config(
  ...tseslint.configs.recommended,
  {
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-globals': ['error', 'window', 'document', 'localStorage', 'sessionStorage', 'fetch', 'navigator', 'indexedDB'],
      'no-restricted-imports': ['error', { patterns: ['**/app/**', '**/tools/**', '**/lib/**', 'preact', 'preact/*', '@preact/*'] }]
    }
  },
  { ignores: ['dist', 'legacy', 'node_modules', 'dev-dist', 'scripts'] }
);
