# 加尔系选择特性与技能行响应式 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不复制伤害公式的前提下，实现加灵、加益、加尔和黑化加尔选择技能的两段释放，并修复具体版技能描述与条件控件在普通桌面窗口中的溢出。

**Architecture:** 新增纯领域模块，把精灵特性、正式“选择：”技能和分支控件转换为两个顺序执行上下文；`calculate.js` 继续复用现有单次伤害函数，分别计算并取整后合并。状态技能激活复用同一特性开关，UI 仅展示上下文控件、两行描述和结算摘要。

**Tech Stack:** React 19、Vitest、Testing Library、Playwright、CSS

## Global Constraints

- 加灵、加益、加尔使用“有求必应”；黑化加尔使用“一意孤行”。
- 仅描述中包含“选择：”的可学技能显示特性开关。
- 第二段永远关闭应对成功。
- 两段伤害分别完整计算和取整后相加，禁止合并威力或直接乘二。
- 不模拟冷却、随机印记、回血、能量、萌化和奉献等未进入确定性伤害模型的系统。
- 不把战斗临时使用次数写入精灵记忆、配置库或队伍预设。
- 不增加运行时依赖，不修改当前数据快照。

---

### Task 1: 选择特性执行计划

**Files:**
- Create: `src/domain/choice-skill-sequence.js`
- Create: `tests/domain/choice-skill-sequence.test.js`
- Modify: `src/domain/skill-effects.js`

**Interfaces:**
- Consumes: `skill`, `spirit.traitName`, `slotContext`
- Produces: `isChoiceSkill(skill): boolean`、`buildChoiceSkillSequence({ skill, traitName, context }): { executions, summary } | null`

- [ ] **Step 1: 写失败测试**

覆盖：描述含“选择：”才识别；做好事/吃独食不识别；有求必应第二段切到另一 option；一意孤行重复同一 option；第二段 `counterTriggered=false`；加益与加灵、加尔同规则；未勾选返回单段。

- [ ] **Step 2: 运行领域测试确认失败**

Run: `npx vitest run tests/domain/choice-skill-sequence.test.js`

Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现最小纯函数**

从 `getSkillEffectInputs(skill)` 找到首个 `type === "choice"` 的控件，以其 options 顺序确定另一分支；只接受特性名“有求必应”或“一意孤行”和 `choiceTraitTriggered === true`。第二段复制上下文后强制所有应对布尔键为 `false`。

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/domain/choice-skill-sequence.test.js`

Expected: PASS。

### Task 2: 两段伤害分别取整并合并

**Files:**
- Modify: `src/domain/calculate.js`
- Modify: `tests/domain/calculate.test.js`
- Modify: `src/domain/calculator-view-model.js`

**Interfaces:**
- Consumes: Task 1 的 `buildChoiceSkillSequence`
- Produces: 结果字段 `choiceTraitSequence: { traitName, executions: Array<{ label, power, damage }>, text } | null`

- [ ] **Step 1: 写友谊满溢失败测试**

分别断言：有求必应成长为 70 与 90；有求必应应对为 140 与 70；一意孤行成长为 70 与 90；一意孤行应对为 140 与 70。断言总伤害等于两次单次伤害之和，而非合并威力一次计算。

- [ ] **Step 2: 运行定向测试确认失败**

Run: `npx vitest run tests/domain/calculate.test.js -t "选择特性两段伤害"`

Expected: FAIL，当前只有一次伤害。

- [ ] **Step 3: 复用单次公式实现顺序执行**

让 `calculateDirection` 根据执行计划生成临时 entry，逐次调用 `calculateSkillResult`。第一段后的 `skillUseCount` 只在执行成长分支时影响下一段；第二段关闭应对。合并时累加 `totalDamage`、`mainDamage`、`additionalDamage`，重新计算 HP 百分比和击倒状态，并保留两段独立结果用于解释。

- [ ] **Step 4: 运行计算测试确认通过**

Run: `npx vitest run tests/domain/calculate.test.js -t "选择特性两段伤害"`

Expected: PASS。

### Task 3: 状态技能与使用次数

**Files:**
- Modify: `src/domain/skill-status-effects.js`
- Modify: `src/App.jsx`
- Modify: `tests/domain/skill-status-effects.test.js`
- Modify: `tests/ui/app-integration.test.jsx`

**Interfaces:**
- Consumes: `choiceTraitTriggered`, `choiceTrait`, 当前技能分支和 `skillUseCount`
- Produces: 顺序合并的能力/固定威力变化及准确的选择技能使用次数

- [ ] **Step 1: 写状态激活失败测试**

断言野火、蒸汽进行曲、马步和超声波在未勾选时只应用当前分支；勾选有求必应时应用另一分支；勾选一意孤行时重复当前分支；加益与加灵、加尔一致。

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/domain/skill-status-effects.test.js tests/ui/app-integration.test.jsx -t "选择特性"`

