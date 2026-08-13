# 微信小程序参考图导向极简界面 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将小程序 v0.1.1 重构为参考图导向的极简手机工作台，并保持 iPad 接近桌面版的高效体验。

**Architecture:** 保留现有计算、store、记忆、收藏配置和分享协议，只重组 `BattleWorkspace` 的展示层。新增六维网格与参数面板，复用现有精灵选择、性格、个体、技能、条件和结果组件；手机仅显示当前方向技能，iPad继续双侧与结果栏布局。页面样式按职责拆分，避免继续叠加旧 CSS 补丁。

**Tech Stack:** Taro 4.2.1、React 18、Vitest、Testing Library、Vite、微信小程序 WXSS/WXML。

## Global Constraints

- 小程序版本保持 `0.1.1`，网页核心保持 `1.4.3`。
- 保留 592 个精灵、真实头像、属性图标、六维图标和内置常用配置。
- 保留计算、记忆、收藏配置、主动导入、分享和持久化协议。
- 手机触控目标不小于 44×44 px，正文不小于 14 px，辅助文字不小于 12 px。
- 验证视口：320×844、375×812、390×844、430×932、820×1180、1024×768。
- 微信主包不得超过 2 MiB；不得通过删除业务功能或精灵数据换体积。
- 不使用紫色主题、玻璃效果、装饰渐变、Emoji 或虚构技能图片。

---

### Task 0: 固化恢复后的 v0.1.1 基线

**Files:**
- Commit: 当前 `git status --short` 中与 2026-08-07 14:23:42 备份完全一致的文件

**Interfaces:**
- Consumes: 已验证 SHA256 的备份快照和通过的 246 项小程序测试。
- Produces: 干净可追溯的 v0.1.1 UI 基线提交。

- [ ] **Step 1: 重新运行基线发布检查**

Run: `npm --prefix miniapp test -- --run && npm run miniapp:build:prod`

Expected: 24 个测试文件通过，发布门禁通过，主包不超过 2 MiB。

- [ ] **Step 2: 检查待提交范围**

Run: `git status --short && git diff --check`

Expected: 只包含已恢复备份快照的源码、测试、资源和文档，不包含 `dist`、`node_modules`、本地私密配置或截图产物。

- [ ] **Step 3: 提交基线**

```bash
git add README.md miniapp scripts/miniapp src/domain/calculator-view-model.js tests/miniapp design-qa.md docs/superpowers/plans/2026-08-06-miniapp-phone-release-ui.md docs/superpowers/plans/2026-08-07-miniapp-mobile-battle-workbench.md docs/superpowers/specs/2026-08-06-miniapp-phone-release-ui-design.md
git commit -m "chore: checkpoint restored miniapp v0.1.1 baseline"
```

### Task 1: 六维参数网格与参数面板

**Files:**
- Create: `miniapp/src/components/CombatantStatGrid.jsx`
- Create: `miniapp/src/components/CombatantParameterSheet.jsx`
- Modify: `miniapp/src/components/BattleWorkspace.jsx`
- Test: `miniapp/tests/combatant-parameter-sheet.test.jsx`

**Interfaces:**
- Consumes: `createCombatantView(snapshot, configuration)`，现有 `QuickCombatantControls`、`CombatantDetails`。
- Produces: `CombatantStatGrid({ configuration, onOpen, side, snapshot })` 和 `CombatantParameterSheet({ configuration, onClose, onIvChange, onNatureChange, open, side, snapshot })`。

- [ ] **Step 1: 写六维网格与面板失败测试**

```jsx
render(<CombatantStatGrid configuration={side} onOpen={onOpen} side="attacker" snapshot={snapshot} />);
expect(screen.getByLabelText("攻击方六维参数")).toHaveTextContent("生命");
expect(screen.getByLabelText("攻击方生命 428")).toBeInTheDocument();
fireEvent.click(screen.getByLabelText("攻击方速度 223"));
expect(onOpen).toHaveBeenCalledTimes(1);
```

```jsx
render(<CombatantParameterSheet open side="attacker" {...props} />);
expect(screen.getByRole("dialog", { name: "攻击方参数设置" })).toBeInTheDocument();
fireEvent.click(screen.getByRole("button", { name: "完成攻击方参数设置" }));
expect(props.onClose).toHaveBeenCalledTimes(1);
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm --prefix miniapp test -- --run tests/combatant-parameter-sheet.test.jsx`

Expected: FAIL，组件文件尚不存在。

- [ ] **Step 3: 实现六维网格与参数面板**

