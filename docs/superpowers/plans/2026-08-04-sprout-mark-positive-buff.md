# 萌芽印记正面增益追加 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让每层萌芽印记为技能产生的确定性自身正面增益额外增加一个对应单位。

**Architecture:** 在 `skill-status-effects` 的纯解析流程中接收 `sproutStacks` 并统一追加正面增益。折射规则额外返回各系别的萌芽单层增量，应用层仅负责传入当前施放方印记层数。

**Tech Stack:** React、JavaScript、Vitest、Testing Library

## Global Constraints

- 不放大自身负面、对敌减益、回血、减伤、印记和持续状态。
- 不放大百分比威力。
- 1 层折射电系为速度 `+30`，光系为双攻 `+4层`。
- 0 层必须完全保持旧行为。
- 不新增运行时依赖。

---

### Task 1: 领域规则

**Files:**
- Modify: `src/domain/refraction.js`
- Modify: `src/domain/skill-status-effects.js`
- Modify: `src/domain/choice-skill-sequence.js`
- Test: `tests/domain/refraction.test.js`
- Test: `tests/domain/skill-status-effects.test.js`
- Test: `tests/domain/choice-skill-sequence.test.js`

**Interfaces:**
- Consumes: `resolveSkillStatusActivation(skill, context)` 中的 `context.sproutStacks`
- Produces: 已按萌芽层数追加的 `deltas` 与能耗操作值

- [x] **Step 1: 写失败测试**

覆盖折射 0/1/2 层、普通正面技能、混合正负技能和对敌减益。

- [x] **Step 2: 验证测试正确失败**

Run: `npm test -- tests/domain/refraction.test.js tests/domain/skill-status-effects.test.js`

Expected: 新增的萌芽断言失败，既有断言继续通过。

- [x] **Step 3: 最小实现**

为折射定义每层萌芽增量；在状态解析结束后只追加正值的自身能力、固定威力、速度、连击和明确的能耗降低。

- [x] **Step 4: 验证领域测试通过**

Run: `npm test -- tests/domain/refraction.test.js tests/domain/skill-status-effects.test.js`

Expected: PASS。

### Task 2: 主界面接入

**Files:**
- Modify: `src/App.jsx`
- Test: `tests/ui/app-integration.test.jsx`

**Interfaces:**
- Consumes: `state.marks[side].positive`
- Produces: `sproutStacks` 传入技能状态解析器

- [x] **Step 1: 写失败交互测试**

设置攻击方萌芽 1 层，点击折射，断言威力、连击、速度和能力等级按新值更新；防御方印记不得影响攻击方。

- [x] **Step 2: 验证测试正确失败**

Run: `npm test -- tests/ui/app-integration.test.jsx`

Expected: 新增萌芽交互断言失败。

- [x] **Step 3: 最小接入**

从当前施放方正面印记槽读取 `sprout` 层数，标准化到 `0..99` 后传入领域函数。

- [x] **Step 4: 验证交互测试通过**

Run: `npm test -- tests/ui/app-integration.test.jsx`

Expected: PASS。

### Task 3: 回归验收

**Files:**
- Verify only

**Interfaces:**
- Consumes: 完成后的代码与测试
- Produces: 可交付的验证结果

- [x] **Step 1: 运行全量测试**

Run: `npm test`

- [x] **Step 2: 运行数据和构建检查**

Run: `npm run data:validate`

Run: `npm run build`

- [x] **Step 3: 检查补丁质量**

Run: `git diff --check`
