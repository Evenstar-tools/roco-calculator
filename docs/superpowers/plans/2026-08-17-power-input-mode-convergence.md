# 威力输入与显示口径收口 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 v1.5.7 内统一单技能、四技能的威力显示与手动输入语义，允许用户选择“实际威力”或“面板威力”口径，彻底消除动态威力重复叠加、空值无法恢复自动、同一输入含义不一致和重复输入区。

**Architecture:** 使用一个全局“威力口径”设置同时决定技能栏展示口径和下一次手动输入的语义；每个手动覆盖值自身携带口径，切换设置只改变展示与后续编辑方式，不会静默重解释旧值或改变伤害。计算域明确拆成“自动技能威力 → 实际威力 → 面板威力 → 伤害”四段，单技能和四技能共用同一覆盖解析器。

**Tech Stack:** React 19、Vite、Vitest、Playwright、Electron

## Global Constraints

- 版本保持 `1.5.7`，不创建 `1.5.8`，更新日志追加到 v1.5.7。
- 不改变未手动覆盖时的既有技能规则、特性、印记、天气、克制、连击和伤害公式。
- 不复用“基础威力”作为新输入口径；旧配置中的基础威力覆盖仅保留兼容读取。
- 不让“显示设置”切换本身改变伤害结果。
- 不把显示偏好写入分享链接、队伍或配置库；手动威力覆盖仍属于当前计算状态，并保留分享兼容。
- 不全局改变 `DraftNumberInput` 的既有行为，避免影响特性层数、生命、能量等其他数字输入。
- 保留当前工作区中与本计划无关的既有改动，不顺手重构其他编辑器。

---

## 一、先锁定统一术语与计算边界

### 统一定义

```text
自动技能威力：技能库基础威力经过技能自身规则解算后的值。

实际威力：自动技能威力再合并固定威力、特性、印记、状态及同乘区威力加成后的值；
          尚未计算本系、克制、天气、攻防能力等级和其他面板乘区。

面板威力：实际威力继续计算本系、克制、天气、攻防能力等级和其他面板乘区，
          按游戏规则取整后的界面显示值。

伤害：面板威力进入攻击、防御、减伤、最终倍率和连击结算后的结果。
```

### 两种手动输入语义

```text
输入实际威力：用户给出的值直接替换“实际威力”；
              不再重复叠加技能动态威力、固定威力和威力百分比；
              仍继续计算本系、克制、天气、能力等级和其他面板乘区。

输入面板威力：用户给出的值直接替换“面板威力”；
              不再重复计算技能威力规则、本系、克制、天气、能力等级和其他面板乘区；
              仍继续计算攻防数值、减伤、最终倍率和连击。
```

### 兼容字段与新字段

新增统一覆盖结构：

```js
powerOverride: {
  mode: "actual" | "panel",
  value: number,
}
```

计算结果继续保留旧字段，同时增加明确别名：

```js
{
  actualPower,       // 新明确字段
  panelPower,        // 新明确字段
  powerSource,       // "automatic" | "manual-actual" | "manual-panel" | "legacy-base"
  skillPower,        // 兼容别名，等于 actualPower
  effectivePower,    // 兼容别名，等于 panelPower
}
```

### 任务 1：为术语和覆盖优先级建立失败测试

**Files:**
- Modify: `tests/domain/calculate.test.js`
- Modify: `tests/domain/skill-rules.test.js`

- [ ] 增加自动计算基线：动态技能在无覆盖时仍按原规则得到实际威力和面板威力。
- [ ] 增加“实际威力覆盖”测试：动态技能输入 `180` 后，动态规则、固定加成和威力百分比不得再次叠加；本系、克制、天气、能力等级仍继续计算。
- [ ] 增加“面板威力覆盖”测试：输入 `281` 后直接以 `281` 进入伤害公式，本系、克制、天气和能力等级不得再次计算。
- [ ] 增加小数测试：实际威力允许 `87.5` 并保持到伤害分子取整阶段；面板威力只接受整数。
- [ ] 增加非威力效果保留测试：覆盖威力后，技能自带连击、最终伤害倍率、类别/属性变化和非威力状态仍生效。
- [ ] 增加优先级测试：新 `powerOverride` 优先于旧 `basePower` / `basePowerOverride` / `displayedPower`；没有新字段时旧分享结果保持不变。
- [ ] 增加面板输入不重复本系的回归测试，覆盖当前单技能 `displayed` 分支仍会再次乘本系的风险。

