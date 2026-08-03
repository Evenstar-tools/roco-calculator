# Beast Flower Bloodline Trait Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为兽花蕾“稀兽花宝”补齐 18 系互斥血脉选择、入场触发、确定性伤害修正、结果解释和配置记忆，并保证临时触发不会污染长期配置。

**Architecture:** 新增纯领域模块集中维护 18 系定义及解析结果，由既有特性控件提供“血脉类型 + 入场已触发”两个输入；计算器在基础技能威力解析后把血脉贡献投射到固定威力、分项能力等级、速度、连击和星陨结算中。长期的血脉类型沿用 `traitValues` 进入个人配置与配置库，临时触发使用 `scope: "battle"`，仅保留在当前状态与分享链接中。

**Tech Stack:** React 19、Vite、Vitest、Testing Library、Playwright、现有共享领域模块与微信小程序 shared-core 同步脚本。

## Global Constraints

- 只处理精灵特性“稀兽花宝”，不得把血脉技能石或其他精灵误识别为本功能。
- 18 系同时最多选择一个；未选择或未勾选时不产生任何数值效果。
- 火、冰、毒只记录状态层数，不追加本次伤害；草、水、幽、恶只显示结算摘要。
- 幻系血脉施加星陨 2 层，与手动星陨相加并限制到 99；幻系攻击不触发星陨伤害。
- 光/武/龙/虫只影响对应物理或魔法类别，不扩成双项；萌、机械才同时影响两项。
- 地、翼只修改描述明确声明连击的技能；段数下限为 1，继续遵守“单段取整后乘连击数”。
- `bloodlineType` 是稳定个人配置；`bloodlineActivated` 是战斗临时状态，不得进入个人配置、配置库或队伍预设。
- 正向和反向计算共享同一只精灵的血脉状态；切换精灵后必须清除临时触发。
- 不修改既有精灵、技能、队伍、收藏、伤害公式和安装包结构；本轮不打安装包。
- 当前工作树已有其他未提交改动；每次提交只暂存本任务列出的文件，不得覆盖或清理无关改动。

---

## Task 1: 建立 18 系血脉定义和纯解析器

**Files:**
- Create: `src/domain/beast-flower-bloodline.js`
- Create: `tests/domain/beast-flower-bloodline.test.js`

- [ ] **Step 1: 编写 18 系定义完整性失败测试**

```js
import {
  BEAST_FLOWER_BLOODLINES,
  resolveBeastFlowerBloodline,
} from "../../src/domain/beast-flower-bloodline.js";

it("提供互不重复的 18 种血脉", () => {
  expect(BEAST_FLOWER_BLOODLINES).toHaveLength(18);
  expect(new Set(BEAST_FLOWER_BLOODLINES.map(({ value }) => value)).size)
    .toBe(18);
});

it("未选择或未触发时不产生贡献", () => {
  expect(resolveBeastFlowerBloodline({ activated: true })).toMatchObject({
    active: false,
    fixedPowerAdd: 0,
    hitCountAdd: 0,
    targetStarfallStacksAdd: 0,
  });
  expect(resolveBeastFlowerBloodline({
    activated: false,
    bloodlineType: "normal",
  }).active).toBe(false);
});
```

- [ ] **Step 2: 运行定向测试确认 RED**

Run: `npm test -- tests/domain/beast-flower-bloodline.test.js`

Expected: FAIL，提示模块不存在。

- [ ] **Step 3: 实现常量、校验和统一零贡献结构**

模块导出：

