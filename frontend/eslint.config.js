import js from '@eslint/js';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'playwright-report/**', 'test-results/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  jsxA11y.flatConfigs.recommended,
  {
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      // Inputs are labelled through wrapping <Field>/<label htmlFor>; autofocus is intended on kiosk steps.
      'jsx-a11y/no-autofocus': 'off',
      // Scrollable table wrappers are focusable regions so keyboard users can scroll them (axe scrollable-region-focusable).
      'jsx-a11y/no-noninteractive-tabindex': ['error', { roles: ['tabpanel', 'region'] }],
      'jsx-a11y/label-has-associated-control': ['error', { assert: 'either', depth: 3 }],
    },
  },
);
