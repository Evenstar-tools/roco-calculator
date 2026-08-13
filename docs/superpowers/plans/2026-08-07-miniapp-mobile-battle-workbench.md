# Miniapp Mobile Battle Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把小程序 v0.1.1 重构为可上线的“移动对战工作台”，让手机竖屏和 iPad 用户都能快速完成精灵、性格、个体、技能、特性、印记、环境、当前生命与结果核查。

**Architecture:** 保留现有 Taro React 页面、共享计算核心、收藏配置、持久化和分享协议；在小程序适配层补齐计算视图与条件摘要，用手机单侧聚焦、iPad 双侧并排的响应式壳组织现有编辑器。所有选择器采用单一浮层模型，结果栏维护可编辑目标生命，详情面板直接消费共享引擎的公式、警告、特性和印记结算。

**Tech Stack:** Taro 4.2.1、React 18.3.1、Vitest 3.2.7、Testing Library、微信小程序与 H5 构建。

## Global Constraints

- 小程序版本保持 `v0.1.1`，不改变网页版本与共享计算协议。
- 手机验收视口为 375、390、430 CSS px；iPad 验收视口为 820×1180 与 1024×768。
- 正文不小于 14px，辅助信息不小于 12px，主要触控目标不小于 44×44px。
- 真实精灵图、属性图标和能力图标必须使用项目已有素材，不用文字符号、Emoji 或 CSS 图形替代。
- 精灵选择、技能选择、条件、结果、配置库同一时刻只允许一个主浮层；点击遮罩必须关闭。
- 保留未提交的用户改动；本计划不创建提交。

---

### Task 1: Calculation and condition view models

**Files:**
- Create: `miniapp/src/view-models/condition-summary.js`
- Modify: `miniapp/src/view-models/calculation.js`
- Modify: `src/domain/calculator-view-model.js`
- Modify: `miniapp/src/view-models/traits.js`
- Test: `miniapp/tests/calculation.test.js`
- Test: `miniapp/tests/condition-summary.test.js`
- Test: `miniapp/tests/trait-controls.test.jsx`

**Interfaces:**
- Consumes: `state.directions[direction]`、共享 `calculateMatchup` 结果、技能动态输入定义。
- Produces: `createCalculationView(...).defenderMaxHp`、`defenderHpPercent`、`traitResult` 与结算明细；`createConditionSummary({ state, direction, skill, traitViews })`。

- [ ] **Step 1: Write failing current-HP and settlement tests**

```js
state.directions.forward.currentHp = 100;
const view = createCalculationView(snapshot, state, "forward");
expect(view.defenderHp).toBe(100);
expect(view.selectedResult.remainingHp).toBe(Math.max(0, 100 - view.selectedResult.totalDamage));
expect(view.selectedResult.markSettlements).toEqual(expect.any(Array));
```

- [ ] **Step 2: Run the focused tests and confirm the expected failures**

Run: `npm test -- --run tests/calculation.test.js tests/condition-summary.test.js tests/trait-controls.test.jsx`

- [ ] **Step 3: Implement the minimal view-model behavior**

Implement clamped current HP, max HP and percent; retain shared engine result fields; pass carried skills to `getTraitAutomaticStack`; count only non-default skill inputs, trait controls, marks and battle modifiers.

- [ ] **Step 4: Re-run the focused tests**

Run: `npm test -- --run tests/calculation.test.js tests/condition-summary.test.js tests/trait-controls.test.jsx`

### Task 2: Interaction model and contextual inputs

**Files:**
- Create: `miniapp/src/components/BattleConditionStrip.jsx`
- Create: `miniapp/src/components/BattleEnvironmentEditor.jsx`
- Modify: `miniapp/src/components/BattleWorkspace.jsx`
- Modify: `miniapp/src/components/CombatantCard.jsx`
- Modify: `miniapp/src/components/SpiritPicker.jsx`
- Modify: `miniapp/src/components/DirectionSwitch.jsx`
- Test: `miniapp/tests/workspace-responsive.test.jsx`
- Test: `miniapp/tests/spirit-picker.test.jsx`

