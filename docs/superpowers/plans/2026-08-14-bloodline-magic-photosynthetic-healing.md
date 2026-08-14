# 血脉魔法与光合治愈实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在高级选项加入进攻方血脉魔法，并让光合治愈以独立结果和技能组合结果两种方式接入小丑“戏耍”真伤。

**Architecture:** 新建纯领域模块维护血脉魔法定义和回复量；现有小丑回复结算接受明确的外部回复来源。方向上下文保存选择与触发状态，计算结果新增 `bloodlineResult`，视图模型和结果栏用独立的 `bloodline` 伤害来源完成切换。

**Tech Stack:** React 19、Vitest、Testing Library、Vite、Electron。

## Global Constraints

- 版本保持 `1.5.6`，不升级版本号。
- 光合治愈只回复进攻方最大生命的 `50%`，不提供能量。
- 只有“戏耍”把实际回复转为真实伤害；溢出治疗不计伤害。
- 其他血脉魔法只占位，不改变伤害。
- 不修改技能数据库、不加入运行时依赖、不写入精灵记忆或队伍预设。
- 正反攻击方向分别保存状态；旧配置缺少字段时兼容默认值。

---

### Task 1: 血脉魔法定义与回复来源

**Files:**
- Create: `src/domain/bloodline-magic.js`
- Create: `tests/domain/bloodline-magic.test.js`

**Interfaces:**
- Produces: `BLOODLINE_MAGIC_OPTIONS`
- Produces: `normalizeBloodlineMagicContext(context)`
- Produces: `resolveBloodlineMagicHealing({ context, maximumHp })`

- [ ] **Step 1: 写失败测试**

```js
test("光合治愈回复最大生命50%且不提供能量", () => {
  expect(resolveBloodlineMagicHealing({
    context: { bloodlineMagicId: "photosynthetic-healing", bloodlineMagicTriggered: true },
    maximumHp: 401,
  })).toMatchObject({ active: true, healing: 201, energy: 0 });
});

test("未触发和占位血脉魔法不产生回复", () => {
  expect(resolveBloodlineMagicHealing({
    context: { bloodlineMagicId: "photosynthetic-healing", bloodlineMagicTriggered: false },
    maximumHp: 400,
  }).healing).toBe(0);
  expect(resolveBloodlineMagicHealing({
    context: { bloodlineMagicId: "throttling", bloodlineMagicTriggered: true },
    maximumHp: 400,
  }).healing).toBe(0);
});
```

- [ ] **Step 2: 验证测试因缺少模块失败**

Run: `npx vitest run tests/domain/bloodline-magic.test.js`
Expected: FAIL，提示模块不存在。

- [ ] **Step 3: 实现最小领域模块**

```js
export const BLOODLINE_MAGIC_OPTIONS = [
  { id: "none", name: "无", implemented: true },
  { id: "photosynthetic-healing", name: "光合治愈", implemented: true },
  { id: "throttling", name: "节流术", implemented: false },
  { id: "evolution-power", name: "进化之力", implemented: false },
  { id: "enhancement", name: "强化术", implemented: false },
  { id: "flame-burst", name: "闪焰爆发", implemented: false },
];

export function resolveBloodlineMagicHealing({ context = {}, maximumHp = 0 }) {
  const active = context.bloodlineMagicTriggered === true &&
    context.bloodlineMagicId === "photosynthetic-healing";
  return {
    active,
    energy: 0,
    healing: active ? Math.round(Math.max(0, Number(maximumHp) || 0) * 0.5) : 0,
    sourceLabel: active ? "光合治愈" : null,
  };
}
```

- [ ] **Step 4: 验证领域测试通过**

Run: `npx vitest run tests/domain/bloodline-magic.test.js`
Expected: PASS。

### Task 2: 小丑回复结算与独立血脉结果

**Files:**
- Modify: `src/domain/clown-trick.js`
- Modify: `src/domain/calculate.js`
- Modify: `tests/domain/clown-trick.test.js`
- Modify: `tests/domain/calculate.test.js`

**Interfaces:**
- `resolveSkillHealing` 新增 `externalHealingSources = []`。
- `resolveClownTrickDamage` 新增 `externalHealingSources = []`。
- 每个方向计算结果新增 `bloodlineResult`，不存在时为 `null`。

- [ ] **Step 1: 写失败测试，锁定统一截断**

```js
test("光合治愈与吸血合并后只按缺失生命截断一次", () => {
  const result = resolveClownTrickDamage({
    attackerTraits: clownTrait,
    attackerCurrentHp: 300,
    attackerMaximumHp: 400,
    mainDamage: 80,
    persistentLifestealPercent: 100,
    skill: { name: "普通攻击", description: "造成物伤。" },
    externalHealingSources: [{ label: "光合治愈", amount: 200 }],
  });
  expect(result).toMatchObject({ requestedHealing: 280, actualHealing: 100, damage: 100 });
  expect(result.settlement.text).toContain("吸血 80 + 光合治愈 200");
});
```

- [ ] **Step 2: 写失败测试，锁定独立与组合结果**

```js
expect(direction.bloodlineResult).toMatchObject({
  skillName: "戏耍·光合治愈",
  totalDamage: 100,
  typeLabel: "无·血脉",
});
expect(direction.results[0].totalDamage)
  .toBe(direction.results[0].mainDamage + direction.results[0].traitDamage);
```

- [ ] **Step 3: 运行定向测试并确认预期失败**

Run: `npx vitest run tests/domain/clown-trick.test.js tests/domain/calculate.test.js`
Expected: FAIL，缺少外部回复与 `bloodlineResult`。

- [ ] **Step 4: 实现外部回复来源**

