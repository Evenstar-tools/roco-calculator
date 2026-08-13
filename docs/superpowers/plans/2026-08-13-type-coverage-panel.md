# Type Coverage Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 增加可持久化开关，并在结果栏以属性图标显示精灵弱点、抗性、四技能打击面和盲区。

**Architecture:** 在 `type-chart` 之上增加无 UI 的属性分析纯函数，由视图模型组合当前方向的精灵与技能。设置状态独立保存，`ResultRail` 只负责紧凑展示，不修改既有伤害计算结果。

**Tech Stack:** React、Vitest、Testing Library、Playwright、现有本地属性图标与 S3 属性矩阵。

## Global Constraints

- 默认关闭并按设备记忆。
- 只统计十八种单属性目标。
- 变化、防御技能与空槽不参与打击面。
- 不写入分享、配置库或队伍数据。
- 不增加运行时依赖。

---

### Task 1: 属性分析纯函数

**Files:**
- Modify: `src/domain/type-chart.js`
- Test: `tests/domain/type-chart.test.js`
- Sync: `miniapp/src/shared/domain/type-chart.js`

**Interfaces:**
- Produces: `analyzeDefensiveTypes(defenderTypes, chart)`
- Produces: `analyzeSkillTypeCoverage(skills, chart)`

- [ ] 写失败测试，覆盖双属性 ×3/×0.25、排除变化和防御技能、多个攻击技能取最高倍率。
- [ ] 运行 `npx vitest run tests/domain/type-chart.test.js`，确认因接口不存在而失败。
- [ ] 实现最小纯函数并保持原 `getTypeMultiplier` 不变。
- [ ] 再次运行专项测试并同步小程序共享核心。

### Task 2: 设置持久化与入口

**Files:**
- Create: `src/state/display-settings.js`
- Create: `src/components/DisplaySettingsDialog.jsx`
- Modify: `src/App.jsx`
- Modify: `src/components/WorkspaceOverlays.jsx`
- Modify: `src/styles.css`
- Test: `tests/state/display-settings.test.js`
- Test: `tests/ui/workspace-overlays.test.jsx`

**Interfaces:**
- Produces: `readTypeCoverageSetting(storage)`
- Produces: `writeTypeCoverageSetting(storage, enabled)`
- Consumes: `settings.typeCoverageEnabled` and `settings.onTypeCoverageChange`

- [ ] 写设置默认关闭、写入和损坏数据回退测试。
- [ ] 写菜单打开设置、开关具名且可操作的 UI 失败测试。
- [ ] 实现独立设置存储、设置弹窗及菜单入口。
- [ ] 运行状态与覆盖层专项测试。

### Task 3: 结果栏属性面板

**Files:**
- Modify: `src/domain/calculator-view-model.js`
- Create: `src/components/TypeCoveragePanel.jsx`
- Modify: `src/components/ResultRail.jsx`
- Modify: `src/components/WorkspaceOverlays.jsx`
- Modify: `src/styles.css`
- Test: `tests/domain/calculator-view-model.test.js`
- Test: `tests/ui/result-rail.test.jsx`
- Test: `tests/ui/app-integration.test.jsx`

**Interfaces:**
- `result.typeAnalysis = { defense: { weaknesses, resistances }, offense: { coverage, blindSpots } }`
- `ResultRail` consumes `showTypeCoverage` and renders `TypeCoveragePanel` only when enabled.

- [ ] 写视图模型失败测试，验证当前方向与有效四技能。
- [ ] 写结果栏失败测试，验证图标、倍率、开关关闭和窄内容结构。
- [ ] 将当前攻防精灵和技能交给纯函数，生成方向化模型。
- [ ] 实现三行紧凑面板和深色/响应式样式。
- [ ] 运行领域、UI、集成专项测试。

### Task 4: 完整验收

**Files:**
- Modify: `e2e/uiux-team-presets.spec.js`

- [ ] 增加桌面设置开启、方向切换和移动结果抽屉 E2E。
- [ ] 运行 `npm run miniapp:sync-core` 与 `npm run test:core-drift`。
- [ ] 运行 `npm test`、`npm run miniapp:test`、`npm run data:validate`。
- [ ] 运行 `npm run e2e`、`npm run build`、`git diff --check`。
- [ ] 检查 1280px、390px 与深色模式截图，确认不遮挡伤害主信息。
