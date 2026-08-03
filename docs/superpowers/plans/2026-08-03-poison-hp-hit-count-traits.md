# 侵蚀与嫁祸连击特性 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为侵蚀与嫁祸增加战斗输入，并将连击加成统一接入攻击技能、状态技能和状态结算。

**Architecture:** 在 `trait-effects.js` 中维护特性输入定义，在新的纯函数模块中计算自动连击加成；`calculate.js` 将其合并进实际连击并把来源写入结果。`App.jsx` 在应用状态技能时复用同一解析结果，避免 UI 与结算出现两套规则。

**Tech Stack:** React 19、Vitest、Testing Library、现有 JavaScript 领域模型和状态仓库。

## Global Constraints

- 只对描述明确声明 `N 连击` 的物理、魔法和状态技能加成。
- 热身运动自身不接受特性连击加成。
- 花炮按实际连击次数结算每次 +6 攻击能力等级。
- 魔眷鸟“自由飘”不修改。
- 不增加运行时依赖，不修改伤害取整顺序。

---

### Task 1: 特性输入和纯连击解析

**Files:**
- Create: `src/domain/trait-hit-count.js`
- Modify: `src/domain/trait-effects.js`
- Test: `tests/domain/trait-hit-count.test.js`
- Test: `tests/domain/trait-effects.test.js`

**Interfaces:**
- Produces: `resolveTraitHitCountBonus({ traits, context, skill }): { hitCountAdd, label, source }`
- Produces: `getTraitEffectInputs()` 对侵蚀和嫁祸返回带命名空间的战斗输入。

- [ ] **Step 1: 写失败测试**

覆盖侵蚀未触发、3 层触发、三连破/花炮状态技能、热身运动排除、嫁祸 100/75/50/25/0% 档位和魔眷鸟零变化。

- [ ] **Step 2: 运行失败测试**

Run: `npx vitest run tests/domain/trait-hit-count.test.js tests/domain/trait-effects.test.js`

Expected: FAIL，原因是解析函数和两个特性输入尚未实现。

- [ ] **Step 3: 实现最小纯函数与输入定义**

使用稳定特性名匹配侵蚀与嫁祸；侵蚀读取勾选与中毒层数，嫁祸读取勾选与 `attackerHpPercent`。用 `hasDeclaredHitCount()` 且排除 `defense` 分类来限定生效技能，最终实际连击数限制为 1–99。

- [ ] **Step 4: 运行领域测试**

Run: `npx vitest run tests/domain/trait-hit-count.test.js tests/domain/trait-effects.test.js`

Expected: PASS。

### Task 2: 伤害计算与状态技能实际连击

**Files:**
- Modify: `src/domain/calculate.js`
- Modify: `src/domain/skill-status-effects.js`
- Test: `tests/domain/calculate.test.js`
- Test: `tests/domain/skill-status-effects.test.js`

**Interfaces:**
- Consumes: `resolveTraitHitCountBonus()`。
- Produces: 技能结果字段 `automaticHitCountAdd` 和 `hitCount`；状态结算上下文 `effectiveHitCount`。

- [ ] **Step 1: 写失败测试**

断言攻击技能单次取整后按特性连击数相乘；状态技能结果保留实际连击；花炮在 `effectiveHitCount: 5` 时增加攻击等级 30，默认仍为 12。

- [ ] **Step 2: 运行失败测试**

Run: `npx vitest run tests/domain/calculate.test.js tests/domain/skill-status-effects.test.js`

Expected: FAIL，现有计算未读取侵蚀/嫁祸且花炮固定为 12。

- [ ] **Step 3: 接入计算链路**

在构造完整技能上下文后解析特性连击；状态/防御技能返回不可伤害结果时附带实际连击；攻击技能把特性加成与方向加成、血脉加成相加并限制为 99。返回 `automaticHitCountAdd`，用于编辑时还原基础值。

- [ ] **Step 4: 实现花炮逐击结算**

将花炮从固定 `ownAttack: 12` 改为 `ownAttackPerHit: 6`；状态结算只对明确逐击收益读取 `effectiveHitCount`，其他状态技能保持一次性收益。

- [ ] **Step 5: 运行领域测试**

Run: `npx vitest run tests/domain/calculate.test.js tests/domain/skill-status-effects.test.js`

Expected: PASS。

### Task 3: UI 交互与应用状态技能

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/components/FourSkillEditor.jsx`
- Modify: `src/components/SingleSkillEditor.jsx`
- Test: `tests/ui/skill-editors.test.jsx`
- Test: `tests/ui/app-integration.test.jsx`

**Interfaces:**
- Consumes: 结果字段 `automaticHitCountAdd` 与纯函数 `resolveTraitHitCountBonus()`。
- Produces: 特性栏、嫁祸 HP/% 输入、状态技能应用时的 `effectiveHitCount`。

- [ ] **Step 1: 写失败 UI 测试**

断言侵蚀显示数字输入和触发勾选；嫁祸显示触发勾选并复用自身生命输入；状态技能行展示实际连击；修改连击时不会把自动加成保存进基础值。

- [ ] **Step 2: 运行失败 UI 测试**

Run: `npx vitest run tests/ui/skill-editors.test.jsx tests/ui/app-integration.test.jsx`

Expected: FAIL，当前 UI 没有这些特性输入和自动连击还原。

- [ ] **Step 3: 接入 UI 与状态应用**

复用 `TraitInputs` 和 `HealthInput`；激活状态技能前解析当前实际连击并传给 `resolveSkillStatusActivation()`；编辑连击时扣除 `automaticHitCountAdd` 后保存基础值。

- [ ] **Step 4: 运行 UI 测试**

Run: `npx vitest run tests/ui/skill-editors.test.jsx tests/ui/app-integration.test.jsx`

Expected: PASS。

### Task 4: 全量验证

**Files:**
- Modify only if a regression is caused by Tasks 1–3.

**Interfaces:**
- Consumes: 全部实现。
- Produces: 可交付的已验证工作树。

- [ ] **Step 1: 运行数据与单元测试**

Run: `npm run data:validate && npm test`

Expected: PASS。

- [ ] **Step 2: 同步小程序核心并检查漂移**

Run: `npm run miniapp:sync-core && npm run test:core-drift && npm run miniapp:test`

Expected: PASS。

- [ ] **Step 3: 构建与格式检查**

Run: `npm run build && git diff --check`

Expected: PASS。

- [ ] **Step 4: 审查魔眷鸟与热身运动回归**

运行对应定向测试，确认魔眷鸟无新增控件，热身运动自身仍为基础 1 次且应用后只影响后续明确连击技能。