在 `resolveSkillHealing` 中清理并求和 `externalHealingSources`，返回 `healingSources`；在 `resolveClownTrickDamage` 中使用统一的 `actualHealing = min(missingHp, requestedHealing)`，结算文案从来源数组生成，禁止逐来源分别截断。

- [ ] **Step 5: 实现独立血脉结果和技能组合结果**

在方向计算开始处解析血脉回复。组合技能调用小丑结算时传入光合治愈来源；独立结果只传光合治愈来源、`mainDamage: 0` 且不传技能吸血。仅在具有“戏耍”、选择光合治愈并勾选使用时创建 `bloodlineResult`。

- [ ] **Step 6: 验证定向测试通过**

Run: `npx vitest run tests/domain/bloodline-magic.test.js tests/domain/clown-trick.test.js tests/domain/calculate.test.js`
Expected: PASS。

### Task 3: 方向状态、高级选项和分享兼容

**Files:**
- Modify: `src/components/AdvancedOptions.jsx`
- Modify: `src/App.jsx`
- Modify: `src/styles.css`
- Modify: `tests/ui/skill-editors.test.jsx`
- Modify: `tests/state/share.test.js`

**Interfaces:**
- `AdvancedOptions` 新增 `bloodlineMagicId`、`bloodlineMagicTriggered`、`onBloodlineMagicChange`、`onBloodlineMagicTriggeredChange`。
- 状态写入当前 `direction.context`。

- [ ] **Step 1: 写高级选项失败测试**

测试下拉框包含六个选项、“无”时勾选框禁用、光合治愈显示 50% 说明、占位项显示“不影响伤害”。

- [ ] **Step 2: 写方向与分享失败测试**

正向选择光合治愈后切换反向应保持反向默认值；分享序列化往返后保留两个上下文字段；旧分享缺失字段仍可导入。

- [ ] **Step 3: 运行测试确认失败**

Run: `npx vitest run tests/ui/skill-editors.test.jsx tests/state/share.test.js`
Expected: FAIL，缺少血脉魔法控件和状态。

- [ ] **Step 4: 实现高级选项控件与状态派发**

使用 `BLOODLINE_MAGIC_OPTIONS` 渲染下拉框。选为“无”时同时清除触发；选择占位项可勾选，但只显示占位说明。通过 `updateDirection({ context: ... })` 合并到当前方向。

- [ ] **Step 5: 补充紧凑与响应式样式**

复用 `.field-group`、`.weather-toggle` 控件高度和颜色；说明文字允许两行，移动端点击区不低于 44px。

- [ ] **Step 6: 验证状态与界面测试通过**

Run: `npx vitest run tests/ui/skill-editors.test.jsx tests/state/share.test.js`
Expected: PASS。

### Task 4: 结果选择与展示

**Files:**
- Modify: `src/domain/calculator-view-model.js`
- Modify: `src/components/ResultRail.jsx`
- Modify: `src/App.jsx`
- Modify: `src/state/share.js`
- Modify: `tests/ui/result-rail.test.jsx`
- Modify: `tests/domain/calculator-view-model.test.js`

**Interfaces:**
- `selectedDamageSource` 支持 `skill | trait | bloodline`。
- 视图模型新增 `bloodlineResult: { id, name, damage, hpPercent, selected } | null`。
- `ResultRail` 新增 `onBloodlineResultFocus`。

- [ ] **Step 1: 写独立结果失败测试**

```jsx
expect(screen.getByRole("button", { name: /戏耍·光合治愈.*150伤害/ }))
  .toBeVisible();
```

点击独立项后断言主标题为“戏耍·光合治愈”，总伤害只包含血脉真伤；点击普通技能后断言恢复组合结果并显示拆分备注。

- [ ] **Step 2: 运行结果测试确认失败**

Run: `npx vitest run tests/ui/result-rail.test.jsx tests/domain/calculator-view-model.test.js`
Expected: FAIL，缺少 bloodline 来源。

- [ ] **Step 3: 扩展视图模型与选择状态**

当 `selectedDamageSource === "bloodline"` 且有结果时选择 `bloodlineResult`；否则安全回退到技能。血脉结果显示在四个技能结果之前，不占技能编号。

- [ ] **Step 4: 实现可点击结果行与备注**

结果行使用真实 `button`，保留键盘焦点。组合技能的 `traitSettlements` 和公式明细显示“技能伤害 + 戏耍真伤”及回复来源；独立结果显示“无·血脉”。

- [ ] **Step 5: 验证结果测试通过**

Run: `npx vitest run tests/ui/result-rail.test.jsx tests/domain/calculator-view-model.test.js`
Expected: PASS。

### Task 5: 回归、版本记录和 v1.5.6 交付

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `src/data/user-release-notes.js`
- Generated: `release/洛克计算器-1.5.6.exe`

**Interfaces:**
- 不新增公共运行接口。

- [ ] **Step 1: 补充 v1.5.6 用户更新记录**

记录高级选项“血脉魔法”、光合治愈独立结果、技能组合结果和占位项边界；不重复创建 v1.5.6 标题。

- [ ] **Step 2: 执行定向和全量测试**

Run:

```text
npm run data:validate
npm test
npm run acceptance:verify
npm run e2e
npm run build
git diff --check
```

Expected: 全部退出码 0。

- [ ] **Step 3: 打包并核验桌面安装包**

Run: `npm run desktop:pack`

核验安装包文件名、版本属性、SHA256、离线资源和旧品牌扫描；版本保持 `1.5.6`。

- [ ] **Step 4: 提交与推送 GitHub**

只提交本功能、设计/计划和更新记录，推送当前分支并核对远端提交。

- [ ] **Step 5: 发给飞书联系人“晚星”并回读消息**

上传安装包，发送版本号、主要改动、SHA256 和安装包；回读真实消息，确认收件人、中文、附件名和版本均正确。