`CombatantStatGrid` 显示 `view.stats` 的 `label`、`panel` 和性格升降状态；六格共享 `onOpen(side)`。`CombatantParameterSheet` 在统一遮罩内先渲染 `QuickCombatantControls`，再渲染 `CombatantDetails`，遮罩和完成按钮均调用 `onClose()`。

- [ ] **Step 4: 运行组件测试**

Run: `npm --prefix miniapp test -- --run tests/combatant-parameter-sheet.test.jsx tests/combatant-details.test.jsx`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add miniapp/src/components/CombatantStatGrid.jsx miniapp/src/components/CombatantParameterSheet.jsx miniapp/src/components/BattleWorkspace.jsx miniapp/tests/combatant-parameter-sheet.test.jsx
git commit -m "feat(miniapp): add compact combatant parameter grid"
```

### Task 2: 简化双方精灵与统一面板状态

**Files:**
- Modify: `miniapp/src/components/BattleWorkspace.jsx`
- Modify: `miniapp/src/components/CombatantCard.jsx`
- Modify: `miniapp/src/components/DirectionSwitch.jsx`
- Test: `miniapp/tests/spirit-picker.test.jsx`
- Test: `miniapp/tests/index-page.test.jsx`

**Interfaces:**
- Consumes: `openPickerSide`、`direction`、Task 1 参数面板。
- Produces: `activeLayer` 枚举值 `null | spirit-attacker | spirit-defender | parameter-attacker | parameter-defender | conditions | result`，以及整卡打开精灵选择的对战条。

- [ ] **Step 1: 写面板互斥和整卡更换失败测试**

```jsx
fireEvent.click(screen.getByRole("button", { name: "攻击方宠物摘要" }));
expect(screen.getByPlaceholderText("搜索攻击方宠物")).toBeInTheDocument();
fireEvent.click(screen.getByRole("button", { name: "防守方六维参数" }));
expect(screen.queryByPlaceholderText("搜索攻击方宠物")).not.toBeInTheDocument();
expect(screen.getByRole("dialog", { name: "防守方参数设置" })).toBeInTheDocument();
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm --prefix miniapp test -- --run tests/spirit-picker.test.jsx tests/index-page.test.jsx`

Expected: FAIL，当前组件仍使用多个展开状态。

- [ ] **Step 3: 实现统一展示状态**

在 `BattleWorkspace` 中用单一 `activeLayer` 控制精灵、参数、条件和结果；打开任何新层先替换旧值。`CombatantCard` 身份卡整卡触发精灵选择，移除卡内独立更换按钮和非必要收藏按钮占位；`DirectionSwitch` 只呈现交换图标并保留无障碍名称。

- [ ] **Step 4: 运行交互测试**

Run: `npm --prefix miniapp test -- --run tests/spirit-picker.test.jsx tests/index-page.test.jsx`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add miniapp/src/components/BattleWorkspace.jsx miniapp/src/components/CombatantCard.jsx miniapp/src/components/DirectionSwitch.jsx miniapp/tests/spirit-picker.test.jsx miniapp/tests/index-page.test.jsx
git commit -m "refactor(miniapp): simplify duel selection flow"
```

### Task 3: 技能与结果合并

**Files:**
- Create: `miniapp/src/components/SingleSkillResultRow.jsx`
- Modify: `miniapp/src/components/SkillSlots.jsx`
- Modify: `miniapp/src/components/SkillPicker.jsx`
- Modify: `miniapp/src/components/BattleWorkspace.jsx`
- Test: `miniapp/tests/skill-result-list.test.jsx`
- Test: `miniapp/tests/skill-slots.test.jsx`

**Interfaces:**
- Consumes: 当前方向 `activePanel`、`calculation.rows`、现有 `SkillPicker`。
- Produces: 单技能与四技能统一行语法；行主体调用 `onChange`，结果区调用 `onOpenResult(index)`。

- [ ] **Step 1: 写技能行双动作失败测试**

```jsx
fireEvent.click(screen.getByRole("button", { name: "更换技能 光球" }));
expect(screen.getByPlaceholderText("搜索技能")).toBeInTheDocument();
fireEvent.click(screen.getByRole("button", { name: "查看光球伤害 79 18.5% HP" }));
expect(onOpenResult).toHaveBeenCalledWith(0);
expect(screen.queryByPlaceholderText("搜索技能")).not.toBeInTheDocument();
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm --prefix miniapp test -- --run tests/skill-result-list.test.jsx tests/skill-slots.test.jsx`