```js
export const BEAST_FLOWER_TRAIT_NAME = "稀兽花宝";
export const BEAST_FLOWER_BLOODLINES = [
  { value: "normal", label: "普通", summary: "技能威力 +40" },
  { value: "grass", label: "草", summary: "回复 20% 生命" },
  { value: "fire", label: "火", summary: "对方灼烧 ×6" },
  { value: "water", label: "水", summary: "技能能耗 -2" },
  { value: "light", label: "光", summary: "魔攻能力等级 +8" },
  { value: "earth", label: "地", summary: "对方速度 -60 · 连击 -3" },
  { value: "ice", label: "冰", summary: "对方冻结 ×2" },
  { value: "dragon", label: "龙", summary: "对方魔防能力等级 -8" },
  { value: "electric", label: "电", summary: "速度 +100" },
  { value: "poison", label: "毒", summary: "对方中毒 ×2" },
  { value: "bug", label: "虫", summary: "对方物防能力等级 -8" },
  { value: "martial", label: "武", summary: "物攻能力等级 +8" },
  { value: "wing", label: "翼", summary: "连击 +3" },
  { value: "cute", label: "萌", summary: "对方双攻能力等级 -6" },
  { value: "ghost", label: "幽", summary: "对方能量 -2" },
  { value: "evil", label: "恶", summary: "吸血 +50%" },
  { value: "machine", label: "机械", summary: "双防能力等级 +6" },
  { value: "illusion", label: "幻", summary: "对方星陨 ×2" },
];

export function isBeastFlowerBloodline(value) {
  return BEAST_FLOWER_BLOODLINES.some((entry) => entry.value === value);
}

export function resolveBeastFlowerBloodline({
  activated = false,
  bloodlineType = null,
  ownerRole = "attacker",
  skill = null,
} = {}) {
  // 返回固定字段；未知值、未触发或无技能时保持 active:false。
}
```

统一返回结构必须包含：

```js
{
  active,
  attackLevelBonusByCategory: { physical: 0, magical: 0 },
  defenseLevelBonusByCategory: { physical: 0, magical: 0 },
  targetAttackLevelBonusByCategory: { physical: 0, magical: 0 },
  targetDefenseLevelBonusByCategory: { physical: 0, magical: 0 },
  ownerSpeedFlat: 0,
  targetSpeedFlat: 0,
  fixedPowerAdd: 0,
  hitCountAdd: 0,
  targetStarfallStacksAdd: 0,
  settlement: null,
}
```

- [ ] **Step 4: 补齐 18 系逐项测试**

覆盖固定威力、分类能力等级、速度、声明连击、星陨和只记录状态。地/翼分别对有、无声明连击的技能测试；幻系分别测试幻系与非幻系技能的结算摘要。

- [ ] **Step 5: 运行测试确认 GREEN**

Run: `npm test -- tests/domain/beast-flower-bloodline.test.js`

Expected: PASS。

- [ ] **Step 6: 提交本任务文件**

```text
git add src/domain/beast-flower-bloodline.js tests/domain/beast-flower-bloodline.test.js
git commit -m "feat: define Beast Flower bloodline effects"
```

---

## Task 2: 将“血脉类型 + 入场触发”接入特性控件

**Files:**
- Modify: `src/domain/trait-effects.js`
- Modify: `src/components/SingleSkillEditor.jsx`
- Modify: `src/components/FourSkillEditor.jsx`
- Modify: `src/styles.css`
- Modify: `tests/domain/trait-effects.test.js`
- Modify: `tests/ui/skill-editors.test.jsx`

- [ ] **Step 1: 编写特性输入失败测试**

断言“稀兽花宝”在攻击方和防御方都产生两个输入：

```js
expect(getTraitEffectInputs({ name: "稀兽花宝" }, "attacker"))
  .toEqual(expect.arrayContaining([
    expect.objectContaining({
      contextKey: "bloodlineType",
      scope: "direction",
      type: "choice",
    }),
    expect.objectContaining({
      contextKey: "bloodlineActivated",
      scope: "battle",
      type: "boolean",
    }),
  ]));
```

UI 断言下拉含 18 项，并可从“普通｜技能威力 +40”切换到“幻｜星陨 ×2”。

- [ ] **Step 2: 运行定向测试确认 RED**

