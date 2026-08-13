# First-run Spirit Picker Spotlight Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让初次引导按精灵选择器的收起、展开和已选状态准确高亮，并保证滚轮滚动不被引导层截获。

**Architecture:** `SpiritPicker` 只暴露稳定的搜索、下拉列表和已选卡片标记；`FirstRunGuide` 负责按优先级组合目标矩形，并监听 DOM 与尺寸变化。保留现有选择、搜索和引导流程。

**Tech Stack:** React 19、Vitest、Testing Library、Playwright、CSS

## Global Constraints

- 不新增运行时依赖。
- 不修改精灵搜索、选择、收藏、增量加载和配置恢复逻辑。
- 不修改六步引导内容和完成状态。
- 本轮不打包。

---

### Task 1: 锁定三态高亮范围

**Files:**
- Modify: `tests/ui/first-run-guide.test.jsx`
- Modify: `src/components/SpiritPicker.jsx`
- Modify: `src/components/FirstRunGuide.jsx`

**Interfaces:**
- Consumes: `data-guide-target`, `data-guide-part="options"`, `data-guide-part="selection"`
- Produces: 根据当前 DOM 返回搜索、搜索加列表或搜索加已选卡片的并集矩形

- [ ] 写组件失败测试，分别断言未选、展开、已选三种 spotlight 尺寸。
- [ ] 运行目标测试并确认因现有整卡目标逻辑失败。
- [ ] 将引导主目标移到搜索栏，并标记列表和已选卡片。
- [ ] 实现目标矩形并集和 DOM 变化重测。
- [ ] 运行组件测试并确认通过。

### Task 2: 避免闪烁并验证滚轮

**Files:**
- Modify: `src/styles.css`
- Modify: `e2e/uiux-team-presets.spec.js`

**Interfaces:**
- Consumes: `.first-run-guide__spotlight` 与真实精灵下拉列表
- Produces: 短时位置和尺寸过渡；引导打开时页面及下拉列表仍可滚动

- [ ] 写端到端失败测试，验证输入栏展开、选中后范围变化及滚轮滚动。
- [ ] 运行目标端到端测试并确认现有范围断言失败。
- [ ] 增加 spotlight 的位置和尺寸过渡，不增加可拦截滚轮的事件层。
- [ ] 运行端到端测试并确认攻击方、防御方和滚轮通过。

### Task 3: 回归验收

**Files:**
- Verify only

**Interfaces:**
- Consumes: 既有首次引导与精灵选择测试
- Produces: 无功能回退的测试证据

- [ ] 运行首次引导组件测试。
- [ ] 运行首次引导端到端测试。
- [ ] 运行完整 Vitest。
- [ ] 运行 `git diff --check` 并检查仅包含本需求必要改动。