**验证：** 只运行目标测试时，新断言因缺少统一覆盖模型而失败，旧基线继续通过。

---

## 二、统一计算域，不再由编辑器猜测威力含义

### 任务 2：新增威力覆盖解析器

**Files:**
- Create: `src/domain/power-override.js`
- Create: `tests/domain/power-override.test.js`
- Modify: `src/domain/calculate.js`
- Modify: `src/domain/skill-rules.js`

新增纯函数：

```js
resolvePowerOverride({
  current,
  legacyBasePower,
  legacyDisplayedPower,
  legacyPowerMode,
})
```

返回：

```js
{
  mode: "automatic" | "actual" | "panel" | "legacy-base",
  value: number | null,
  source: string,
}
```

- [ ] 始终先运行技能规则，以保留连击、最终倍率、属性/类别变化和必需条件信息。
- [ ] 自动模式继续使用现有“技能规则 → 固定加成 → 威力百分比加算”链路。
- [ ] `actual` 覆盖在固定威力与百分比威力结算后替换实际威力，不再叠加任何威力类增益。
- [ ] `panel` 覆盖在本系、克制、天气、能力等级和其他乘区结算后替换面板威力；不得再次乘本系。
- [ ] 威力覆盖只跳过威力相关项，不得粗暴移除攻击方全部特性；攻击/防御能力等级、速度、减伤、最终倍率等非威力效果仍参与正确阶段。
- [ ] 统一返回 `actualPower`、`panelPower`、`powerSource`，旧字段只作为兼容别名。
- [ ] 公式步骤根据来源生成：自动模式显示完整链路；实际覆盖从“手动实际威力”开始；面板覆盖只显示“手动面板威力”后续伤害步骤。
- [ ] 删除单技能专用 `usesDisplayedPower` 的分叉语义，改为统一覆盖解析器，避免单/四技能走不同公式。

**验证：** `npm test -- --run tests/domain/power-override.test.js tests/domain/calculate.test.js tests/domain/skill-rules.test.js`

---

## 三、状态兼容：切换口径不重解释旧值

### 任务 3：升级显示设置与计算状态

**Files:**
- Modify: `src/state/display-settings.js`
- Modify: `src/state/share.js`
- Modify: `src/state/defaults.js`
- Modify: `src/state/calculator-session.js`
- Modify: `src/state/reducer.js`
- Modify: `tests/state/display-settings.test.js`
- Modify: `tests/state/share.test.js`

设置值统一为：

```js
"actual" | "panel"
```

兼容规则：

```text
旧设置 skill     → actual
旧设置 panel     → panel
非法或缺失值     → actual
旧单技能 base    → 保持 legacy-base 计算结果
旧单技能 displayed → 转为 panel 覆盖
旧四技能 basePower → 保持 legacy-base 计算结果
```

- [ ] 继续读取现有 `rock-calculator.settings.power-display.v1`，不因版本内调整丢失用户偏好。
- [ ] 写入时使用 `actual` / `panel`，读取旧 `skill` 时归一为 `actual`。
- [ ] 分享状态允许可选 `powerOverride`，严格校验 `mode`、有限数值和范围。
- [ ] 旧字段继续解码；新分享只写新结构，不再新增基础威力覆盖。
- [ ] 切换全局口径时不修改已有覆盖对象；编辑当前数字时才以当前口径替换覆盖对象。
- [ ] 更换技能时清除该技能槽的战斗临时威力覆盖，不继承到新技能；精灵记忆、收藏和四技能本体不受影响。

**验证：** 旧分享、旧本地设置、新分享往返和非法值回退测试全部通过。

---

## 四、收口数字输入：一个字段、一个含义、可恢复自动

### 任务 4：新增威力专用草稿输入

**Files:**
- Create: `src/components/PowerDraftInput.jsx`
- Create: `tests/ui/power-draft-input.test.jsx`
- Modify: `src/components/SingleSkillEditor.jsx`
- Modify: `src/components/FourSkillEditor.jsx`

`PowerDraftInput` 行为：

