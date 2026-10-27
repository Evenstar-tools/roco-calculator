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
            "tests/runtime/preview-routes.test.js",
            "tests/features/balance-comparison.test.js",
            "tests/features/s5-preview-*.test.js",
            "tests/features/s5-season-announcement.test.js",
            "tests/state/*.test.js",
            "tests/data/{validate,runtime-snapshot,parsers,current-patch-changes,nrc-import,compare-season-snapshots,s5-preview-catalog}.test.js",
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
            "tests/runtime/preview-storage.test.js",
            "tests/ui/public-resource-base.test.jsx",
            "tests/analytics/*.test.{js,jsx}",
            "tests/ui/workspace-overlays.test.jsx",
            "tests/hooks/calculator-session-storage.test.jsx",
            "tests/hooks/balance-comparison.test.jsx",
            "tests/ui/{global-workspace,web-entry,share-server-boundary,global-tool-boundary,locale-common,team-server-locale,season-theme,season-theme-settings,global-placeholder-workflow,global-placeholder-configuration,skill-query-placeholder}.test.jsx",
            "tests/ui/entity-change-hint.test.jsx",
            "tests/ui/{balance-comparison-flow,balance-comparison-results}.test.jsx",
            "tests/ui/{s5-preview-pending-stats,s5-preview-live-traits,s5-preview-trait-summary}.test.jsx",
            "tests/ui/{s5-announcement-activation,skill-query-s5-announcement}.test.jsx",
            "tests/ui/team-roster-drag.test.jsx",
            "tests/ui/damage-comparison-effectiveness.test.jsx",
            "tests/seo/*.test.js",
            "tests/ui/{battle-form-picker,header-portrait,floating-undo-button,calculator-shortcuts,nature-select,stat-tile,team-exchange,team-member-types,team-lineup-flow,toolbox,type-query-panel,transmission-panel,deer-critical,deer-entry,ability-speed-layout,skill-picker-scrollbar,skill-picker-placement,picker-menu-layout,moon-memory-trait-editor,calculator-sections,status-reference,modal-focus,panel-power-input-regression}.test.jsx",
          ],
        },
      },
    ],
  },
});
