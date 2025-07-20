const js = require('@eslint/js');

module.exports = [
  js.configs.recommended,
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: require('@typescript-eslint/parser'),
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    rules: {
      'no-console': 'off', // Allow console for VSCode extension logging
      'no-undef': 'off', // TypeScript handles this
      'no-unused-vars': 'off', // TypeScript handles this better
    },
  },
  {
    ignores: [
      'out/**',
      'node_modules/**',
      '*.vsix',
      '.vscode-test/**',
      'coverage/**',
    ],
  },
];