import { defineConfig } from "@playwright/test";
import base from "./playwright.config.js";

// 文件 + 用例名明确列出关键链路，避免每次发布遍历全部主题/分辨率。
export default defineConfig(base, {
  testMatch: [
    "offline-performance.spec.js",
    "lineup-iv-recovery.spec.js",
    "uiux-skills-traits.spec.js",
    "analysis-phase1-acceptance.spec.js",
    "skill-query.spec.js",
    "transmission-visual-regression.spec.js",
  ],
  grep: /works offline|stays within cold warm and skill search budgets|actual user QR.*390$|old pending roster.*390$|recalculates current stacked|persists single-skill state|keeps portrait mode switch styling stable|uses negative-status skills|final speed, explicit apply.*(?:1424 light|390 dark)$|双向查询与完整学习面 320px light$|failed catalog can retry|readable skill menus and keyboard bounds 390 dark$/,
});
