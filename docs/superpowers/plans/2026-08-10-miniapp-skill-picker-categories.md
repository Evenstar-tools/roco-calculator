# Miniapp Skill Picker Categories Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为小程序技能选择弹层增加基于真实技能数据的快捷分类，减少在约 49–58 项技能中滚动寻找的成本，同时保留按名称、系别和拼音搜索的快速路径。

**Architecture:** 从现有 `SkillPicker` 中抽出纯筛选函数，按 `category` 字段生成动态分类和计数；组件只负责分类状态、搜索状态、滚动定位和选择动作。分类与搜索使用交集逻辑，保持学习列表原顺序，不修改技能数据、学习表或计算核心。

**Tech Stack:** Taro 4.2.1、React 18、Vitest、Testing Library、WXSS/CSS、Playwright、微信开发者工具。

## Global Constraints

- 保持小程序版本 `0.1.1` 与网页核心 `1.4.3`。
- 只处理小程序技能选择弹层；不修改桌面版、伤害计算、技能合法性、四技能容量、记忆系统、收藏配置或分享协议。
- 分类顺序固定为：全部、物理、魔法、变化、防御；只显示当前 `choices` 中数量大于 0 的业务分类。
- 当前数据没有 `dual` 技能；未来出现未知非空分类时回退为“其他”，不得丢失技能。
- 分类与搜索是交集，不重新排序技能；原学习顺序继续作为默认顺序。
- 首屏不平铺 18 个系别；系别、中文名称、完整拼音和首字母统一由搜索承担。
- 弹层打开时不主动唤起键盘；用户点击搜索框后才聚焦输入。
- 所有分类按钮触控高度不低于 44px，320px 手机不得横向溢出。
- 最终门禁包括生产小程序构建、微信开发者工具启动、手机/iPad 分类与搜索交互、原生截图；H5 只作为中间验证。

## Data Decision Record

- 当前运行数据：592 只精灵、553 个技能、592 份学习表。
- 截图中的迪莫共有 53 项：物理 24、魔法 19、变化 8、防御 2；43 项有伤害，10 项为辅助。
- 精灵技能数中位数为 49，582 只精灵超过 40 项；591 只精灵同时具有魔法、变化和防御分类。
- 每只主流精灵通常覆盖 18 个系别，因此把所有系别做成常驻按钮会挤占手机高度；本期采用分类按钮加增强搜索。

## Chosen Interaction

采用“方案 A：四分类按钮 + 增强搜索”。弹层顺序为标题、分类横条、搜索框、结果列表：

1. 默认选中“全部”，标题显示“共 53 项”。
   分类横条显示：`全部 53｜物理 24｜魔法 19｜变化 8｜防御 2`；窄屏允许横向滑动，不压缩文字。
2. 点击“物理”后列表立即变为 24 项，标题显示“物理 24 项”；不弹键盘。
3. 再次点击当前分类回到“全部”；也可直接点击“全部”。
4. 输入“光”“光系”“闪光”“shanguang”或“sg”时，在当前分类内继续过滤。
5. 分类或搜索变化后列表回到顶部；无筛选时打开弹层，优先滚动到当前已选技能。
6. 选择技能后关闭弹层并清空分类和搜索，下次从“全部”开始，避免残留过滤造成误解。
7. 空结果分两类提示：原始列表为空时显示“当前宠物没有可用技能数据”；分类或搜索后为空时显示“当前筛选无结果”，并提供“清除筛选”。

未采用的方案：

- 方案 B“分类 + 18 系别双层筛选”：查找能力最强，但手机首屏密度和操作层级过高。
- 方案 C“仅按分类分组展示”：只能解释列表，不能减少滚动，不解决当前痛点。

---

### Task 1: 独立技能筛选模型

**Files:**
- Create: `miniapp/src/view-models/skill-filters.js`
- Create: `miniapp/tests/skill-filters.test.js`

**Interfaces:**
- Consumes: `choices: Skill[]`，字段包含 `id`、`name`、`type`、`category`、`basePower`、`cost`、`searchText`。
- Produces: `buildSkillCategoryOptions(choices)`、`filterSkillChoices(choices, { category, query })`、`normalizeSkillQuery(value)`。

- [ ] **Step 1: 写分类计数失败测试**

用包含物理、魔法、变化、防御和未知分类的固定数据，断言分类顺序、数量、未知分类回退和零项分类隐藏；再用内置迪莫数据断言 `53 / 24 / 19 / 8 / 2`。