Run: `npm test -- tests/domain/trait-effects.test.js tests/ui/skill-editors.test.jsx`

Expected: FAIL，现有 `TraitInputs` 不支持 choice，且规则未提供血脉字段。

- [ ] **Step 3: 为特性规则增加专用输入定义**

在 `getTraitEffectInputs()` 最前面识别 `trait.name === BEAST_FLOWER_TRAIT_NAME`，返回：

```js
normalizeTriggerControls([
  {
    contextKey: "bloodlineType",
    defaultValue: "",
    label: "血脉",
    options: BEAST_FLOWER_BLOODLINES.map(({ value, label, summary }) => ({
      value,
      label: `${label}｜${summary}`,
    })),
    scope: "direction",
    type: "choice",
  },
  {
    contextKey: "bloodlineActivated",
    defaultValue: false,
    label: "入场已触发",
    scope: "battle",
    type: "boolean",
  },
], { source: role === "defender" ? "defenderTrait" : "attackerTrait" });
```

`resolveTraitEffectRule()` 对此特性返回零乘区，真实血脉贡献由独立解析器负责，避免既有交互特性逻辑重复计算。

- [ ] **Step 4: 扩展 TraitInputs 渲染 choice**

在布尔与数字分支之间加入：

```jsx
input.type === "choice" ? (
  <label className="trait-choice" key={dynamicInputId(input)}>
    <span>{input.label}</span>
    <select
      aria-label={input.label}
      onChange={(event) => onChange?.(dynamicInputId(input), event.target.value)}
      value={dynamicInputValue(input, context) ?? ""}
    >
      <option value="">选择血脉</option>
      {input.options.map((option) => (
        <option key={option.value} value={option.value}>{option.label}</option>
      ))}
    </select>
  </label>
) : input.type === "boolean" ? (
  <label className="trait-condition" key={dynamicInputId(input)}>
    <input
      checked={Boolean(dynamicInputValue(input, context))}
      onChange={(event) =>
        onChange?.(dynamicInputId(input), event.target.checked)
      }
      type="checkbox"
    />
    <span>{input.label}</span>
  </label>
) : (
  <label className="trait-number" key={dynamicInputId(input)}>
    <span>{input.label}</span>
    <DraftNumberInput
      ariaLabel={input.label}
      max={input.max}
      min={input.min}
      onCommit={(value) => onChange?.(dynamicInputId(input), value)}
      value={dynamicInputValue(input, context)}
    />
  </label>
)
```

样式要求：控件横向紧凑排列；窄窗口允许换行；文字至少 12px；不扩大四技能卡片高度到遮挡相邻栏位。

- [ ] **Step 5: 运行定向测试确认 GREEN**

Run: `npm test -- tests/domain/trait-effects.test.js tests/ui/skill-editors.test.jsx`

Expected: PASS。

- [ ] **Step 6: 提交本任务文件**

```text
git add src/domain/trait-effects.js src/components/SingleSkillEditor.jsx src/components/FourSkillEditor.jsx src/styles.css tests/domain/trait-effects.test.js tests/ui/skill-editors.test.jsx
git commit -m "feat: add Beast Flower bloodline controls"
```

---

## Task 3: 把血脉贡献接入确定性计算管线

**Files:**
- Modify: `src/domain/trait-effects.js`
- Modify: `src/domain/calculate.js`
- Modify: `tests/domain/calculate.test.js`
- Modify: `tests/domain/trait-effects.test.js`

- [ ] **Step 1: 为各乘区编写失败测试**

至少建立以下回归用例，并使用固定面板值断言精确伤害：

- 普通：只增加固定威力 40，一次。
- 武/光：只分别作用于物理/魔法技能的攻击能力等级 +8。
- 虫/龙：只分别降低物防/魔防能力等级 8 层。
- 萌：当兽花蕾是防御方时，进攻方当前攻击类别 -6 层。
- 机械：当兽花蕾是防御方时，当前承伤防御类别 +6 层。
- 电/地：修正速度后再进入速度差动态威力和先手判断。
- 翼/地：有声明连击的技能变为 `base +3` / `max(1, base -3)`，单段技能保持 1。
- 幻：手动星陨 3 + 血脉 2 = 5；非幻系追加，幻系不追加。

