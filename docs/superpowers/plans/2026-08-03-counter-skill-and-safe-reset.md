# 听桥、撒娇与安全重置实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成听桥反弹、撒娇点击成长和安全重置拆分，并发布桌面 v1.3.8。

**Architecture:** 在伤害领域层新增听桥派生结果，不污染技能原始数据；撒娇复用技能槽战斗上下文；本地清理由精灵配置仓库按完整性谓词筛选，UI 只负责确认与反馈。

**Tech Stack:** React 19、Vitest、Testing Library、Playwright、Electron Builder

## Global Constraints

- 不修改基础伤害公式和数据快照。
- 不把战斗临时状态写入个人配置、配置库或队伍。
- 清理操作不得删除完整可导出配置、收藏或队伍。
- 版本从 1.3.7 升级到 1.3.8。

---

### Task 1: 听桥派生反弹结果

**Files:**
- Modify: `src/domain/calculate.js`
- Modify: `src/domain/calculator-view-model.js`
- Modify: `src/components/FourSkillEditor.jsx`
- Test: `tests/domain/calculate.test.js`
- Test: `tests/ui/skill-editors.test.jsx`

**Interfaces:**
- Consumes: 双方向 `results` 与当前 `selectedSkillIndex`。
- Produces: 听桥槽位可用的反弹结果及来源技能名称、面板威力元数据。

- [ ] 写失败测试：继承来源 `skillPower`，用听桥方物攻重新计算武系物理一段伤害。
- [ ] 运行专项测试并确认因缺少反弹结果失败。
- [ ] 实现最小派生计算与 UI 注释。
- [ ] 运行领域和技能编辑器测试。

### Task 2: 撒娇点击成长

**Files:**
- Modify: `src/domain/choice-skill-sequence.js`
- Modify: `src/App.jsx`
- Test: `tests/domain/choice-skill-sequence.test.js`
- Test: `tests/ui/app-integration.test.jsx`

**Interfaces:**
- Consumes: 撒娇槽位上下文 `moeGainCount`。
- Produces: 每次有效点击后的 `moeGainCount +1`。

- [ ] 写失败测试：普通点击累计一次，输入控件交互不累计。
- [ ] 运行专项测试确认红灯。
- [ ] 在持久战斗上下文推进器中加入撒娇次数。
- [ ] 运行领域和 UI 专项测试。

### Task 3: 安全重置拆分

**Files:**
- Modify: `src/state/spirit-configs.js`
- Modify: `src/hooks/useStoredCalculatorData.js`
- Modify: `src/components/WorkspaceOverlays.jsx`
- Modify: `src/App.jsx`
- Modify: `src/styles.css`
- Test: `tests/state/spirit-configs.test.js`
- Test: `tests/hooks/use-stored-calculator-data.test.jsx`
- Test: `tests/ui/app-integration.test.jsx`

**Interfaces:**
- Produces: `clearIncomplete(snapshot)`，返回保留完整配置后的 v2 状态。
- Produces: 当前页重置回调与带确认的未完成配置清理回调。

- [ ] 写失败测试：完整配置保留，残缺配置清除，收藏和队伍不变。
- [ ] 运行专项测试确认红灯。
- [ ] 实现仓库筛选、Hook 状态刷新和确认弹窗。
- [ ] 运行状态、Hook 和 UI 专项测试。

### Task 4: 发布验证

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `installers/v1.3.8/洛克计算器-1.3.8.exe`

**Interfaces:**
- Produces: 可离线安装的 Windows v1.3.8 安装包。

- [ ] 运行 `npm run data:validate` 与 `npm test`。
- [ ] 运行 `npm run miniapp:sync-core`、`npm run test:core-drift`、`npm run miniapp:test`、`npm run miniapp:build`。
- [ ] 运行 `npm run acceptance:verify`、`npm run e2e`、`npm run build`、`git diff --check`。
- [ ] 升级版本并运行桌面打包。
- [ ] 校验安装包版本、路径、哈希和离线资源。