```js
expect(buildSkillCategoryOptions(dimoSkills)).toEqual([
  { count: 53, key: "all", label: "全部" },
  { count: 24, key: "physical", label: "物理" },
  { count: 19, key: "magical", label: "魔法" },
  { count: 8, key: "status", label: "变化" },
  { count: 2, key: "defense", label: "防御" },
]);
```

- [ ] **Step 2: 写组合筛选失败测试**

断言分类和查询使用交集；`光`、`光系`、`shanguang`、`sg` 都可命中“闪光”；过滤后保持原 `choices` 顺序。

```js
expect(filterSkillChoices(dimoSkills, {
  category: "magical",
  query: "sg",
}).map((skill) => skill.name)).toContain("闪光");
```

- [ ] **Step 3: 运行测试确认失败**

Run: `npm --prefix miniapp test -- --run tests/skill-filters.test.js`

Expected: FAIL，筛选模块尚不存在。

- [ ] **Step 4: 实现纯函数**

使用 `NFKC`、`zh-CN` 小写和紧凑字符处理；搜索索引组合 `searchText`、名称、系别、`系` 后缀、中文分类、威力和能量。分类只读取现有字段，不复制或修改技能对象。

```js
const KNOWN_CATEGORIES = new Set([
  "physical",
  "magical",
  "status",
  "defense",
]);

export function filterSkillChoices(choices, { category = "all", query = "" }) {
  const needle = normalizeSkillQuery(query);
  return choices.filter((skill) => {
    const categoryMatches = category === "all"
      || skill.category === category
      || (category === "other" && !KNOWN_CATEGORIES.has(skill.category));
    return categoryMatches && (!needle || skillSearchText(skill).includes(needle));
  });
}
```

- [ ] **Step 5: 运行定向测试并提交**

Run: `npm --prefix miniapp test -- --run tests/skill-filters.test.js`

Expected: PASS。

Commit: `feat(miniapp): add skill category filter model`

### Task 2: 分类、搜索与滚动状态

**Files:**
- Modify: `miniapp/src/components/SkillPicker.jsx`
- Modify: `miniapp/tests/skill-slots.test.jsx`

**Interfaces:**
- Consumes: Task 1 的三个纯函数、现有 `choices`、`value`、`onChange`。
- Produces: `category` 选中态、分类计数按钮、组合结果、筛选重置、当前技能定位。

- [ ] **Step 1: 写组件失败测试**

覆盖默认“全部”、分类数量、唯一 `aria-pressed`、分类切换、二次点击复原、分类与搜索交集、切换精灵后的分类复原、选择后清空、空结果文案、“清除筛选”以及不自动聚焦搜索框。

```jsx
fireEvent.click(screen.getByRole("button", { name: "筛选物理技能，共 24 项" }));
expect(screen.getByText("物理 24 项")).toBeInTheDocument();
expect(screen.queryByRole("button", { name: /魔法增效/u })).not.toBeInTheDocument();
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm --prefix miniapp test -- --run tests/skill-slots.test.jsx`

Expected: FAIL，当前组件没有分类状态且输入框带 `focus`。

- [ ] **Step 3: 实现状态流水线**

新增 `category = "all"`；`categoryOptions` 从全部 `choices` 计算；`filteredChoices` 使用分类和搜索交集。删除输入框 `focus`；打开时只清空过滤状态，选择或关闭后恢复全部。`choices` 变化且当前分类已不存在时立即回到 `all`，防止切换精灵后残留空分类。

```jsx
const [category, setCategory] = useState("all");
const categoryOptions = useMemo(
  () => buildSkillCategoryOptions(choices),
  [choices],
);
const filteredChoices = useMemo(
  () => filterSkillChoices(choices, { category, query }),
  [category, choices, query],
);
```

- [ ] **Step 4: 增加可访问分类按钮和结果语义**

分类容器使用 `aria-label="技能分类"`；按钮使用 `aria-pressed` 和包含数量的 `aria-label`。标题计数根据当前分类和搜索状态切换，不再只判断 `query.trim()`。

- [ ] **Step 5: 处理滚动定位**

无过滤打开时通过 `scrollIntoView` 定位当前选中技能；分类或查询变化时清除定位并把列表滚动到顶部，确保用户先看到当前结果的第一项。

- [ ] **Step 6: 运行定向测试并提交**

Run: `npm --prefix miniapp test -- --run tests/skill-filters.test.js tests/skill-slots.test.jsx`

Expected: PASS。

Commit: `feat(miniapp): add skill picker category flow`

