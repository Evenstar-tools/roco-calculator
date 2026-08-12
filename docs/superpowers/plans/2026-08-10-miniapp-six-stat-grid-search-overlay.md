# Miniapp Six-Stat Grid And Search Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让手机主页面的性格与个体六维严格同列，支持正面性格二次点击复原，并彻底消除精灵搜索浮层横向超框。

**Architecture:** 只调整 `QuickCombatantControls` 的展示结构与点击分支，并收紧 `overlays.css` 的固定浮层几何约束。业务状态仍由现有 calculator store 管理，性格预设仍由 `resolveCompactNaturePreset` 计算。

**Tech Stack:** Taro 4.2.1、React 18、Vitest、Testing Library、WXSS/CSS、微信开发者工具。

## Global Constraints

- 保持小程序版本 `0.1.1` 与网页核心 `1.4.3`。
- 不修改计算核心、持久化、记忆、收藏配置、内置配置或分享协议。
- 能力列固定顺序：生命、物攻、魔攻、速度、物防、魔防。
- 目标视口：320、375、390、430 像素宽手机；不得横向溢出。
- 最终完成门禁是真实微信小程序编译和视觉/交互回归，不以 H5 截图替代。

---

### Task 1: 六维同列与性格复原

**Files:**
- Modify: `miniapp/src/components/QuickCombatantControls.jsx`
- Modify: `miniapp/src/pages/index/styles/parameters.css`
- Modify: `miniapp/src/pages/index/styles/responsive.css`
- Test: `miniapp/tests/combatant-details.test.jsx`
- Test: `miniapp/tests/portrait-css.test.js`

**Interfaces:**
- Consumes: `getNature(value)`、`resolveCompactNaturePreset(stat, displayIvs)`、`onNatureChange(value)`、`onIvChange(stat, value)`。
- Produces: 一个标签列加六个能力列的快捷配置；已选正面性格再次点击时调用 `onNatureChange("neutral")`。

- [x] **Step 1: 写失败测试**

在组件测试中点击已选正面性格并断言 store 性格变为 `neutral`；在 CSS 测试中断言快捷行只含 `repeat(6, minmax(0, 1fr))` 且不含 `repeat(7, ...)`。

- [x] **Step 2: 运行测试确认失败**

Run: `npm --prefix miniapp test -- --run tests/combatant-details.test.jsx tests/portrait-css.test.js`

Expected: 二次点击仍保持原性格，CSS 仍包含七列规则，因此失败。

- [x] **Step 3: 实现最小改动**

把“性格/普通”合并为标签区；新增六维列标题；性格和个体各渲染六个同宽按钮；个体按钮显示当前值；点击已选正面性格时写入 `neutral`。

- [x] **Step 4: 运行定向测试**

Run: `npm --prefix miniapp test -- --run tests/combatant-details.test.jsx tests/portrait-css.test.js`

Expected: PASS。

### Task 2: 搜索浮层安全宽度

**Files:**
- Modify: `miniapp/src/pages/index/styles/overlays.css`
- Test: `miniapp/tests/portrait-css.test.js`
- Test: `miniapp/tests/spirit-picker.test.jsx`

**Interfaces:**
- Consumes: 现有 `SpiritPicker` 遮罩关闭逻辑。
- Produces: 输入与结果列表统一 `left: 14px; right: 14px; width: auto` 的固定浮层。

- [x] **Step 1: 写失败测试**

断言身份卡搜索输入和结果列表都包含 `right: 14px` 与 `width: auto`，并继续验证遮罩点击会清空和关闭。

- [x] **Step 2: 运行测试确认失败**

Run: `npm --prefix miniapp test -- --run tests/portrait-css.test.js tests/spirit-picker.test.jsx`

Expected: 现有样式使用 `width: calc(100vw - 28px)`，因此 CSS 断言失败。

- [x] **Step 3: 实现安全边距**

把两个固定浮层选择器改为左右双边约束和自动宽度，保留现有 `top`、层级、最大高度和滚动行为。

- [x] **Step 4: 运行定向测试**

Run: `npm --prefix miniapp test -- --run tests/portrait-css.test.js tests/spirit-picker.test.jsx`

Expected: PASS。

### Task 3: 全量构建与真实微信验收

**Files:**
- Modify: `design-qa.md`
- Verify: `miniapp/dist/**`
- Create: `artifacts/2026-08-10-six-stat-grid/*.png`

**Interfaces:**
- Consumes: Tasks 1–2 的最终实现和确认设计稿。
- Produces: 生产包、手机关键状态截图、通过的视觉 QA 与飞书通知证据。

- [x] **Step 1: 运行全量测试和生产构建**

Run: `npm --prefix miniapp test -- --run && npm run miniapp:build:prod`

Expected: 0 failed，包体低于 2 MiB。

- [x] **Step 2: 微信开发者工具真实编译与交互回归**

导入 `miniapp`，验证默认页、性格选择与二次取消、个体六维、攻击/防守精灵搜索、遮罩关闭和 320/375/390/430 宽度；控制台 0 error。

- [x] **Step 3: 更新视觉 QA**

将确认稿与真实微信运行截图同屏比较；修复所有 P0/P1/P2 后令 `design-qa.md` 包含 `final result: passed`。

- [ ] **Step 4: 提交并通知**

Run: `git diff --check && git status --short`

Expected: 仅包含本计划相关源码、测试、QA 和计划文档；发送飞书完成通知并回读中文、换行和版本信息。
