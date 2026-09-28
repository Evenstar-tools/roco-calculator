import { defineConfig } from "vitest/config";
import { availableParallelism } from "node:os";
import base from "./vite.config.mjs";

// 日常验收只运行计算/存档核心和关键交互；完整专项使用 test:full。
export default defineConfig({
  ...base,
  test: {
    // 限制并行环境初始化，避免多任务本机验收时用例被资源争用拖到超时。
    maxWorkers: Math.min(4, Math.max(1, availableParallelism() - 1)),
    testTimeout: 15_000,
    projects: [
      {
        extends: true,
        test: {
          name: "core",
          environment: "node",
          include: [
            "tests/domain/*.test.js",
            "tests/state/*.test.js",
            "tests/data/{validate,runtime-snapshot,parsers,current-patch-changes}.test.js",
            "tests/service-worker/*.test.js",
            "tests/docs/release-notes.test.js",
            "tests/build/{performance-budget,build-attribution}.test.js",
          ],
        },
      },
      {
        extends: true,
        test: {
          name: "interaction",
          environment: "jsdom",
          setupFiles: base.test.setupFiles,
          css: true,
          include: [
            "tests/smoke/*.test.jsx",
            "tests/ui/{battle-form-picker,header-portrait,floating-undo-button,calculator-shortcuts,nature-select,stat-tile,team-exchange,team-member-types,team-lineup-flow,toolbox,type-query-panel,transmission-panel,deer-critical,deer-entry,ability-speed-layout,skill-picker-scrollbar,skill-picker-placement,picker-menu-layout,moon-memory-trait-editor,calculator-sections,status-reference,modal-focus}.test.jsx",
          ],
        },
      },
    ],
  },
});