- [ ] **Step 2: 运行定向测试确认 RED**

Run: `npm test -- tests/domain/trait-effects.test.js tests/domain/calculate.test.js`

Expected: FAIL，血脉输入尚未进入计算。

- [ ] **Step 3: 为 calculate 提供角色化血脉解析入口**

在 `trait-effects.js` 导出 `resolveBeastFlowerBloodlineTrait()`：先按名称定位“稀兽花宝”，再使用 `getTraitEffectInputs()` 和 `projectTriggerContext()` 读取当前角色的血脉选择与临时触发，最后调用纯解析器。

```js
export function resolveBeastFlowerBloodlineTrait({
  traits = [],
  role,
  context = {},
  skill,
}) {
  const trait = traits.find(({ name }) => name === BEAST_FLOWER_TRAIT_NAME);
  if (!trait) return resolveBeastFlowerBloodline({ skill });
  const controls = getTraitEffectInputs(trait, role);
  const projected = projectTriggerContext(context, controls);
  return resolveBeastFlowerBloodline({
    activated: projected.bloodlineActivated,
    bloodlineType: projected.bloodlineType,
    ownerRole: role,
    skill,
  });
}
```

该入口不返回既有特性乘区，也不修改 `resolveTraitMultipliers()`，从结构上避免同一效果既作为能力等级又作为倍率结算两次。

- [ ] **Step 4: 在 calculate 中按确定顺序应用一次**

顺序固定为：

```text
根据 direction context 分别解析攻击方和防御方血脉
面板速度 + 当前角色对应的血脉速度修正
技能规则威力 + 固定威力 + 印记固定威力 + 血脉固定威力
当前类别的能力等级 + 血脉分类能力等级
声明连击基础段数 + 既有段数增益 + 血脉段数增益
手动星陨层数 + 血脉星陨层数（上限 99）
单段伤害向下取整 × 最终段数 + 星陨追加伤害
```

不得将 `attackMultiplier` 与同一血脉的能力等级再次相乘；不得把分类能力等级写回面板基础值。

- [ ] **Step 5: 在公式步骤中加入实际生效的中文血脉项**

例如：

```js
{
  label: "普通血脉",
  before: powerBeforeBloodline,
  after: powerAfterBloodline,
  input: "+40 固定威力",
  source: "reviewed-trait:beast-flower-bloodline-v1",
}
```

纯记录类血脉只进入 settlements，不伪造威力或乘区步骤。

- [ ] **Step 6: 运行定向测试确认 GREEN**

Run: `npm test -- tests/domain/beast-flower-bloodline.test.js tests/domain/trait-effects.test.js tests/domain/calculate.test.js`

Expected: PASS，且既有连击取整测试仍通过。

- [ ] **Step 7: 提交本任务文件**

```text
git add src/domain/trait-effects.js src/domain/calculate.js tests/domain/trait-effects.test.js tests/domain/calculate.test.js
git commit -m "feat: calculate Beast Flower bloodline effects"
```

---

## Task 4: 保证长期配置、临时触发和正反方向状态边界

**Files:**
- Modify: `src/state/trait-values.js`
- Modify: `src/state/calculator-session.js`
- Modify: `src/state/reducer.js`
- Modify: `src/state/share.js`
- Modify: `tests/state/spirit-configs.test.js`
- Modify: `tests/state/share.test.js`
- Modify: `tests/ui/app-integration.test.jsx`

- [ ] **Step 1: 编写持久化边界失败测试**

断言：

