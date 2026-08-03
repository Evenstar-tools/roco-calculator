# Unicorn Seven Slots and Refraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为彩虹独角兽提供全链路七技能槽，并实现折射按唯一携带系别逐次应用的 S2 规则和紧凑 UI。

**Architecture:** 用独立槽位容量模块消除散落的固定四槽假设，用纯函数折射解析器生成效果增量，再由现有状态技能入口应用。持久化格式接受四槽或七槽，旧数据保持兼容；UI 根据实际容量渲染并限制说明为两行。

**Tech Stack:** React 19、Vitest、Testing Library、Playwright、Vite、现有纯 JavaScript 状态与计算模块。

## Global Constraints

- 仅“夺目”精灵为七槽，其余仍为四槽。
- 折射自身不贡献光系，同系每次只结算一次，重复点击可重复累计。
- 使用当前 S2 后数值；无法直接进入伤害公式的状态只记录，不臆造伤害。
- 不新增运行时依赖，不改既有伤害公式，不打安装包。

---

### Task 1: 技能槽容量与计算链路

**Files:**
- Create: `src/domain/skill-slot-capacity.js`
- Modify: `src/domain/skill-loadout.js`
- Modify: `src/domain/calculate.js`
- Modify: `src/state/calculator-session.js`
- Modify: `src/state/reducer.js`
- Test: `tests/domain/skill-slot-capacity.test.js`
- Test: `tests/domain/skill-loadout.test.js`
- Test: `tests/domain/calculate.test.js`

**Interfaces:**
- Produces: `getSpiritSkillSlotCapacity(snapshot, spiritId): 4 | 7`
- Produces: `normalizeSkillSlots(skillIds, capacity): Array<string|null>`

- [ ] 写失败测试：夺目为七槽、普通精灵为四槽、计算返回七行。
- [ ] 运行定向测试并确认失败原因为固定四槽。
- [ ] 实现容量函数并让默认、重选、计算与 reducer 按容量工作。
- [ ] 运行定向测试并确认新旧四槽用例全部通过。
- [ ] 提交该独立变更。

### Task 2: 七槽持久化兼容

**Files:**
- Modify: `src/state/spirit-configs.js`
- Modify: `src/state/favorite-config-library.js`
- Modify: `src/state/share.js`
- Modify: `src/state/team-presets.js`
- Test: `tests/state/spirit-configs.test.js`
- Test: `tests/state/favorite-config-library.test.js`
- Test: `tests/state/share.test.js`
- Test: `tests/state/team-presets.test.js`

**Interfaces:**
- Consumes: `normalizeSkillSlots`
- Produces: 四槽/七槽可逆序列化与旧四槽兼容读取。

- [ ] 写失败测试：七槽配置记忆、分享、配置库和队伍往返不丢第 5–7 槽。
- [ ] 运行定向测试并确认现有长度 4 校验导致失败。
- [ ] 将固定长度清洗改为允许 4 或 7，并按当前精灵容量恢复。
- [ ] 运行定向测试，确认旧四槽样例字节语义不变。
- [ ] 提交持久化兼容变更。

### Task 3: 折射规则纯函数

**Files:**
- Create: `src/domain/refraction.js`
- Modify: `src/domain/skill-status-effects.js`
- Test: `tests/domain/refraction.test.js`
- Test: `tests/domain/skill-status-effects.test.js`

**Interfaces:**
- Produces: `resolveRefractionEffects({ selectedSkill, carriedSkills }): { types, summary, deltas, operations, statuses }`
- Produces: `buildRefractionHint({ selectedSkill, carriedSkills }): string`

- [ ] 写失败测试覆盖 18 系映射、S2 数值、去重、排除折射自身和额外光技能。
- [ ] 运行定向测试并确认解析器不存在。
- [ ] 实现无副作用解析器，并接入现有状态技能解析入口。
- [ ] 运行定向测试，确认数据映射和短摘要准确。
- [ ] 提交规则层变更。

### Task 4: 折射点击应用

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/domain/calculate.js`
- Test: `tests/ui/app-integration.test.jsx`
- Test: `tests/domain/calculate.test.js`

**Interfaces:**
- Consumes: `resolveRefractionEffects`
- Produces: 每次点击一次性应用唯一系别增量；负连击修正生效但最终连击不少于 1。

- [ ] 写失败集成测试：输入框点击不触发，行点击触发一次，重复点击累计两轮。
- [ ] 写失败计算测试：地系连击 -2 与翼系 +1 可进入最终连击，最低为 1。
- [ ] 复用现有方向修正、生命和星陨更新通路应用增量，并保存状态摘要。
- [ ] 运行集成与计算测试，确认没有双算能力等级。
- [ ] 提交交互变更。

### Task 5: 七槽 UI 与响应式验收

**Files:**
- Modify: `src/components/FourSkillEditor.jsx`
- Modify: `src/components/CompactSkillEditor.jsx`
- Modify: `src/components/TeamMemberEditor.jsx`
- Modify: `src/components/SkillStep.jsx`
- Modify: `src/styles.css`
- Test: `tests/ui/calculator-sections.test.jsx`
- Test: `tests/ui/app-integration.test.jsx`
- Test: `e2e/calculator.spec.js`

**Interfaces:**
- Consumes: 实际 `selectedSkills.length` 与 `buildRefractionHint`。
- Produces: 4/7 行动态渲染、两行折射摘要、无重叠的窄窗口布局。

- [ ] 写失败 UI 测试：七行可访问、摘要最多两行、四槽精灵不出现多余行。
- [ ] 让编辑器与结果区按真实数组长度渲染，技能说明和摘要使用两行截断。
- [ ] 在 1920×945、1280×720 和窄窗口运行浏览器测试并检查遮挡。
- [ ] 修正发现的布局回归，保持现有攻防色和选中态。
- [ ] 提交 UI 变更。

### Task 6: 全量验证与文档收口

**Files:**
- Modify: `scripts/miniapp/shared-source-manifest.json`（仅当新增共享核心文件需要同步）
- Modify: `docs/superpowers/specs/2026-08-03-unicorn-seven-slots-refraction-design.md`（仅记录实际偏差）

**Interfaces:**
- Consumes: 前五项全部实现。
- Produces: 可构建、可测试、未打包的完成状态。

- [ ] 运行 `npm run data:validate`、`npm test`、`npm run miniapp:sync-core`、`npm run test:core-drift`、`npm run miniapp:test`。
- [ ] 运行 `npm run build`、`npm run miniapp:build`、`npm run e2e`、`git diff --check`。
- [ ] 检查最终 diff 只包含本功能所需改动，确认没有安装包产物。
- [ ] 提交验证所需清单或文档修正。
