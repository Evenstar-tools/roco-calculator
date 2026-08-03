# 凡鹰“展翅”与疾风涡轮 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让凡鹰家族的普通系技能按翼系结算，并补齐防御承伤开关与疾风涡轮双技能合计伤害。

**Architecture:** 新建聚焦“展翅”的领域模块，提供有效技能属性与疾风涡轮组合计划；计算器按每个方向独立应用有效技能，复用已有单段计算与分段结果合并。四技能编辑器只负责选择同侧技能槽，状态保存在当前疾风涡轮槽位上下文。

**Tech Stack:** React、Vitest、现有 JavaScript 领域模块与共享小程序核心。

## Global Constraints

- 不修改快照中的技能原始属性。
- 不影响不具备“展翅”的精灵。
- 两段伤害分别取整后相加。
- 不增加运行时依赖。
- 保留当前工作区的其他未提交改动。

---

### Task 1: 展翅有效属性与防御负面

**Files:**
- Create: `src/domain/wing-extension.js`
- Modify: `src/domain/trait-effects.js`
- Modify: `src/domain/calculate.js`
- Test: `tests/domain/trait-effects.test.js`
- Test: `tests/domain/calculate.test.js`

**Interfaces:**
- Produces: `resolveWingExtensionSkill({ skill, traits }) -> skill`
- Produces: 展翅防御方 `actedAfterEnemy` 布尔控制与 `1.25` 最终承伤倍率。

- [x] **Step 1: Write the failing tests**

验证拥有展翅的出招方普通技能返回翼属性、不具备展翅时保持普通、原技能对象不被修改；验证防御开关未勾选为 `1`、勾选为 `1.25`。

- [x] **Step 2: Run tests to verify RED**

Run: `npm test -- tests/domain/trait-effects.test.js tests/domain/calculate.test.js`

- [x] **Step 3: Implement minimal domain behavior**

实现纯函数属性转换；在每个计算方向解析技能后调用；将现有展翅规则限定为防御方并关闭可编辑倍率。

- [x] **Step 4: Run tests to verify GREEN**

Run: `npm test -- tests/domain/trait-effects.test.js tests/domain/calculate.test.js`

### Task 2: 疾风涡轮组合结算

**Files:**
- Modify: `src/domain/wing-extension.js`
- Modify: `src/domain/calculate.js`
- Test: `tests/domain/calculate.test.js`

**Interfaces:**
- Produces: `buildGaleTurbineSequence({ skill, entry, entries, skillsById, traits }) -> { executions, companionSkill }`
- Produces: 组合结果的 `choiceTraitSequence`，包含技能名、分段伤害和合计。

- [x] **Step 1: Write failing sequence tests**

覆盖未选择时仅疾风涡轮、选择攻击技能时两段、选择变化技能时单段、非法或自身槽位选择时回退单段。

- [x] **Step 2: Run tests to verify RED**

Run: `npm test -- tests/domain/calculate.test.js`

- [x] **Step 3: Implement separate calculations and merge**

前置攻击技能与疾风涡轮分别传入现有 `calculateSkillResult`；合并结果使用技能名生成说明并相加两段已取整伤害。

- [x] **Step 4: Run tests to verify GREEN**

Run: `npm test -- tests/domain/calculate.test.js`

### Task 3: 四技能选择与实际属性展示

**Files:**
- Modify: `src/components/FourSkillEditor.jsx`
- Modify: `src/components/SingleSkillEditor.jsx`
- Modify: `src/components/CompactSkillEditor.jsx`
- Modify: `src/state/calculator-session.js`
- Test: `tests/ui/skill-editors.test.jsx`
- Test: `tests/state/calculator-session.test.js`
- Test: `e2e/uiux-team-presets.spec.js`

**Interfaces:**
- Consumes: 疾风涡轮槽位上下文键 `galeTurbineCompanionSlot`，取值为空或 `1..4`。
- Produces: 技能属性显示使用计算结果的 `typeLabel`，疾风涡轮行内动态选择框。

- [x] **Step 1: Write failing UI tests**

验证选中疾风涡轮时显示另外三个槽位、普通转翼显示翼、选择变化技能后不出现双段说明。

- [x] **Step 2: Run tests to verify RED**

Run: `npm test -- tests/ui/skill-editors.test.jsx`

- [x] **Step 3: Implement minimal UI and state wiring**

使用现有 `onSkillContextChange` 写入槽位上下文；选项显示槽位号、技能名和实际属性；保持窄窗口不溢出。

- [x] **Step 4: Run tests to verify GREEN**

Run: `npm test -- tests/ui/skill-editors.test.jsx`

### Task 4: 共享核心与回归验收

**Files:**
- Modify: `scripts/miniapp/shared-source-manifest.mjs`
- Generate: `miniapp/src/shared/domain/wing-extension.js`
- Test: `tests/miniapp/shared-core.test.js`

**Interfaces:**
- Consumes: Web 端完成后的共享领域模块。
- Produces: Web 与小程序一致的属性转换、承伤和组合结算规则。

- [x] **Step 1: Add module to shared manifest and sync**

Run: `npm run miniapp:sync-core`

- [x] **Step 2: Run focused regression**

Run: `npm test -- tests/domain/trait-effects.test.js tests/domain/calculate.test.js tests/ui/skill-editors.test.jsx tests/state/calculator-session.test.js`

- [x] **Step 3: Run complete verification**

Run: `npm run data:validate && npm test && npm run test:core-drift && npm run miniapp:test && npm run build && git diff --check`

- [x] **Step 4: Inspect the final diff**

确认改动只涉及展翅、疾风涡轮、对应 UI、测试、共享核心和本计划文档，且没有覆盖工作区其他改动。