- [ ] 输入过程中只更新本地草稿，不逐位写入计算状态。
- [ ] `Enter` 或失焦时提交合法值；上下方向键立即按步长提交。
- [ ] `Escape` 放弃草稿并恢复当前计算值。
- [ ] 清空后 `Enter` 或失焦等同“恢复自动”，真正删除覆盖，不回填旧手动值。
- [ ] “实际威力”允许 `0–9999` 的有限数值和最多 6 位小数；“面板威力”只允许 `0–9999` 的整数。
- [ ] 非法值不提交、不静默截断，字段下方显示“请输入 0–9999 的实际威力”或“面板威力只能填整数”。
- [ ] 存在手动覆盖时显示小型恢复按钮，按钮文本/无障碍名称为“恢复自动威力”。
- [ ] 不改变通用 `DraftNumberInput`，避免特性层数等输入产生回归。

**验证：** 覆盖“输入 1 → 18 → 180 只提交一次”“空值恢复自动”“非法值不改伤害”“键盘恢复”的组件测试。

### 任务 5：单技能只保留一个威力输入区

**Files:**
- Modify: `src/components/SingleSkillEditor.jsx`
- Modify: `tests/ui/skill-editors.test.jsx`
- Modify: `tests/ui/app-integration.test.jsx`

- [ ] 删除技能效果卡中的“基础”输入与“手动调整”内第二个重复威力输入二选一并存状态；主区域只保留一个当前口径威力字段。
- [ ] 当前口径为实际时，标签为“实际威力”；当前口径为面板时，标签为“面板威力”。
- [ ] 自动状态显示当前计算值，但不因此生成覆盖；用户真正修改后才显示“手动”状态。
- [ ] 动态威力说明继续显示，例如“速度差 111 → 实际威力 190”，但输入值不得回写成基础威力。
- [ ] 连击输入继续独立存在，不与威力字段共享草稿状态。
- [ ] 实际威力覆盖时，条件卡仍可显示；对威力已被覆盖的条件增加一句短提示“威力已手动覆盖”，非威力效果继续生效。

**验证：** 页面中只有一个威力 spinbutton；切换口径、输入、恢复自动和动态技能均符合定义。

### 任务 6：四技能四行使用相同输入口径

**Files:**
- Modify: `src/components/FourSkillEditor.jsx`
- Modify: `src/App.jsx`
- Modify: `tests/ui/skill-editors.test.jsx`
- Modify: `tests/ui/app-integration.test.jsx`

- [ ] 列头随设置显示“实际威力”或“面板威力”，不再使用含糊的“威力/面板”。
- [ ] 两种模式都允许编辑；面板模式不再是只读输出，而是写入带 `mode: "panel"` 的覆盖。
- [ ] 输入框显示当前口径的计算结果；自动值只展示，不写入状态。
- [ ] 用户编辑后只保存 `{ mode, value }`，不得把 `result.skillPower` 或 `result.panelPower` 写回 `basePower`。
- [ ] 动态技能输入后不重复叠加；清空后立刻恢复当前条件下的自动威力。
- [ ] 攻击方和防御方四个槽位行为一致，槽位间覆盖互不串联。
- [ ] 技能行的小字显示来源：`自动`、`手动实际` 或 `手动面板`；不新增占空间的大段说明。

**验证：** 覆盖攻击方/防御方、四个槽、动态技能、切换后不改伤害和重新打开仍正确的集成测试。

---

## 五、显示设置和外显文案统一

### 任务 7：把“技能栏威力”改成统一“威力口径”

**Files:**
- Modify: `src/components/DisplaySettingsDialog.jsx`
- Modify: `src/components/WorkspaceOverlays.jsx`
- Modify: `src/styles.css`
- Modify: `tests/ui/workspace-overlays.test.jsx`

显示设置使用以下固定文案：

```text
技能威力口径
决定技能栏显示和手动输入代表的数值；切换本身不改变伤害。

[实际威力] [面板威力]

实际威力：已结算技能、特性与威力加成；还会继续计算本系、克制、天气和能力等级。
面板威力：游戏最终显示值；已包含本系、克制、天气和能力等级。
```

- [ ] 分段按钮继续使用当前设置弹窗，不新增常驻主页面控件。
- [ ] 选中态有文字、颜色和 `aria-pressed` 三重反馈，不能只靠颜色。
- [ ] 窄窗口下说明最多两行，按钮不被压缩成不可读状态。
- [ ] 删除“技能威力”“游戏内威力”“基础技能威力”“手动威力”混用文案；用户可见统一为“实际威力 / 面板威力 / 恢复自动”。
- [ ] 伤害计算过程同步显示中文算式：