1. 个人配置和配置库保留 `bloodlineType`。
2. `bloodlineActivated` 因 `scope: "battle"` 被排除。
3. 分享状态同时保留选择和当前触发。
4. 正向修改后反向计算读取同一只精灵的值。
5. 切换到其他精灵再切回时恢复类型但触发为 false。

- [ ] **Step 2: 运行定向测试确认 RED**

Run: `npm test -- tests/state/spirit-configs.test.js tests/state/share.test.js tests/ui/app-integration.test.jsx`

Expected: 至少分享或切换精灵场景 FAIL。

- [ ] **Step 3: 复用 scope 过滤，不新增血脉名称硬编码**

`trait-values.js` 和 `calculator-session.js` 继续通过 `control.scope !== "battle"` 保存稳定字段。若 choice 类型尚未被 `sanitizeTriggerValues()` 支持，补充对 options 白名单的校验：未知值返回默认空值，不静默替换成其他血脉。

- [ ] **Step 4: 修正方向镜像和精灵切换清理**

`updateMirroredTraitContext()` 继续按语义键同时更新正反向上下文；选择新精灵时仅 materialize 稳定 `bloodlineType`，不 materialize `bloodlineActivated`。分享编码器保留当前 direction context 中的 battle 字段，解码时按当前 controls 清理非法值。

- [ ] **Step 5: 运行定向测试确认 GREEN**

Run: `npm test -- tests/state/spirit-configs.test.js tests/state/share.test.js tests/ui/app-integration.test.jsx`

Expected: PASS。

- [ ] **Step 6: 提交本任务文件**

```text
git add src/state/trait-values.js src/state/calculator-session.js src/state/reducer.js src/state/share.js tests/state/spirit-configs.test.js tests/state/share.test.js tests/ui/app-integration.test.jsx
git commit -m "fix: persist Beast Flower bloodline safely"
```

---

## Task 5: 在结果栏和四技能结果中解释血脉结算

**Files:**
- Modify: `src/domain/calculator-view-model.js`
- Modify: `src/components/ResultRail.jsx`
- Modify: `src/styles.css`
- Modify: `tests/ui/result-rail.test.jsx`
- Modify: `tests/ui/calculator-sections.test.jsx`

- [ ] **Step 1: 编写结果展示失败测试**

断言主结果出现：

```text
普通血脉｜技能威力 +40
幻系血脉｜星陨 ×2 · 追加 38 伤害
幻系血脉｜星陨 ×2 · 幻系技能不触发
火系血脉｜灼烧 ×6 · 本次伤害不追加
```

四技能模式要按每个技能独立显示是否触发星陨、连击或分类能力效果；未触发时不显示空占位。

- [ ] **Step 2: 运行 UI 测试确认 RED**

Run: `npm test -- tests/ui/result-rail.test.jsx tests/ui/calculator-sections.test.jsx`

Expected: FAIL，结果栏没有血脉摘要。

- [ ] **Step 3: 将 settlement 映射为稳定视图模型**

`calculator-view-model.js` 保留每个结果的 `traitSettlements`，字段为：

```js
{
  traitId: "trait_04caae19a6519f30",
  bloodlineType: "illusion",
  side: "attacker",
  status: "applied" | "recorded" | "not-triggered",
  text: "幻系血脉｜星陨 ×2 · 追加 38 伤害",
}
```

不要复用 `markSettlements` 的 `markId` 假装血脉是印记。

- [ ] **Step 4: 渲染紧凑特性结算区**

`ResultRail` 在主伤害与技能列表之间增加 `aria-label="特性结算"` 的小区块。攻击方使用浅粉底和红色指示条，防御方使用浅蓝底和蓝色指示条；深色模式保持文字对比度。移动端最多两行并允许内容换行，不扩大固定结果条高度。

- [ ] **Step 5: 运行 UI 测试确认 GREEN**

Run: `npm test -- tests/ui/result-rail.test.jsx tests/ui/calculator-sections.test.jsx tests/ui/app-integration.test.jsx`

