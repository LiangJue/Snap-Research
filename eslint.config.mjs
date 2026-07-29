import eslintReact from '@eslint-react/eslint-plugin';
import js from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

/** @type {import("eslint").Linter.FlatConfig[]} */
export default [
  {
    ignores: [
      '.output/**',
      '.wxt/**',
      '.safari-xcode/**',
      'dist/**',
      'dist-firefox/**',
      'node_modules/**',
      '_temp/**',
      'cloudflare-workers/**',
      'public/src/vendor/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ['src/**/*.{ts,tsx}', 'tests/**/*.{ts,tsx}'],
    plugins: {
      '@eslint-react': eslintReact,
      'react-hooks': reactHooks,
    },
    languageOptions: {
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      '@eslint-react/no-missing-key': 'error',
      '@eslint-react/jsx-no-children-prop-with-children': 'error',
      '@eslint-react/jsx-no-comment-textnodes': 'error',
      '@eslint-react/jsx-no-key-after-spread': 'error',
      '@eslint-react/jsx-no-namespace': 'error',
      '@eslint-react/dom-no-dangerously-set-innerhtml-with-children': 'error',
      '@eslint-react/dom-no-script-url': 'error',
      '@eslint-react/dom-no-unsafe-target-blank': 'error',
      '@eslint-react/dom-no-void-elements-with-children': 'error',

      // The codebase uses `any` in DOM scraping and protocol boundary areas.
      // Keep it permissive until we have time to tighten types.
      '@typescript-eslint/no-explicit-any': 'off',

      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],

      '@typescript-eslint/no-unused-expressions': 'off',
      'no-useless-escape': 'off',
      'no-useless-assignment': 'off',
      'preserve-caught-error': 'off',
      'prefer-const': 'off',

      '@typescript-eslint/ban-ts-comment': 'off',
    },
  },

  {
    files: ['src/ui/**/*.{ts,tsx}', 'src/viewmodels/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: ['@platform', '@platform/*', '@platform/**'],
        },
      ],
    },
  },

  {
    files: ['src/services/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: ['@ui', '@ui/*', '@ui/**', '@viewmodels', '@viewmodels/*', '@viewmodels/**'],
        },
      ],
    },
  },

  // Bootstrap and Shadow-DOM panel mounting are glue layers that currently reuse UI modules/styles.
  // Keep them unblocked by the strict service -> ui restriction, but avoid introducing new deps elsewhere.
  {
    files: ['src/services/bootstrap/**/*.{ts,tsx}', 'src/services/comments/threaded-comments-panel.ts'],
    rules: {
      'no-restricted-imports': 'off',
    },
  },

  {
    files: ['tests/**/*.{ts,tsx}'],
    rules: {
      // Tests sometimes embed escape-heavy strings; keep the rule enabled for src when re-enabled.
      'no-useless-escape': 'off',
    },
  },

  {
    files: ['**/*.cjs'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        module: 'readonly',
        require: 'readonly',
        exports: 'readonly',
        __dirname: 'readonly',
        process: 'readonly',
      },
    },
    rules: {
      'no-undef': 'off',
    },
  },

  {
    files: ['.github/scripts/**/*.{js,mjs}'],
    languageOptions: {
      sourceType: 'module',
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        setTimeout: 'readonly',
        fetch: 'readonly',
        FormData: 'readonly',
        Blob: 'readonly',
        URLSearchParams: 'readonly',
      },
    },
  },

  eslintConfigPrettier,
];
