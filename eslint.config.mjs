import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import unusedImports from "eslint-plugin-unused-imports";

const unusedImportRules = {
  "unused-imports/no-unused-imports": "error",
  "unused-imports/no-unused-vars": [
    "error",
    {
      args: "after-used",
      argsIgnorePattern: "^_",
      vars: "all",
      varsIgnorePattern: "^_",
    },
  ],
};

export default [
  {
    ignores: [
      "dist/**",
      "release/**",
      "node_modules/**",
      "miniapp/**",
      "artifacts/**",
      "output/**",
      "tmp/**",
      "data/**",
      // 另一会话的在途功能改动，本轮只记录告警、不改这些文件。
      // miniapp/ 已整体忽略；此处仍列出 8 个在途文件以免后续放宽 ignore 时被扫到。
      "src/App.jsx",
      "src/domain/calculate.js",
      "src/domain/marks.js",
      "miniapp/src/shared/domain/calculate.js",
      "miniapp/src/shared/domain/marks.js",
      "miniapp/src/components/BattleWorkspace.jsx",
      "tests/domain/calculate.test.js",
      "tests/ui/app-integration.test.jsx",
    ],
  },
  {
    plugins: {
      "react-hooks": reactHooks,
      "unused-imports": unusedImports,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...unusedImportRules,
    },
  },
  {
    files: ["src/**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      globals: globals.browser,
    },
  },
  {
    files: [
      "scripts/**/*.{js,mjs,cjs}",
      "desktop/**/*.{js,mjs,cjs}",
      "config/**/*.{js,mjs,cjs}",
    ],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: globals.node,
    },
  },
  {
    files: ["tests/**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.vitest,
      },
    },
  },
];
