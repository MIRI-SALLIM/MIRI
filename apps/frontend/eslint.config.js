import path from "node:path";

import eslint from "@eslint/js";
import boundaries from "eslint-plugin-boundaries";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

const layers = ["app", "pages", "widgets", "features", "entities", "shared"];

const elementTypes = (types) => ({
  to: { element: { types: { anyOf: types } } },
});

export default tseslint.config(
  { ignores: ["dist", "coverage", "playwright-report", "test-results"] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["*.cjs"],
    languageOptions: {
      globals: {
        module: "readonly",
      },
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      boundaries,
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    settings: {
      "import/resolver": {
        typescript: {
          alwaysTryTypes: true,
          project: path.join(import.meta.dirname, "tsconfig.json"),
        },
      },
      "boundaries/root-path": import.meta.dirname,
      "boundaries/include": ["src/**/*"],
      "boundaries/elements": [
        { type: "shared", pattern: "src/shared/ui/*", partialMatch: false },
        { type: "shared", pattern: "src/shared/*", partialMatch: false },
        { type: "entities", pattern: "src/entities/*", partialMatch: false },
        { type: "features", pattern: "src/features/*", partialMatch: false },
        { type: "widgets", pattern: "src/widgets/*", partialMatch: false },
        { type: "pages", pattern: "src/pages/*", partialMatch: false },
        { type: "app", pattern: "src/app", partialMatch: false },
      ],
      "boundaries/files": [{ category: "ambient", pattern: "src/*.d.ts" }],
    },
    rules: {
      ...reactHooks.configs.flat.recommended.rules,
      ...reactRefresh.configs.vite.rules,
      "boundaries/dependencies": [
        "error",
        {
          default: "disallow",
          policies: [
            {
              from: { element: { type: "app" } },
              allow: elementTypes(layers),
            },
            {
              from: { element: { type: "pages" } },
              allow: elementTypes(["pages", "widgets", "features", "entities", "shared"]),
            },
            {
              from: { element: { type: "widgets" } },
              allow: elementTypes(["widgets", "features", "entities", "shared"]),
            },
            {
              from: { element: { type: "features" } },
              allow: elementTypes(["features", "entities", "shared"]),
            },
            {
              from: { element: { type: "entities" } },
              allow: elementTypes(["entities", "shared"]),
            },
            {
              from: { element: { type: "shared" } },
              allow: elementTypes(["shared"]),
            },
            {
              from: { element: { types: { anyOf: layers } } },
              disallow: {
                to: {
                  element: {
                    fileInternalPath: "!index.{ts,tsx}",
                  },
                },
              },
              message: "다른 슬라이스는 index.ts 공개 API를 통해 import하세요.",
            },
          ],
        },
      ],
      "boundaries/no-unknown-dependencies": "error",
      "boundaries/no-unknown-files": "error",
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
    },
  },
);
