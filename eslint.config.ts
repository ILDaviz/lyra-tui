import eslint from "@eslint/js";
import importPlugin from "eslint-plugin-import";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig([
  globalIgnores([
    "dist/",
    "node_modules/",
    "packages/*/dist/",
    "packages/*/__tests__/*.js",
    "packages/*/__tests__/*.bun.test.tsx",
    "bun.lock",
    ".agents/",
  ]),

  {
    name: "lyratui/base",
    files: ["**/*.ts", "**/*.tsx"],
    plugins: {
      js: eslint,
      "@typescript-eslint": tseslint.plugin,
      import: importPlugin,
    },
    extends: [eslint.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        projectService: {
          allowDefaultProject: [
            "vitest.config.ts",
            "eslint.config.ts",
            "commitlint.config.ts",
          ],
        },
        tsconfigRootDir: __dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-unused-expressions": [
        "error",
        { allowShortCircuit: true, allowTernary: true },
      ],
      "import/consistent-type-specifier-style": ["error", "prefer-top-level"],
      "no-console": "off",
      "prefer-const": "error",
      "no-var": "error",
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
]);