### Task 3: 手机与 iPad 分类栏视觉

**Files:**
- Modify: `miniapp/src/pages/index/styles/overlays.css`
- Modify: `miniapp/src/pages/index/styles/responsive.css`
- Modify: `miniapp/tests/portrait-css.test.js`

**Interfaces:**
- Consumes: Task 2 输出的 `.skill-picker__categories`、`.skill-picker__category`、`.skill-picker__category--active`。
- Produces: 44px 触控分类横条、稳定选中填充、320px 安全边距和 iPad 紧凑居中布局。

- [ ] **Step 1: 写样式失败测试**

断言分类按钮最小高度 `var(--touch-target)`、原生 Button 重置、选中填充、横向安全滚动和 320px 无固定超宽值。

- [ ] **Step 2: 运行测试确认失败**

Run: `npm --prefix miniapp test -- --run tests/portrait-css.test.js`

Expected: FAIL，分类样式尚不存在。

- [ ] **Step 3: 实现视觉层级**

分类栏放在标题与搜索之间；单行横向滚动、不换行。未选中使用无边框浅底，选中使用 `var(--result)` 深色填充和白字；不为四种分类使用四套装饰色。

```css
.skill-picker__category {
  min-height: var(--touch-target);
  margin: 0;
  padding: 0 12px;
  border: 0;
  background: var(--surface-muted);
}

.skill-picker__category--active {
  background: var(--result);
  color: #fff;
}
```

- [ ] **Step 4: 手机与 iPad 响应式调整**

手机分类栏保持左右 14px 安全边距并允许横向滚动；iPad 限制内容宽度但不改变分类顺序和操作逻辑。分类栏、搜索框和技能行左右边缘误差不超过 2px（手机）或 3px（iPad）。

- [ ] **Step 5: 运行定向测试并提交**

Run: `npm --prefix miniapp test -- --run tests/portrait-css.test.js tests/skill-slots.test.jsx`

Expected: PASS。

Commit: `style(miniapp): align skill picker categories`

### Task 4: 全交互与真实微信验收

**Files:**
- Modify: `scripts/miniapp/verify-interaction-matrix.mjs`
- Modify: `scripts/miniapp/verify-portrait-layout.mjs`
- Modify: `design-qa.md`
- Create: `artifacts/2026-08-10-skill-picker-categories/*.png`

**Interfaces:**
- Consumes: Tasks 1–3 的筛选逻辑和视觉实现。
- Produces: 手机/iPad交互证据、17视口几何结果、微信生产包和同状态原生截图。

- [ ] **Step 1: 扩展交互矩阵**

手机和 iPad 均验证：打开不弹键盘、分类唯一选中、物理/魔法/变化/防御结果正确、活动分类二次点击回到全部、拼音搜索、分类与搜索交集、选择后关闭、再次打开已复原。

- [ ] **Step 2: 扩展几何门禁**

在 320–1366px 的 17 个视口检查分类按钮触控尺寸、分类栏/搜索框/技能行左右边缘、横向溢出、文字裁剪和弹层安全区。

- [ ] **Step 3: 运行全量测试和 H5 中间验证**

Run: `npm run miniapp:test && npm --prefix miniapp run build:h5 && node scripts/miniapp/verify-interaction-matrix.mjs && node scripts/miniapp/verify-portrait-layout.mjs`

Expected: 0 failed；手机与 iPad交互通过；17个视口横向溢出均为 0。

- [ ] **Step 4: 生成微信生产包**

Run: `npm run miniapp:build:prod`

Expected: release gate PASS，主包低于 2 MiB，版本仍为 `0.1.1`。

- [ ] **Step 5: 微信开发者工具原生验收**

在 390px 手机与 768/820px iPad尺寸分别截取“全部”“物理”“分类+搜索”“空结果”“当前已选”五种状态；控制台 0 error，分类栏无裁剪，点击后选中填充立即更新，关闭和遮罩点击均有效。

- [ ] **Step 6: 对照参考稿并更新 QA**

把用户截图与真实微信截图按相同裁剪并排检查；所有结构、文字、状态、裁剪与行为项通过后，更新 `design-qa.md` 的构建哈希、截图路径和最终结论。

- [ ] **Step 7: 提交交付**

Run: `git diff --check && git status --short`

Expected: 只包含本功能相关源码、测试、计划和 QA；保留现有 `miniapp/project.config.json` 与 `artifacts/` 用户改动。

Commit: `test(miniapp): verify categorized skill picker`
