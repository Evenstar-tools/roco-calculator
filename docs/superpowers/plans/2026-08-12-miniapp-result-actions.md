# 小程序结果页触发工作台实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复结果页真机滚动和设置页超框，并把单/四技能与特性触发统一放进可取消、不中断伤害查看的结果二级页。

**Architecture:** 共享战斗激活接口增加单技能目标定位；小程序新增纯视图模型生成分类动作、新增结果触发面板渲染交互，`BattleWorkspace` 继续负责状态提交和安全撤销。现有伤害公式、结果行选择语义和主页面纯计算参数保持不变。

**Tech Stack:** React 18、Taro 4.2、Vitest、Testing Library、微信小程序原生 `ScrollView`

## Global Constraints

- 不修改伤害公式和赛季数据。
- 技能结果行只切换伤害详情，不能触发技能。
- 触发或取消后结果页保持打开，分类与滚动位置不重置。
- 布尔/选择状态可再次点击取消；累积动作仅在当前状态仍等于触发后状态时恢复触发前快照。
- 主页面保留手动威力、连击数和生命等计算参数，移除重复“应用技能”入口。
- 结果页与设置页在 320、375、390、430、768、834px 宽度不得横向超框。
- 最终验收必须包含真实微信开发者工具编译和手机/iPad 交互检查，H5 与单元测试不能替代。

---

### Task 1: 单技能战斗激活支持

**Files:**
- Modify: `src/state/battle-activation.js`
- Modify by sync: `miniapp/src/shared/state/battle-activation.js`
- Test: `tests/state/battle-activation.test.js`

**Interfaces:**
- Consumes: `applyBattleActivation({ calculation, side, skillIndex, skillMode, snapshot, state })`，其中 `skillMode` 为 `"single" | "four"`，默认 `"four"`。
- Produces: 单技能模式读取并更新 `state.sides[side].skills.single`；四技能行为保持兼容。

- [ ] **Step 1: 写单技能激活失败测试**

```js
const result = applyBattleActivation({
  calculation: { forward: { results: [{ hitCount: 1 }] } },
  side: "attacker",
  skillIndex: 0,
  skillMode: "single",
  snapshot,
  state,
});
expect(result.applied).toBe(true);
expect(result.state.directions.forward.overrides.attackLevelStage).toBe(9);
expect(result.state.sides.attacker.skills.single.context).toEqual(
  expect.objectContaining({ applyAttackBoost: true }),
);
```

- [ ] **Step 2: 运行专项测试并确认因仍读取四技能槽失败**

Run: `npm test -- tests/state/battle-activation.test.js`

- [ ] **Step 3: 用统一入口读写单技能或四技能上下文**

```js
function skillEntryForMode(state, side, skillMode, skillIndex) {
  return skillMode === "single"
    ? state.sides[side].skills.single
    : state.sides[side].skills.four[skillIndex];
}
```

- [ ] **Step 4: 运行共享领域测试、同步核心并检查漂移**

Run: `npm test -- tests/state/battle-activation.test.js`

Run: `npm run miniapp:sync-core && npm run test:core-drift`

- [ ] **Step 5: 提交共享激活接口**

Run: `git add src/state/battle-activation.js miniapp/src/shared/state/battle-activation.js tests/state/battle-activation.test.js && git commit -m "feat: support single skill battle activation"`

### Task 2: 结果动作分类与安全撤销

**Files:**
- Create: `miniapp/src/view-models/result-actions.js`
- Create: `miniapp/src/state/result-action-history.js`
- Create: `miniapp/tests/result-actions.test.js`
- Create: `miniapp/tests/result-action-history.test.js`

**Interfaces:**
- Produces: `createResultActions({ direction, snapshot, state, traitViews }) -> { status, defense, modifiers }`。
- Produces: `createResultActionRecord(actionKey, beforeState, afterState)` 与 `restoreResultAction(currentState, record)`。

- [ ] **Step 1: 写分类失败测试**

```js
const actions = createResultActions({ direction: "forward", snapshot, state, traitViews });
expect(actions.modifiers.map((item) => item.name)).toContain("蒸汽进行曲");
expect(actions.defense.map((item) => item.name)).toContain("羽翼庇护");
expect(actions.modifiers.some((item) => item.source === "特性")).toBe(true);
```

- [ ] **Step 2: 写安全撤销失败测试**