Expected: FAIL，单技能尚无合并结果行。

- [ ] **Step 3: 实现当前方向技能列表**

手机只渲染 `activePanel`。技能行左侧使用 `ElementIcon`，中部显示名称、类型、威力、能量，右侧显示伤害和 HP 百分比。结果按钮调用 `event.stopPropagation()` 后选择该技能并打开详情。iPad 在媒体查询下恢复双方技能列和右侧结果栏。

- [ ] **Step 4: 运行技能测试**

Run: `npm --prefix miniapp test -- --run tests/skill-result-list.test.jsx tests/skill-slots.test.jsx tests/calculation.test.js`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add miniapp/src/components/SingleSkillResultRow.jsx miniapp/src/components/SkillSlots.jsx miniapp/src/components/SkillPicker.jsx miniapp/src/components/BattleWorkspace.jsx miniapp/tests/skill-result-list.test.jsx miniapp/tests/skill-slots.test.jsx
git commit -m "feat(miniapp): merge skill selection with damage results"
```

### Task 4: 条件摘要、目标 HP 与结果详情

**Files:**
- Modify: `miniapp/src/components/BattleConditionStrip.jsx`
- Modify: `miniapp/src/components/ResultBar.jsx`
- Modify: `miniapp/src/components/ResultSheet.jsx`
- Modify: `miniapp/src/components/BattleWorkspace.jsx`
- Test: `miniapp/tests/result-sheet.test.jsx`
- Test: `miniapp/tests/workspace-responsive.test.jsx`

**Interfaces:**
- Consumes: `calculation.defenderHp`、`calculation.defenderMaxHp`、`conditionSummary`。
- Produces: `BattleConditionStrip({ currentHp, maxHp, onCurrentHpChange, onOpen, summary })` 和按主结果、对比、条件、提醒、折叠公式排序的详情面板。

- [ ] **Step 1: 写目标 HP 和详情顺序失败测试**

```jsx
expect(screen.getByLabelText("目标当前生命")).toHaveValue(428);
fireEvent.input(screen.getByLabelText("目标当前生命"), { target: { value: "300" } });
expect(onCurrentHpChange).toHaveBeenCalledWith(300);
expect(screen.getByText("当前技能结果").compareDocumentPosition(screen.getByText("四技能对比"))).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm --prefix miniapp test -- --run tests/result-sheet.test.jsx tests/workspace-responsive.test.jsx`

Expected: FAIL，目标 HP 仍位于独立结果卡。

- [ ] **Step 3: 实现紧凑条件条和详情顺序**

把目标 HP 输入放入条件摘要；手机隐藏独立 `ResultBar`，iPad继续显示结果栏。`ResultSheet` 将公式审计放入默认折叠区，关闭和技能切换保持现有焦点恢复逻辑。

- [ ] **Step 4: 运行结果测试**

Run: `npm --prefix miniapp test -- --run tests/result-sheet.test.jsx tests/workspace-responsive.test.jsx tests/condition-summary.test.js`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add miniapp/src/components/BattleConditionStrip.jsx miniapp/src/components/ResultBar.jsx miniapp/src/components/ResultSheet.jsx miniapp/src/components/BattleWorkspace.jsx miniapp/tests/result-sheet.test.jsx miniapp/tests/workspace-responsive.test.jsx
git commit -m "feat(miniapp): compact conditions and result details"
```

### Task 5: 重写视觉样式与响应式布局

**Files:**
- Replace: `miniapp/src/pages/index/index.css`
- Create: `miniapp/src/pages/index/styles/base.css`
- Create: `miniapp/src/pages/index/styles/duel.css`
- Create: `miniapp/src/pages/index/styles/parameters.css`
- Create: `miniapp/src/pages/index/styles/skills.css`
- Create: `miniapp/src/pages/index/styles/overlays.css`
- Create: `miniapp/src/pages/index/styles/responsive.css`
- Modify: `miniapp/src/styles/tokens.css`
- Test: `miniapp/tests/portrait-css.test.js`

**Interfaces:**
- Consumes: Tasks 1–4 的组件 class 名。
- Produces: 暖灰、白面、攻黄、防蓝、结果红的统一视觉；手机双列和 iPad 三栏布局。

- [ ] **Step 1: 写 CSS 结构失败测试**

```js
expect(css).toContain('@import "./styles/duel.css"');
expect(css).toContain('@import "./styles/responsive.css"');
expect(responsiveCss).toContain("@media (min-width: 768px)");
expect(allCss).not.toMatch(/linear-gradient|radial-gradient|#7c3aed/i);
expect(allCss).not.toMatch(/writing-mode\s*:\s*vertical/);
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm --prefix miniapp test -- --run tests/portrait-css.test.js`

