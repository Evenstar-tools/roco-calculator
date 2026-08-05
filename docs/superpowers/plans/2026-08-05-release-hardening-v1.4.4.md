# v1.4.4 Release Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将当前仓库收口为具备无告警测试、生产离线验证、性能预算、依赖门禁和可恢复工作区清理的 v1.4.4。

**Architecture:** 保持现有 React/Vite/Electron 结构不变；新增独立的性能预算验证脚本与生产 E2E，用现有领域测试补齐生命周期证据。依赖只做同主版本安全更新，旧交付物通过仓库外隔离目录和 Git bundle 保留七天恢复能力。

**Tech Stack:** React 19、Vite 6、Vitest 3、Playwright 1、Electron 43、PowerShell、GitHub Actions。

## Global Constraints

- 不修改伤害计算公式、状态 schema、分享结构或用户存储结构。
- 不升级 React、Vite、Vitest、Playwright、Electron Builder 的主版本。
- 所有文本保持 UTF-8；修改使用 LF。
- 旧安装包与旧分支必须先可恢复备份，隔离期为七天。
- 发布版本固定为 `1.4.4`，Service Worker 缓存名同步为 `rock-calculator-webapp-v1.4.4`。

---

### Task 1: 消除 React 异步测试告警

**Files:**
- Modify: `tests/ui/team-drawer.test.jsx`
- Test: `tests/ui/team-drawer.test.jsx`

**Interfaces:**
- Consumes: `DrawerHarness`、Testing Library `waitFor`。
- Produces: 测试结束前确认成员编辑器懒加载状态稳定的等待断言。

- [ ] **Step 1: 运行单文件测试并保存 stderr 告警证据**

Run: `npm test -- tests/ui/team-drawer.test.jsx`

Expected: 测试通过，但输出 `A component suspended inside an act scope`。

- [ ] **Step 2: 在触发懒加载的用例末尾增加稳定状态断言**

在 `creates and edits one of six team members` 末尾等待成员编辑区域不再显示加载占位，并确认四个技能选择器仍存在；不使用固定延时。

- [ ] **Step 3: 重新运行并确认 stderr 中不再出现 React act 告警**

Run: `npm test -- tests/ui/team-drawer.test.jsx`

Expected: PASS，且输出不包含 `suspended inside an act scope`。

- [ ] **Step 4: 提交测试稳定性修复**

```text
git add tests/ui/team-drawer.test.jsx
git commit -m "test: wait for team editor lazy updates"
```

### Task 2: 收紧依赖与安全审计

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Test: `tests/desktop/branding.test.js`

**Interfaces:**
- Consumes: 现有 npm scripts 和 Electron Builder 文件白名单。
- Produces: 运行时依赖仅含 React 与图标库；构建工具位于 `devDependencies`。

- [ ] **Step 1: 记录当前生产审计失败信号**

Run: `npm audit --omit=dev --json`

Expected: 至少一个 high 项，来源包含 `undici`。

- [ ] **Step 2: 调整依赖分类并做同主版本安全更新**

将 `@vitejs/plugin-react`、`cheerio`、`pinyin-pro`、`vite` 移入 `devDependencies`；将 `electron`、`cheerio`、`pinyin-pro`、`@testing-library/user-event` 更新到当前同主版本稳定补丁。若开发链仍锁定漏洞版本，只对 `fast-uri` 和 `undici` 添加满足公告修复版本的精确 `overrides`。

- [ ] **Step 3: 验证生产审计和桌面包边界**

Run: `npm audit --omit=dev --json`

Expected: high 为 0。

Run: `npm test -- tests/desktop/branding.test.js`

Expected: PASS，桌面文件白名单仍不包含 `node_modules`。

- [ ] **Step 4: 提交依赖收口**

```text
git add package.json package-lock.json tests/desktop/branding.test.js
git commit -m "build: harden dependency boundary"
```

### Task 3: 生产构建离线 E2E

**Files:**
- Create: `e2e/offline-performance.spec.js`
- Modify: `playwright.config.js`
- Modify: `package.json`
- Test: `e2e/offline-performance.spec.js`

**Interfaces:**
- Consumes: `public/sw.js`、`npm run build`、Vite preview。
- Produces: 生产构建下的 Service Worker 控制、断网重载和缓存命中证据。