```js
expect(restoreResultAction(afterState, record)).toEqual({
  restored: true,
  state: beforeState,
});
expect(restoreResultAction(changedState, record).restored).toBe(false);
```

- [ ] **Step 3: 运行两个专项测试并确认函数缺失失败**

Run: `npm --prefix miniapp test -- --run tests/result-actions.test.js tests/result-action-history.test.js`

- [ ] **Step 4: 实现最小分类描述符和严格快照比对**

```js
return {
  key,
  category,
  controls,
  kind: "skill",
  mode,
  name: skill.name,
  side,
  slotIndex,
  source: "技能",
};
```

- [ ] **Step 5: 运行专项测试并提交**

Run: `npm --prefix miniapp test -- --run tests/result-actions.test.js tests/result-action-history.test.js`

Run: `git add miniapp/src/view-models/result-actions.js miniapp/src/state/result-action-history.js miniapp/tests/result-actions.test.js miniapp/tests/result-action-history.test.js && git commit -m "feat(miniapp): model result actions and safe undo"`

### Task 3: 结果触发面板与触发闭环

**Files:**
- Create: `miniapp/src/components/ResultActionPanel.jsx`
- Modify: `miniapp/src/components/ResultSheet.jsx`
- Modify: `miniapp/src/components/BattleWorkspace.jsx`
- Modify: `miniapp/src/components/SkillConditionEditor.jsx`
- Modify: `miniapp/tests/feature-parity.test.jsx`
- Create: `miniapp/tests/result-action-panel.test.jsx`

**Interfaces:**
- Consumes: `actions`、`feedback`、`onApplyAction(action)`、`onControlChange(action, control, value)`。
- Produces: 分类按钮、动作卡片、原位参数、触发/撤销反馈。

- [ ] **Step 1: 写分类切换和动作触发失败测试**

```jsx
fireEvent.click(screen.getByRole("button", { name: "增减" }));
fireEvent.click(screen.getByRole("button", { name: "触发蒸汽进行曲" }));
expect(onApplyAction).toHaveBeenCalledWith(
  expect.objectContaining({ kind: "skill", name: "蒸汽进行曲" }),
);
```

- [ ] **Step 2: 写集成失败测试，证明结果页保持打开且第二次点击撤销**

```jsx
fireEvent.click(screen.getByRole("button", { name: "展开伤害结果" }));
fireEvent.click(screen.getByRole("button", { name: "触发蒸汽进行曲" }));
expect(screen.getByRole("dialog", { name: "伤害结果" })).toBeInTheDocument();
fireEvent.click(screen.getByRole("button", { name: "撤销蒸汽进行曲" }));
expect(store.getState().directions.forward.overrides.attackLevelStage).toBe(0);
```

- [ ] **Step 3: 运行专项测试并确认缺少面板失败**

Run: `npm --prefix miniapp test -- --run tests/result-action-panel.test.jsx tests/feature-parity.test.jsx`

- [ ] **Step 4: 实现面板，复用 `ConditionField` 显示动态控件**

```jsx
<Button
  aria-label={`${action.undoable ? "撤销" : "触发"}${action.name}`}
  onClick={() => onApplyAction(action)}
>
  {action.undoable ? "取消触发" : "触发"}
</Button>
```

- [ ] **Step 5: 在 `BattleWorkspace` 编排技能、特性和安全撤销**

```js
const result = applyBattleActivation({
  calculation: { [direction]: { results: calculations[direction].rows } },
  side: action.side,
  skillIndex: action.slotIndex,
  skillMode: action.mode,
  snapshot,
  state: beforeState,
});
```

- [ ] **Step 6: 删除主页面重复应用入口，保留参数编辑**

`SkillConditionEditor` 仍显示手动威力、连击数和技能输入，但主页面不再传入 `onApply`。

- [ ] **Step 7: 运行专项测试和完整小程序测试并提交**

Run: `npm --prefix miniapp test -- --run tests/result-action-panel.test.jsx tests/feature-parity.test.jsx tests/result-sheet.test.jsx tests/trait-controls.test.jsx`

Run: `npm run miniapp:test`

Run: `git add miniapp/src/components/ResultActionPanel.jsx miniapp/src/components/ResultSheet.jsx miniapp/src/components/BattleWorkspace.jsx miniapp/src/components/SkillConditionEditor.jsx miniapp/tests/result-action-panel.test.jsx miniapp/tests/feature-parity.test.jsx && git commit -m "feat(miniapp): add result action workspace"`