```text
自动：实际威力 190 × 本系 1.25 × 克制 2 = 面板威力 475
手动实际：实际威力 190（手动）× 本系 1.25 × 克制 2 = 面板威力 475
手动面板：面板威力 475（手动）→ 进入伤害公式
```

**验证：** 亮/暗色、桌面/窄窗口下无溢出；屏幕阅读器可以区分两个口径和恢复动作。

---

## 六、版本内回归与发布门禁

### 任务 8：补齐 v1.5.7 记录并完成全量验收

**Files:**
- Modify: `src/data/user-release-notes.js`
- Modify: `CHANGELOG.md`
- Modify: `docs/superpowers/plans/2026-08-17-power-input-mode-convergence.md`（勾选实际完成项）

- [ ] 在 v1.5.7 下补充“实际/面板威力统一口径、动态威力不再重复叠加、支持恢复自动、输入校验收口”。
- [ ] 不修改 `package.json`、安装器和应用标题中的版本号。
- [ ] 运行目标测试：

```text
npm test -- --run tests/domain/power-override.test.js tests/domain/calculate.test.js tests/domain/skill-rules.test.js
npm test -- --run tests/state/display-settings.test.js tests/state/share.test.js
npm test -- --run tests/ui/power-draft-input.test.jsx tests/ui/skill-editors.test.jsx tests/ui/workspace-overlays.test.jsx tests/ui/app-integration.test.jsx
```

- [ ] 运行完整门禁：

```text
npm run data:validate
npm test
npm run miniapp:sync-core
npm run test:core-drift
npm run miniapp:test
npm run acceptance:verify
npm run e2e
npm run build
git diff --check
```

- [ ] 桌面实机验收：单技能和四技能各验证一次自动、手动实际、手动面板、清空恢复自动和重启恢复设置。
- [ ] 回归动态技能：至少覆盖闪击、鸣沙陷阱、愿力冲击、雪原狩猎、扇风以及一个绝对威力规则技能。
- [ ] 对比切换前后：只切换口径不编辑数值时，伤害必须逐项完全相同。
- [ ] 若需要重新打桌面包，仍输出 v1.5.7，并在发布说明中标注为 v1.5.7 修订，不创建新版本号。

---

## 完成标准

- 单技能和四技能都只存在一个威力输入入口。
- 用户可以在设置中明确选择“实际威力”或“面板威力”。
- 切换口径只改变显示和下一次输入语义，不会自行改变伤害。
- 手动输入值带口径保存，不会被动态规则、特性、印记或本系重复计算。
- 清空输入可以真正恢复自动计算，不会复活旧手动值。
- 旧分享、旧本地配置和旧四技能基础覆盖仍能得到原伤害结果。
- 实际威力小数保持到既有取整节点，面板威力只接受整数。
- 外显文案只保留“实际威力、面板威力、自动、手动、恢复自动”五组核心概念。
- 所有目标测试、全量测试、共享核心漂移检查、E2E 和生产构建通过。
- 版本仍为 `1.5.7`。

---

## 执行记录（2026-08-17）

本计划已在 `1.5.7` 内完成，未提升版本号、未生成安装包。实际交付包括：

- 计算域新增统一 `powerOverride`，区分自动、手动实际、手动面板与旧基础威力兼容路径。
- 单技能、四技能收口为每个技能槽一个威力输入，切换口径只改变显示和后续输入语义。
- 清空、Enter、失焦、Escape、方向键、整数/小数校验和“恢复自动”均已覆盖组件测试。
- 新旧设置、分享字段与旧威力覆盖保持兼容；更换技能不会继承上一技能的临时威力覆盖。
- 公式、设置和技能栏文案统一为“实际威力 / 面板威力 / 自动 / 手动 / 恢复自动”。
- Web 全量测试 `1117/1117`、小程序测试 `278/278`、端到端测试 `27/27`、验收矩阵 `16/16` 均通过。
- 生产构建通过；客户端、CSS、JS 与运行时数据均未超过性能预算。
- Electron 实机确认：具体版正常显示单一威力入口；从实际威力切到面板威力后，技能栏数值同步切换，当前伤害保持不变。