Expected: FAIL，当前仍是 5,850 行单文件样式。

- [ ] **Step 3: 实现分区样式**

`index.css` 只保留六个 `@import`。基础样式统一盒模型、字体和按钮；各模块文件只定义本职责选择器。320–430 px 使用双方 1:1 双列与 2×3 六维，768 px 以上切换 iPad 双列/三栏。所有图片 `object-fit: contain`，技能和精灵名称使用两行省略而不是缩小到不可读。

- [ ] **Step 4: 运行 CSS 和组件测试**

Run: `npm --prefix miniapp test -- --run tests/portrait-css.test.js tests/workspace-responsive.test.jsx tests/index-page.test.jsx`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add miniapp/src/pages/index/index.css miniapp/src/pages/index/styles miniapp/src/styles/tokens.css miniapp/tests/portrait-css.test.js
git commit -m "style(miniapp): apply reference-first responsive layout"
```

### Task 6: 浏览器与微信视觉回归

**Files:**
- Modify: `scripts/miniapp/verify-portrait-layout.mjs`
- Replace: `design-qa.md`
- Create: `artifacts/reference-first-ui-20260807/*.png`

**Interfaces:**
- Consumes: H5 预览、参考图 `image-1.jpg`、六个目标视口。
- Produces: 主屏、精灵搜索、参数面板、四技能、条件、结果详情和 iPad 截图证据。

- [ ] **Step 1: 启动独立 H5 预览**

Run: `npm --prefix miniapp run build:h5 -- --mode production --outputRoot preview-h5 && npx vite preview --outDir preview-h5 --host 127.0.0.1 --port 4176 --strictPort`

Expected: 预览服务可访问且不覆盖 `miniapp/dist` 微信产物。

- [ ] **Step 2: 自动检查关键布局**

Run: `node scripts/miniapp/verify-portrait-layout.mjs http://127.0.0.1:4176/#/pages/index/index`

Expected: 六个视口无横向溢出，触控目标、底部安全区、浮层关闭和图片尺寸断言通过。

- [ ] **Step 3: 捕获并逐张视觉检查**

同状态对照参考图，检查：双列对齐、六维格一致、名称不裁剪、真实图标完整、技能结果同一行、无大空白、手机/iPad密度合理。把 P0/P1/P2 写入 `design-qa.md`，修复后重新截图，直至 `final result: passed`。

- [ ] **Step 4: 微信开发者工具编译回读**

打开 `D:\codex\worktrees\rock-calculator-miniapp-v011\miniapp`，点击编译，检查手机和 iPad 模拟器主屏及一个浮层状态；记录控制台 0 error。

- [ ] **Step 5: 提交验证材料**

```bash
git add scripts/miniapp/verify-portrait-layout.mjs design-qa.md
git commit -m "test(miniapp): verify reference-first visual layout"
```

### Task 7: 全量回归、包体与交付

**Files:**
- Modify if required: `scripts/miniapp/minify-weapp-assets.mjs`
- Verify: `miniapp/dist/**`

**Interfaces:**
- Consumes: Tasks 1–6 的最终实现。
- Produces: 可直接导入微信开发者工具的 v0.1.1 生产产物。

- [ ] **Step 1: 全量小程序测试**

Run: `npm --prefix miniapp test -- --run`

Expected: 0 failed。

- [ ] **Step 2: 发布门禁测试**

Run: `npx vitest run tests/miniapp/release-config.test.js tests/miniapp/release-gate.test.js`

Expected: 0 failed。

- [ ] **Step 3: 微信生产构建**

Run: `npm run miniapp:build:prod`

Expected: 编译和发布门禁通过，主包不超过 2,097,152 字节。若超限，只在现有后处理脚本中加入 Terser 二次压缩，不删除数据。

- [ ] **Step 4: 最终证据审计**

Run: `git diff --check && node --check miniapp/dist/pages/index/index.js`

Expected: 无空白错误，产物语法有效；设计规格每条验收项均有测试、截图或构建证据。

- [ ] **Step 5: 提交最终修正并交付**

```bash
git add scripts/miniapp/minify-weapp-assets.mjs
git commit -m "build(miniapp): keep production package within limit"
```

向用户提供项目目录、测试数量、主包大小、视觉证据目录、微信开发者工具刷新步骤和剩余 P3（如有）。
