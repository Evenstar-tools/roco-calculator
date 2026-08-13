# 首次使用引导 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为洛克计算器增加每台机器只自动出现一次、可跳过、可重播的六步首次使用引导，从精简版真实操作走到具体版和热门配置导入。

**Architecture:** 使用独立的首次引导状态仓库保存完成标记，独立 React 组件负责定位目标和展示引导卡。App 只负责打开、关闭和复用现有配置库导入服务，精灵、队伍和伤害计算状态不进入引导状态。

**Tech Stack:** React 19、Vitest、Testing Library、现有 CSS 设计系统、现有配置库编解码与本地存储仓库。

## Global Constraints

- 版本号发布为 `1.5.1`。
- 不增加运行时依赖。
- 不修改伤害计算公式、队伍存储、分享结构和配置库格式。
- 第六步必须复用现有内置 PVP 配置导入链路。
- 首次自动触发只发生一次，菜单可随时重播。
- 内置配置必须可离线读取。

---

### Task 1: 首次完成状态仓库

**Files:**
- Create: `src/state/first-run-guide.js`
- Create: `tests/state/first-run-guide.test.js`

**Interfaces:**
- Produces: `FIRST_RUN_GUIDE_STORAGE_KEY`、`isFirstRunGuideCompleted(storage)`、`completeFirstRunGuide(storage)`。

- [ ] **Step 1: 写失败测试**
  - 验证无标记时返回 `false`、完成后返回 `true`、损坏值和不可写存储安全降级。
- [ ] **Step 2: 运行 `npm test -- tests/state/first-run-guide.test.js`，确认因模块缺失失败。**
- [ ] **Step 3: 实现最小 localStorage 仓库。**
- [ ] **Step 4: 重跑单测并确认通过。**

### Task 2: 六步引导组件

**Files:**
- Create: `src/components/FirstRunGuide.jsx`
- Modify: `src/styles.css`
- Create: `tests/ui/first-run-guide.test.jsx`

**Interfaces:**
- Consumes: `open`、`step`、`onBack`、`onNext`、`onSkip`、`onImport`、`importCount`、`importing`、`error`。
- Produces: 可定位 `[data-guide-target]` 的非模态引导层。

- [ ] **Step 1: 写失败测试**
  - 验证六步文案、`x/6` 进度、前后退、跳过、具体版切换、导入中和错误状态。
  - 验证目标缺失时仍可显示且不会抛错。
- [ ] **Step 2: 运行组件测试，确认因组件缺失失败。**
- [ ] **Step 3: 实现定位、视口约束、重算和移动端样式。**
- [ ] **Step 4: 重跑组件测试并修至通过。**

### Task 3: 主界面接入与导入复用

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/components/WorkspaceOverlays.jsx`
- Modify: `src/components/SpiritStep.jsx`
- Modify: `src/components/SkillStep.jsx`
- Modify: `tests/ui/app-integration.test.jsx`
- Modify: `tests/ui/workspace-overlays.test.jsx`

**Interfaces:**
- Consumes: Task 1 完成标记与 Task 2 引导组件。
- Produces: 首次自动打开、跳过持久化、菜单重播、第五步具体版切换、第六步内置配置导入。

- [ ] **Step 1: 写失败集成测试**
  - 首次显示、跳过后重启不显示、菜单重播。
  - 第六步导入成功后关闭，收藏与配置刷新，队伍和当前页面不变。
- [ ] **Step 2: 运行定向测试并确认失败原因是引导未接入。**
- [ ] **Step 3: 给三个目标增加稳定属性并接入引导状态。**
- [ ] **Step 4: 抽出内置配置懒加载函数，供菜单弹窗和首次引导共同使用。**
- [ ] **Step 5: 重跑集成测试并修至通过。**

### Task 4: 版本与发布验收

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `public/sw.js`
- Modify: `tests/desktop/branding.test.js`

**Interfaces:**
- Produces: `1.5.1` Windows 安装包与测试证据。

- [ ] **Step 1: 将应用版本和离线缓存版本升级到 `1.5.1`，更新对应断言。**
- [ ] **Step 2: 运行 `npm run data:validate`、`npm test`、`npm run e2e`、`npm run build`、`git diff --check`。**
- [ ] **Step 3: 运行 `npm run desktop:pack` 并检查安装包名称、体积和离线资源。**
- [ ] **Step 4: 在真实桌面运行态验证首次触发、跳过、重播和热门配置导入。**
- [ ] **Step 5: 将安装包发送给飞书联系人“晚星”，回读消息确认收件人、版本号和附件。**

## Self-Review

- Spec coverage: 六步流程、首次触发、跳过、重播、具体版切换、离线导入、记忆说明、响应式和发布均有对应任务。
- Placeholder scan: 无 TBD、TODO 或未定义接口。
- Type consistency: 引导仓库只处理布尔完成状态；配置导入继续使用现有 parsed/import 接口。