### Task 4: 真机滚动与设置页边界修复

**Files:**
- Modify: `miniapp/src/components/ResultSheet.jsx`
- Modify: `miniapp/src/pages/index/styles/overlays.css`
- Modify: `miniapp/src/pages/index/styles/responsive.css`
- Modify: `miniapp/tests/result-sheet.test.jsx`
- Modify: `miniapp/tests/app-shell.test.jsx`
- Modify: `miniapp/tests/portrait-css.test.js`
- Modify: `scripts/miniapp/verify-result-layout.mjs`
- Modify: `scripts/miniapp/verify-portrait-layout.mjs`

**Interfaces:**
- Produces: 不带外层 `catchMove` 的结果遮罩、具有确定高度的滚动内容区、不会超框的设置行。

- [ ] **Step 1: 修改现有滚动契约测试，要求遮罩不拦截移动**

```js
expect(dialog.parentElement).not.toHaveAttribute("data-catch-move");
expect(dialog.querySelector("[data-scroll-y='true']")).not.toBeNull();
```

- [ ] **Step 2: 扩展真实布局脚本检查 320px 设置面板和结果滚动区**

`verify-portrait-layout.mjs` 在 320px 视口打开设置，断言设置行和右侧操作控件的 `right` 不超过对话框 `right`，并断言对话框 `scrollWidth <= clientWidth`。`verify-result-layout.mjs` 断言滚动区 `scrollHeight > clientHeight`，设置 `scrollTop` 后读回值大于零，并检查最后一项可以滚动到分享按钮上方。

- [ ] **Step 3: 运行相关测试并确认滚动契约红灯**

Run: `npm --prefix miniapp test -- --run tests/result-sheet.test.jsx tests/app-shell.test.jsx tests/portrait-css.test.js`

- [ ] **Step 4: 修复固定高度、触摸传播、安全区和两列设置布局**

```css
.result-sheet {
  height: min(92vh, 820px);
}
.result-sheet__scroll {
  height: 0;
  min-height: 0;
  flex: 1 1 auto;
}
.settings-sheet__row,
.settings-sheet__action-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
}
```

- [ ] **Step 5: 运行布局专项测试、H5 尺寸矩阵和提交**

Run: `npm --prefix miniapp test -- --run tests/result-sheet.test.jsx tests/app-shell.test.jsx tests/portrait-css.test.js`

Run: `npm --prefix miniapp run build:h5`

Run: `node scripts/miniapp/verify-result-layout.mjs http://127.0.0.1:4178/#/pages/index/index artifacts/2026-08-12-result-actions/h5-result`

Run: `node scripts/miniapp/verify-portrait-layout.mjs http://127.0.0.1:4178/#/pages/index/index artifacts/2026-08-12-result-actions/h5-matrix`

Run: `git add miniapp/src/components/ResultSheet.jsx miniapp/src/pages/index/styles/overlays.css miniapp/src/pages/index/styles/responsive.css miniapp/tests/result-sheet.test.jsx miniapp/tests/app-shell.test.jsx miniapp/tests/portrait-css.test.js scripts/miniapp/verify-result-layout.mjs scripts/miniapp/verify-portrait-layout.mjs && git commit -m "fix(miniapp): stabilize sheets on narrow devices"`

### Task 5: 生产构建与真实小程序回归

**Files:**
- Update: `docs/verification/miniapp-result-actions-2026-08-12.md`
- Create: `artifacts/2026-08-12-result-actions/` screenshots and interaction evidence

**Interfaces:**
- Produces: 自动化、生产包、微信开发者工具手机/iPad 截图及交互检查记录。

- [ ] **Step 1: 运行全量静态与自动化门禁**

Run: `git diff --check`

Run: `npm test`

Run: `npm run miniapp:test`

- [ ] **Step 2: 运行生产小程序构建**

Run: `npm run miniapp:build:prod`

- [ ] **Step 3: 在微信开发者工具重新编译并检查手机**

检查 320/375/390/430px：结果页上下滚动、三分类、技能触发、再次取消、特性触发、技能详情切换、设置页边界。

- [ ] **Step 4: 切换 iPad 尺寸并重复关键路径**

检查 768/834px：面板宽度、滚动、触发反馈、底部分享按钮和设置页右侧控件。

- [ ] **Step 5: 记录截图与剩余风险**

验证文档必须区分自动化通过、生产构建通过、真实微信运行通过；未验证项不得写成完成。