- [ ] **Step 1: 添加离线测试并在开发服务器配置下验证失败**

测试先访问 `/`，等待 `navigator.serviceWorker.ready`，重载使页面被控制，断网后再次重载，断言标题和 `/data/runtime.json` 均可用。

Run: `npm run e2e -- --grep "works offline after the service worker caches the production app"`

Expected: FAIL，因为开发模式不注册 Service Worker。

- [ ] **Step 2: 将 E2E 服务切换为生产构建与 preview**

新增 `preview:test` 脚本，命令固定为 `vite preview --host 127.0.0.1 --port 4174 --strictPort`；Playwright 的 `webServer.command` 改为 `npm run build && npm run preview:test`，并关闭复用未知旧服务。

- [ ] **Step 3: 验证断网重载和现有 E2E**

Run: `npm run e2e -- --grep "works offline after the service worker caches the production app"`

Expected: PASS。

Run: `npm run e2e`

Expected: 全部 PASS。

- [ ] **Step 4: 提交生产离线门禁**

```text
git add e2e/offline-performance.spec.js playwright.config.js package.json
git commit -m "test: verify production offline fallback"
```

### Task 4: 构建体积和交互性能预算

**Files:**
- Create: `scripts/verify-performance-budget.mjs`
- Create: `tests/build/performance-budget.test.js`
- Modify: `e2e/offline-performance.spec.js`
- Modify: `package.json`

**Interfaces:**
- Produces: `verifyPerformanceBudget({ distRoot, budgets }) -> { metrics, violations }`。
- Consumes: `dist/client` 中 runtime JSON、JS、CSS 和离线头像资源。

- [ ] **Step 1: 编写脚本单元测试并验证模块尚不存在**

覆盖低于预算通过、单项超限返回违规、缺少 runtime 文件报错三个用例。

Run: `npm test -- tests/build/performance-budget.test.js`

Expected: FAIL，找不到 `scripts/verify-performance-budget.mjs`。

- [ ] **Step 2: 实现预算脚本**

默认阈值：runtime JSON 1.5 MiB、JS 原始总量 650 KiB、JS gzip 总量 190 KiB、CSS gzip 总量 24 KiB、客户端总量 65 MiB。CLI 输出每项实测值，任一超限退出码为 1。

- [ ] **Step 3: 接入构建并增加浏览器耗时断言**

新增 `performance:verify`，在 `vite build` 后执行。E2E 记录首次可见、热重载和技能搜索结果出现时间，阈值分别为 10 秒、5 秒和 1.5 秒。

- [ ] **Step 4: 验证预算和生产交互**

Run: `npm test -- tests/build/performance-budget.test.js`

Expected: PASS。

Run: `npm run build`

Expected: PASS 并打印预算实测值。

Run: `npm run e2e -- --grep "stays within cold warm and skill search budgets"`

Expected: PASS。

- [ ] **Step 5: 提交性能门禁**

```text
git add scripts/verify-performance-budget.mjs tests/build/performance-budget.test.js e2e/offline-performance.spec.js package.json
git commit -m "test: enforce release performance budgets"
```

### Task 5: 规则与状态生命周期证据

**Files:**
- Modify: `tests/domain/skill-status-effects.test.js`
- Modify: `tests/state/calculator-session.test.js`
- Modify: `docs/acceptance-matrix.md`

**Interfaces:**
- Consumes: 现有状态技能规则、换精灵和槽位选择 API。
- Produces: 跨槽、换人、重复触发与当前快照规则有效性的回归证据。

- [ ] **Step 1: 检查现有测试缺口并添加失败用例**

增加组合用例：状态技能点击一次只应用一次；切换技能槽不会重复应用；切换精灵清空战斗态但保留个人配置；重新选择原精灵不恢复本回合触发态。

- [ ] **Step 2: 运行领域和会话测试**

Run: `npm test -- tests/domain/skill-status-effects.test.js tests/state/calculator-session.test.js`

Expected: 新用例若暴露缺陷则先失败；只允许针对失败行为做最小生产修复。

- [ ] **Step 3: 修复最小生命周期缺陷并回归**

Run: `npm test -- tests/domain/skill-status-effects.test.js tests/state/calculator-session.test.js`