Expected: PASS。

- [ ] **Step 6: 提交本任务文件**

```text
git add src/domain/calculator-view-model.js src/components/ResultRail.jsx src/styles.css tests/ui/result-rail.test.jsx tests/ui/calculator-sections.test.jsx
git commit -m "feat: explain Beast Flower bloodline results"
```

---

## Task 6: 同步小程序共享核心并执行全量验收

**Files:**
- Modify: `scripts/miniapp/shared-source-manifest.mjs`
- Create (generated): `miniapp/src/shared/domain/beast-flower-bloodline.js`
- Modify (generated as required): `miniapp/src/shared/domain/trait-effects.js`
- Modify (generated as required): `miniapp/src/shared/domain/traits.js`
- Modify (generated as required): `miniapp/src/shared/domain/calculate.js`
- Modify (generated as required): `miniapp/src/shared/domain/calculator-view-model.js`
- Modify: `e2e/uiux-team-presets.spec.js`

- [ ] **Step 1: 把新领域文件加入共享源清单**

在 `scripts/miniapp/shared-source-manifest.mjs` 的 domain 文件列表加入：

```js
"domain/beast-flower-bloodline.js",
```

- [ ] **Step 2: 同步并检查 shared-core 漂移**

Run:

```text
npm run miniapp:sync-core
npm run test:core-drift
```

Expected: 两条命令 PASS；生成文件与 Web 源一致。

- [ ] **Step 3: 增加桌面主流程 E2E**

用稳定精灵 ID 选择兽花蕾，选择普通/翼/幻血脉并勾选触发，断言伤害即时变化、结果摘要出现、正反向共享状态、切换精灵后触发清除。选择器必须使用容器和 data 属性，禁止用全局重复文本定位。

- [ ] **Step 4: 运行完整验收门禁**

Run:

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
git diff --check
```

Expected: 全部退出码 0。若 `npm run miniapp:sync-core` 再次改动生成文件，重新运行 `npm run test:core-drift` 和 `git diff --check`。

- [ ] **Step 5: 人工验收关键视口**

在 `1920×945`、`1280×720`、`390×844` 验证：

- 血脉下拉 18 项完整可选，文本不截断到无法区分。
- 攻击方和防御方分别选择时不串值，切换方向结果一致。
- 单技能、四技能、精简版、具体版均无横向溢出和遮挡。
- 火/冰/毒无伪造伤害；幻系非幻技能追加、幻技能不追加。
- 连击变化后总伤害仍能整除最终段数。
- 重启后恢复血脉类型但不自动勾选入场触发。

- [ ] **Step 6: 提交共享文件和 E2E**

```text
git add scripts/miniapp/shared-source-manifest.mjs miniapp/src/shared/domain/beast-flower-bloodline.js miniapp/src/shared/domain/trait-effects.js miniapp/src/shared/domain/traits.js miniapp/src/shared/domain/calculate.js miniapp/src/shared/domain/calculator-view-model.js e2e/uiux-team-presets.spec.js
git commit -m "test: verify Beast Flower bloodline flow"
```

---

## Final Review Checklist

- [ ] 逐条对照 `docs/superpowers/specs/2026-08-03-beast-flower-bloodline-trait-design.md`，确认 18 系效果、保存边界、结果文案和异常规则均有测试。
- [ ] 搜索 `TODO|TBD|placeholder|先略|暂不实现`，本功能新增文件零命中。
- [ ] 搜索 `bloodlineType|bloodlineActivated`，确认前者仅稳定配置、后者仅战斗状态，未进入队伍预设。
- [ ] 检查新增对象字段在领域层、视图模型、Web UI 和 miniapp 共享副本类型/命名一致。
- [ ] 确认没有把火、冰、毒写入当前总伤害，也没有把草、水、幽、恶伪装成威力乘区。
- [ ] 确认没有运行桌面打包命令；用户明确要求前不生成新安装包。
