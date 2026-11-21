import js from '@eslint/js';
import tseslint from 'typescript-eslint';

// Hex colors are allowed in exactly one file. Everything else imports from tokens.ts.
const noHexOutsideTokens = {
  selector: 'Literal[value=/#[0-9A-Fa-f]{6}\\b/], TemplateElement[value.raw=/#[0-9A-Fa-f]{6}\\b/]',
  message: 'Hex colors live only in src/config/tokens.ts. Import the token instead.',
};
const noEmDash = {
  selector: 'Literal[value=/\\u2014/], TemplateElement[value.raw=/\\u2014/]',
  message: 'No em dashes in copy or output.',
};

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'tests/fixtures', 'src-tauri'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  { rules: { 'no-restricted-syntax': ['error', noHexOutsideTokens, noEmDash] } },
  {
    files: ['src/config/tokens.ts', 'tests/**/*.ts'],
    rules: { 'no-restricted-syntax': ['error', noEmDash] },
  },
  { files: ['src/core/**/*.ts'], rules: { '@typescript-eslint/no-explicit-any': 'error' } },
);
