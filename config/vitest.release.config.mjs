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
            "tests/features/s5-recommended-cn.test.js",
            "tests/state/*.test.js",
            "tests/data/{validate,runtime-snapshot,parsers,current-patch-changes}.test.js",
            "tests/service-worker/*.test.js",
            "tests/docs/release-notes.test.js",
            "tests/build/{performance-budget,build-attribution,global-release}.test.js",
            "tests/scripts/build-preview-release.test.js",
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
            "tests/analytics/*.test.{js,jsx}",
            "tests/ui/workspace-overlays.test.jsx",
            "tests/ui/preset-update-notice.test.jsx",
            "tests/hooks/calculator-session-storage.test.jsx",
            "tests/ui/{global-workspace,web-entry,share-server-boundary,global-tool-boundary,locale-common,team-server-locale,season-theme,season-theme-settings,global-placeholder-workflow,global-placeholder-configuration,skill-query-placeholder}.test.jsx",
            "tests/ui/entity-change-hint.test.jsx",
            "tests/ui/team-roster-drag.test.jsx",
            "tests/ui/damage-comparison-effectiveness.test.jsx",
            "tests/ui/starfall-threshold-dialog.test.jsx",
            "tests/ui/compact-conditions.test.jsx",
            "tests/seo/*.test.js",
            "tests/ui/{battle-form-picker,header-portrait,floating-undo-button,calculator-shortcuts,nature-select,stat-tile,team-exchange,team-member-types,team-lineup-flow,toolbox,type-query-panel,transmission-panel,deer-critical,deer-entry,ability-speed-layout,skill-picker-scrollbar,skill-picker-placement,picker-menu-layout,moon-memory-trait-editor,calculator-sections,status-reference,modal-focus,panel-power-input-regression}.test.jsx",
          ],
        },
      },
    ],
  },
});