Expected: PASS。

- [ ] **Step 4: 将当前快照两项验收状态改为通过**

矩阵明确“当前快照规则有自动证据；未来新增数据需同步新增规则测试”，不把未来维护义务写成当前部分交付。

- [ ] **Step 5: 提交规则证据**

```text
git add tests/domain/skill-status-effects.test.js tests/state/calculator-session.test.js docs/acceptance-matrix.md
git commit -m "test: close status lifecycle coverage"
```

### Task 6: 版本、文档与全量回归

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `public/sw.js`
- Modify: `CHANGELOG.md`
- Modify: `README.md`
- Modify: `docs/acceptance-matrix.md`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Produces: v1.4.4 版本标识、缓存隔离、发布策略与 CI 性能/离线门禁。

- [ ] **Step 1: 升级版本与缓存名**

使用 `npm version 1.4.4 --no-git-tag-version`，并将 Service Worker 缓存改为 `rock-calculator-webapp-v1.4.4`。

- [ ] **Step 2: 更新变更记录、发布策略和 CI**

CHANGELOG 记录测试无告警、离线、性能、依赖与清理；README 说明 GitHub Release 只保留稳定里程碑而 CHANGELOG 记录全部版本；CI 增加生产审计和性能预算。

- [ ] **Step 3: 执行全量本地验收**

依次运行：

```text
npm run data:validate
npm test
npm run miniapp:sync-core
npm run test:core-drift
npm run miniapp:test
npm run miniapp:build
npm run acceptance:verify
npm run e2e
npm run build
npm run desktop:pack
node scripts/verify-package-branding.mjs --packaged
npm audit --omit=dev
git diff --check
```

Expected: 全部退出码 0，无 React act 告警。

- [ ] **Step 4: 提交发布变更**

```text
git add package.json package-lock.json public/sw.js CHANGELOG.md README.md docs/acceptance-matrix.md .github/workflows/ci.yml
git commit -m "release: prepare v1.4.4"
```

### Task 7: 可恢复清理、远端发布与本机安装

**Files:**
- Create outside repository: `D:/codex/quarantine/rock-calculator-release-buffer-20260805/manifest.json`
- Create outside repository: `D:/codex/quarantine/rock-calculator-release-buffer-20260805/stale-agent-branches.bundle`
- Keep: `installers/v1.4.4/洛克计算器-1.4.4.exe`

**Interfaces:**
- Produces: 七天恢复清单、唯一最新安装包、GitHub v1.4.4 Release 和本机 v1.4.4。

- [ ] **Step 1: 校验清理目标并建立隔离区**

解析所有目标绝对路径，确认只位于 `installers`、`release`、空 `.worktrees` 和三个旧 agent 分支；记录文件大小、SHA256、来源路径和 `deleteAfter=2026-08-12`。

- [ ] **Step 2: 备份旧分支并移动旧安装包**

用 `git bundle create` 保存 main 与旧 agent 分支，`git bundle verify` 通过后才删除旧本地分支。将 v1.4.1-v1.4.3 和重复安装包移动到隔离区，不永久删除。

- [ ] **Step 3: 仅保留 v1.4.4 安装包并清理生成目录**

将桌面安装器复制到 `installers/v1.4.4`，写 SHA256；移除可重建的 `release/win-unpacked` 与临时打包文件，保留最新安装器。

- [ ] **Step 4: 推送并验证 CI**

推送 main 后读取 GitHub Actions；若 push 未触发，则手动运行 `ci.yml`。等待 validate、miniapp、e2e 全部通过。

- [ ] **Step 5: 创建 v1.4.4 Release 并回读资产**

创建签名 tag `v1.4.4`，上传安装器和 SHA256 文件；从 GitHub API 回读 tag、资产名、大小和摘要。

- [ ] **Step 6: 覆盖安装并启动冒烟**

静默安装 v1.4.4，核对卸载项、安装目录 `package.json` 与运行窗口标题；启动成功后仅关闭本轮新建进程。

- [ ] **Step 7: 最终状态门禁**

确认 `git status --short` 为空、`HEAD == origin/main`、HEAD 被 `v1.4.4` 标记、工作区只保留最新版安装包，隔离区清单可读且校验和匹配。
