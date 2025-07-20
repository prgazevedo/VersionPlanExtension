module.exports = [
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: require('@typescript-eslint/parser'),
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        global: 'readonly',
      },
    },
    rules: {
      'no-console': 'off', // Allow console for VSCode extension logging
      'no-undef': 'off', // TypeScript handles this
      'no-unused-vars': 'off', // TypeScript handles this better
      'no-extra-semi': 'error',
      'no-unreachable': 'error',
      'no-unused-expressions': 'off',
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