import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

export default tseslint.config(
  { ignores: ["dist", "node_modules", "coverage"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.ts"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.node,
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "FunctionDeclaration[id.name=/^(isRecord|toRecord|asRecord)$/]",
          message:
            "Use shared object-record helpers (for example isObjectRecord) instead of defining local isRecord/toRecord/asRecord functions.",
        },
        {
          selector: "MethodDefinition[key.name=/^(isRecord|toRecord|asRecord)$/]",
          message:
            "Use shared object-record helpers (for example isObjectRecord) instead of defining local isRecord/toRecord/asRecord methods.",
        },
      ],
    },
  },
  {
    files: ["**/__tests__/**/*.ts", "**/*.test.ts", "src/migrations/**/*.ts"],
    rules: {
      "no-restricted-syntax": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
);
