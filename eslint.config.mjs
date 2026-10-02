import globals from "globals";
import pluginJs from "@eslint/js";
import tseslint from "typescript-eslint";
import pluginReactConfig from "eslint-plugin-react/configs/recommended.js";
import { fixupConfigRules } from "@eslint/compat";

export default [
  { files: ["**/*.{js,mjs,cjs,ts,jsx,tsx}"] },
  { languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } } },
  { languageOptions: { globals: { ...globals.browser, ...globals.node } } },
  pluginJs.configs.recommended,
  ...tseslint.configs.recommended,
  ...fixupConfigRules(pluginReactConfig),
  {
    settings: {
      react: {
        version: "detect", // Automatically detect the react version
      },
    },
    rules: {
      "react/react-in-jsx-scope": "off", // Turn off the rule for requiring React in scope
      // `_`-prefixed bindings and rest-sibling destructuring are the
      // codebase's idiom for intentionally-discarded values.
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
    },
  },
  {
    // `ctx.env` is one object shared by every request in a Workers isolate,
    // so per-request state written to it leaks between requests (#140). Put
    // it on a context variable instead; the adapter stack goes through
    // `setRequestData`. These two files are the only sanctioned writers.
    files: ["packages/authhero/src/**/*.{ts,tsx}"],
    ignores: [
      "packages/authhero/src/helpers/request-data.ts",
      "packages/authhero/src/middlewares/apply-config.ts",
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "AssignmentExpression > MemberExpression.left[object.type='MemberExpression'][object.property.name='env']",
          message:
            "Don't write to ctx.env during a request (#140). Use a context variable (ctx.set), or setRequestData for the adapter stack.",
        },
        {
          selector:
            "AssignmentExpression > MemberExpression.left[property.name='env']",
          message:
            "Don't replace ctx.env during a request (#140); only applyConfigMiddleware may copy it.",
        },
      ],
    },
  },
];