Expected: FAIL，当前逻辑只看特性名且使用次数固定加一。

- [ ] **Step 3: 接入显式开关与顺序累计**

只有 `choiceTraitTriggered` 为真时把 `choiceTrait` 传入状态解析；每次真实执行累加选择技能使用次数。未建模的状态分支返回可展示说明而不修改伤害数值。

- [ ] **Step 4: 运行定向测试确认通过**

Run: `npx vitest run tests/domain/skill-status-effects.test.js tests/ui/app-integration.test.jsx -t "选择特性"`

Expected: PASS。

### Task 4: 勾选框、结果摘要与响应式技能行

**Files:**
- Modify: `src/components/FourSkillEditor.jsx`
- Modify: `src/components/ResultRail.jsx`
- Modify: `src/styles.css`
- Modify: `tests/ui/skill-editors.test.jsx`
- Modify: `tests/ui/result-rail.test.jsx`
- Modify: `tests/e2e/calculator.spec.js`

**Interfaces:**
- Consumes: `choiceTraitSequence`、`choiceTraitTriggered`、`isChoiceSkill`
- Produces: “触发特性”复选框、两行描述、可换行控件区和结果栏两段说明

- [ ] **Step 1: 写 UI 失败测试**

断言：加益的选择技能显示“触发特性”；非选择技能不显示；结果栏显示“第一段 140 + 第二段 70 = 210”；描述元素保留完整 `title`。

- [ ] **Step 2: 运行组件测试确认失败**

Run: `npx vitest run tests/ui/skill-editors.test.jsx tests/ui/result-rail.test.jsx`

Expected: FAIL，缺少特性开关和摘要。

- [ ] **Step 3: 实现 UI 与 CSS**

将描述和输入控件拆为 `.skill-slot__description` 与 `.skill-slot__controls`；描述使用两行 line-clamp，容器允许 controls 换行。结果栏只在序列存在时渲染紧凑摘要。

- [ ] **Step 4: 添加桌面窗口回归测试**

在 1424×861 打开具体版，选择友谊满溢并展开上下文，断言技能行、选择框和特性勾选框的 bounding box 均不越过所属侧栏右边界，且不与结果栏相交。

- [ ] **Step 5: 运行 UI 与 E2E 测试**

Run: `npx vitest run tests/ui/skill-editors.test.jsx tests/ui/result-rail.test.jsx && npx playwright test tests/e2e/calculator.spec.js`

Expected: PASS。

### Task 5: 全量验证

**Files:**
- Modify only if verification exposes a request-related regression.

**Interfaces:**
- Consumes: Tasks 1–4
- Produces: 可交付的验证证据

- [ ] **Step 1: 运行数据和单元测试**

Run: `npm run data:validate && npm test`

Expected: PASS，零失败。

- [ ] **Step 2: 运行共享核心与小程序漂移检查**

Run: `npm run miniapp:sync-core && npm run test:core-drift && npm run miniapp:test`

Expected: PASS。

- [ ] **Step 3: 运行端到端和构建**

Run: `npm run e2e && npm run build`

Expected: PASS。

- [ ] **Step 4: 检查变更质量**

Run: `git diff --check && git status --short`

Expected: 无空白错误；状态只包含本次计划内文件。
