# 配置库清单预览与导入统计收敛 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 导出前可展开核对精灵、性格和四技能，导入时只突出三项实际写入统计并收拢兼容性问题。

**Architecture:** 保持配置库编解码与 JSON 结构不变，由 `ConfigLibraryDialog` 使用只读的 `exportSummary.library.entries` 和当前 `snapshot` 生成展示名称。导入预览继续使用现有 `parsed.preview`，仅重组信息层级和文案。

**Tech Stack:** React 19、Vitest、Testing Library、CSS、Playwright

## Global Constraints

- 不修改配置库 JSON 格式、导出筛选规则、导入合并规则或存储结构。
- 不修改收藏、自动识别、特性迁移和队伍数据。
- 导出清单中找不到名称时显示稳定 ID，不能阻止导出。
- 导入异常项为零时显示检查通过；存在问题时只展示非零项。
- 展开按钮必须支持键盘并提供 `aria-expanded`。

---

### Task 1: 导出精灵与四技能清单

**Files:**
- Modify: `tests/ui/config-library-dialog.test.jsx`
- Modify: `src/components/ConfigLibraryDialog.jsx`
- Modify: `src/App.jsx`

**Interfaces:**
- Consumes: `exportSummary.library.entries: Array<{ spiritId, natureId, skills: Array<string|null> }>`、`snapshot.spirits`、`snapshot.skills`
- Produces: `ConfigLibraryDialog` 的 `snapshot` 属性，以及名为“查看精灵和技能”的展开按钮

- [ ] **Step 1: 写导出清单失败测试**

在 `tests/ui/config-library-dialog.test.jsx` 中传入两只精灵、性格和技能快照，点击“查看精灵和技能”后断言精灵名称、性格名称、四个技能名称及空槽出现，并断言按钮 `aria-expanded="true"`。

```jsx
fireEvent.click(screen.getByRole("button", { name: "查看精灵和技能" }));
expect(screen.getByText("音速犬")).toBeVisible();
expect(screen.getByText("固执")).toBeVisible();
expect(screen.getByText("烈焰冲锋")).toBeVisible();
expect(screen.getByText("空")).toBeVisible();
```

- [ ] **Step 2: 运行测试并确认因缺少展开入口失败**

Run: `npx vitest run tests/ui/config-library-dialog.test.jsx`

Expected: FAIL，找不到“查看精灵和技能”。

- [ ] **Step 3: 实现最小导出清单**

在 `ConfigLibraryDialog.jsx` 中：

```jsx
const [exportExpanded, setExportExpanded] = useState(false);
const spiritById = new Map((snapshot?.spirits ?? []).map((item) => [item.id, item]));
const skillById = new Map((snapshot?.skills ?? []).map((item) => [item.id, item]));
```

以原生按钮切换展开状态；从 `exportSummary.library.entries` 逐项显示 `fullName`、`getNature(natureId).name` 和四个技能名称。头像读取 `spirit.asset.localUrl`，缺失时不渲染图片但保留文本。

在 `src/App.jsx` 的 `overlayProps.configLibrary` 中增加：

```jsx
snapshot,
```

- [ ] **Step 4: 运行组件测试并确认通过**

Run: `npx vitest run tests/ui/config-library-dialog.test.jsx`

Expected: PASS。

### Task 2: 收敛导入统计并解释重复口径

**Files:**
- Modify: `tests/ui/config-library-dialog.test.jsx`
- Modify: `src/components/ConfigLibraryDialog.jsx`

**Interfaces:**
- Consumes: `parsed.preview` 中现有八个数值
- Produces: 三项核心统计、可展开的“检查详情”、零异常通过状态

- [ ] **Step 1: 写导入层级失败测试**

新增两个用例：

```jsx
expect(screen.getByText("覆盖本机配置")).toBeVisible();
expect(screen.queryByText("失效技能槽")).not.toBeInTheDocument();
fireEvent.click(screen.getByRole("button", { name: /检查详情/ }));
expect(screen.getByText("文件内重复")).toBeVisible();
expect(screen.getByText(/采用最后一条有效配置/)).toBeVisible();
```

零异常用例断言：

```jsx
expect(screen.getByText("检查通过，未发现兼容问题")).toBeVisible();
expect(screen.queryByRole("button", { name: /检查详情/ })).not.toBeInTheDocument();
```

- [ ] **Step 2: 运行测试并确认旧八宫格导致失败**

Run: `npx vitest run tests/ui/config-library-dialog.test.jsx`

Expected: FAIL，旧 UI 仍直接显示全部异常项且文案为“覆盖配置”“重复精灵”。

- [ ] **Step 3: 实现三项核心统计和异常详情**

把常量拆为：

```js
const PRIMARY_PREVIEW_ROWS = [
  ["added", "新增配置"],
  ["overwritten", "覆盖本机配置"],
  ["favoritesAdded", "新增收藏"],
];
const ISSUE_PREVIEW_ROWS = [
  ["missingSpirits", "缺失精灵"],
  ["missingSkills", "失效技能槽"],
  ["unknownTraitFields", "未知特性字段"],
  ["invalidEntries", "无效配置"],
  ["duplicateEntries", "文件内重复"],
];
```

只对非零异常渲染详情；`duplicateEntries > 0` 时显示“同一精灵在文件内出现多次，采用最后一条有效配置”。

- [ ] **Step 4: 运行组件测试并确认通过**

Run: `npx vitest run tests/ui/config-library-dialog.test.jsx`

Expected: PASS。

### Task 3: 响应式样式与真实流程回归

**Files:**
- Modify: `src/styles.css`
- Modify: `e2e/uiux-team-presets.spec.js`

**Interfaces:**
- Consumes: Task 1 和 Task 2 的语义类名与按钮文案
- Produces: 桌面及 390px 下无溢出的滚动清单和导入检查详情

- [ ] **Step 1: 写端到端失败断言**

在现有配置库导入导出用例中增加：导出弹窗展开后至少显示一只真实精灵及技能；导入后首屏看不到零值异常栏位。

```js
await page.getByRole("button", { name: "查看精灵和技能" }).click();
await expect(page.locator(".config-library-entry").first()).toBeVisible();
await expect(page.getByText("检查通过，未发现兼容问题")).toBeVisible();
```

- [ ] **Step 2: 运行端到端用例并确认样式或入口尚未满足**

Run: `npx playwright test e2e/uiux-team-presets.spec.js -g "favorite configuration library"`

Expected: FAIL，展开清单或检查通过提示尚未存在。

- [ ] **Step 3: 添加最小响应式样式**

在 `src/styles.css` 中为清单设置固定头像、两列信息布局、技能换行、`max-height` 和 `overflow-y: auto`；在窄窗口改为单列，保持弹窗无横向滚动。

- [ ] **Step 4: 执行完整验证**

Run:

```text
npx vitest run tests/ui/config-library-dialog.test.jsx tests/ui/app-integration.test.jsx
npm test
npm run e2e
npm run build
git diff --check
```

Expected: 全部通过；生产数据仍为 592 只精灵、553 个技能。

- [ ] **Step 5: 提交实现**

```bash
git add src/App.jsx src/components/ConfigLibraryDialog.jsx src/styles.css tests/ui/config-library-dialog.test.jsx e2e/uiux-team-presets.spec.js
git commit -m "feat: preview configuration library contents"
```
