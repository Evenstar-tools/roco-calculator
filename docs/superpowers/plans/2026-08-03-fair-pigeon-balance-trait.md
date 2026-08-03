# 公平鸽「衡量」特性 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为公平鸽增加可触发的正面攻防等级复制，并在其在场时显示双方原本隐藏的能力等级。

**Architecture:** 用纯领域函数识别公平鸽和计算正面等级复制；特性规则只声明战斗态触发控件；App 在触发开启及四技能增益落地时调用复制函数。NatureStatsStep 支持每方一或两行等级，继续读写现有 forward/reverse overrides。

**Tech Stack:** React 19、Vitest、Testing Library、现有 calculator session/reducer、共享小程序领域镜像。

## Global Constraints

- 不修改伤害公式与能力等级倍率公式。
- 能力等级范围保持 `-50..50`。
- 只复制正面攻击与防御能力等级，不复制其他战斗状态。
- 无公平鸽时 UI 与当前版本一致。
- 使用测试驱动：测试先失败，再写最小实现。

---

### Task 1: 领域规则与触发输入

**Files:**
- Create: `src/domain/fair-pigeon.js`
- Modify: `src/domain/trait-effects.js`
- Test: `tests/domain/fair-pigeon.test.js`
- Test: `tests/domain/trait-effects.test.js`

**Interfaces:**
- Produces: `hasFairPigeon(spirit) -> boolean`
- Produces: `copyPositiveAbilityStages(source, target) -> { attack, defense }`
- Produces: 「衡量」的 direction-scope boolean input `balanceTriggered`

- [ ] 写失败测试：识别公平鸽、只复制正面等级、按上限截断、衡量提供战斗态勾选。
- [ ] 运行 `npx vitest run tests/domain/fair-pigeon.test.js tests/domain/trait-effects.test.js -t "公平鸽|衡量"`，确认因功能缺失失败。
- [ ] 实现最小纯函数和特性规则。
- [ ] 同步 `src/domain` 共享文件到小程序镜像。
- [ ] 重跑针对性测试，确认通过。

### Task 2: 双等级 UI

**Files:**
- Modify: `src/components/NatureStatsStep.jsx`
- Modify: `src/App.jsx`
- Test: `tests/ui/calculator-sections.test.jsx`
- Test: `tests/ui/app-integration.test.jsx`

**Interfaces:**
- Consumes: `hasFairPigeon(spirit)`
- Produces: `side.levels` 数组及 `onLevelChange(role, stage)` 回调；无公平鸽时仍兼容单个 `side.level`

- [ ] 写失败测试：公平鸽在场时显示四条双方攻防等级，无公平鸽时仍为两条。
- [ ] 运行目标 UI 测试，确认因第二等级缺失失败。
- [ ] 让 NatureStatsStep 渲染一或多条等级控件，并由 App 精确映射四个现有方向字段。
- [ ] 重跑目标 UI 测试，确认显示与编辑通过。

### Task 3: 触发时复制已有增益

**Files:**
- Modify: `src/App.jsx`
- Test: `tests/ui/app-integration.test.jsx`

**Interfaces:**
- Consumes: `copyPositiveAbilityStages`
- Produces: 勾选 `balanceTriggered` 时一次性复制对方当前正面攻防等级

- [ ] 写失败测试：攻击方和防御方公平鸽各自能复制对方已有正面攻防，负面不复制。
- [ ] 运行目标测试，确认复制尚未发生。
- [ ] 在 trait context 从 false 变为 true 时更新公平鸽对应的两个现有方向 overrides。
- [ ] 重跑测试，确认复制一次且取消勾选不清除等级。

### Task 4: 增益技能实时镜像

**Files:**
- Modify: `src/App.jsx`
- Test: `tests/ui/app-integration.test.jsx`

**Interfaces:**
- Consumes: 四技能 `resolution.deltas.ownAttack/ownDefense`
- Produces: 对手公平鸽触发开启时同步同次正面增量

- [ ] 写失败测试：对手点击攻击/防御增益技能后，公平鸽同步增益；负面、自身增益、双方公平鸽递归场景不重复。
- [ ] 运行目标测试，确认缺少实时同步而失败。
- [ ] 在四技能状态应用的同一批 dispatch 中追加一次镜像更新。
- [ ] 重跑目标测试，确认能力等级只结算一次。

### Task 5: 全量验收

**Files:**
- Modify: `miniapp/src/shared/domain/fair-pigeon.js`

**Interfaces:**
- Produces: Web 与小程序共享领域规则一致。

- [ ] 运行 `npm run test:core-drift`。
- [ ] 运行 `npm test`。
- [ ] 运行 `npm run miniapp:test`。
- [ ] 运行 `npm run build`。
- [ ] 运行 `git diff --check`，检查工作区只包含本需求文件。
- [ ] 提交实现，提交信息为 `feat: add Fair Pigeon buff copying`。