**Interfaces:**
- Consumes: `createConditionSummary` and direction updates.
- Produces: independent active-side selection, explicit pet-change trigger, mutually exclusive overlays, contextual skill inputs, and environment edits.

- [ ] **Step 1: Write failing interaction tests**

Test that tapping a combatant only changes calculation direction, “更换精灵” opens the picker, backdrop closes it, the condition count is not hardcoded, and current HP/weather/reduction/final multiplier dispatch direction updates.

- [ ] **Step 2: Run the focused interaction tests and confirm failures**

Run: `npm test -- --run tests/workspace-responsive.test.jsx tests/spirit-picker.test.jsx`

- [ ] **Step 3: Implement explicit controls and single-overlay behavior**

Render a compact duel header, a real swap-icon button, phone active-side configuration, iPad paired configuration, inline active-skill conditions and a full condition sheet for secondary values.

- [ ] **Step 4: Re-run focused interaction tests**

Run: `npm test -- --run tests/workspace-responsive.test.jsx tests/spirit-picker.test.jsx`

### Task 3: Result dock and audit detail

**Files:**
- Modify: `miniapp/src/components/ResultBar.jsx`
- Modify: `miniapp/src/components/ResultSheet.jsx`
- Modify: `miniapp/src/components/SkillResultRows.jsx`
- Test: `miniapp/tests/result-sheet.test.jsx`

**Interfaces:**
- Consumes: extended calculation view and `onCurrentHpChange`.
- Produces: editable current HP, damage/remaining-life visualization, four-skill comparison, trait/mark settlements, warnings and formula audit.

- [ ] **Step 1: Write failing result behavior tests**

Assert editable target HP, lethal state, four-skill selection, settlement headings, warning text and formula-step output.

- [ ] **Step 2: Run the focused result tests and confirm failures**

Run: `npm test -- --run tests/result-sheet.test.jsx`

- [ ] **Step 3: Implement the compact dock and result detail hierarchy**

Keep the main result visible on phone, use a desktop-like rail at 1024px, and group audit information below the primary metric without nested decorative cards.

- [ ] **Step 4: Re-run focused result tests**

Run: `npm test -- --run tests/result-sheet.test.jsx`

### Task 4: Responsive visual system and release verification

**Files:**
- Modify: `miniapp/src/styles/tokens.css`
- Modify: `miniapp/src/pages/index/index.css`
- Modify: `scripts/miniapp/verify-portrait-layout.mjs`
- Modify: `miniapp/tests/portrait-css.test.js`
- Modify: `miniapp/tests/workspace-responsive.test.jsx`
- Modify: `design-qa.md`

**Interfaces:**
- Consumes: all workbench components.
- Produces: release-ready phone/iPad layouts and visual evidence.

- [ ] **Step 1: Add failing CSS contract assertions**

Assert minimum type sizes, 44px control dimensions, phone single-panel visibility, iPad two-column grid, fixed picker backdrop and non-clipping images.

- [ ] **Step 2: Run CSS and workspace tests and confirm failures**

Run: `npm test -- --run tests/portrait-css.test.js tests/workspace-responsive.test.jsx`

- [ ] **Step 3: Replace accumulated overrides with the workbench layout tokens**

Use restrained neutral surfaces, red/blue only for attacker/defender semantics, green only for selected IV/condition state, consistent 8px radii and one elevation level for overlays.

- [ ] **Step 4: Run all automated verification**

Run: `npm test -- --run`

Run from repository root: `npm test -- --run tests/miniapp/release-config.test.js tests/miniapp/release-gate.test.js`

Run: `npm run build:h5`

Run: `npm run build:weapp`

- [ ] **Step 5: Run browser interaction and visual QA**

At 375/390/430 widths test pet search, direction selection, side swap, nature/IV selection, single/four skill search, dynamic condition edit, condition-sheet close, current-HP edit and result detail. Repeat the core path at 820×1180 and 1024×768; compare same-state captures with the selected mobile reference and desktop/iPad information-density reference, then record iterations in `design-qa.md` until `final result: passed`.
