# Team Defensive Type Analysis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有六人队伍编辑抽屉中新增可展开的整队防守属性分析，准确统计每个属性下的弱点、抗性、普通承伤和成员明细。

**Architecture:** 新增纯领域函数，将队伍成员的稳定精灵 ID 映射到快照属性，并复用现有 `getTypeMultiplier()` 聚合 18 属性结果；新增独立展示组件，在 `TeamDrawer` 的成员编辑区通过“成员配置／队伍分析”分段切换。分析结果完全派生，不修改队伍存储 schema、主伤害引擎或现有结果栏属性分析。

**Tech Stack:** React 18、JavaScript ES Modules、Vitest、Testing Library、现有 Phosphor 图标与本地 `ElementIcon`。

**Spec:** `docs/superpowers/specs/2026-08-21-team-defensive-type-analysis-design.md`

## Global Constraints

- 只统计当前队伍中配置有效的成员，队伍槽位固定为 6。
- 双属性精灵对一个进攻属性只计一次最终倍率。
- 属性倍率必须复用 `snapshot.typeChart` 与 `getTypeMultiplier()`，不得复制属性表。
- 不修改 `TEAM_SCHEMA_VERSION`、队伍本地存储、分享结构和伤害计算公式。
- 不增加运行时依赖，不修改小程序代码。
- 本轮不实现整队进攻覆盖和 6×6 对位矩阵。
- 现有未提交改动属于其他任务；实现时只暂存本计划列出的文件。

---

## File Map

- Create `src/domain/team-type-analysis.js`: 队伍成员解析、18 属性聚合、稳定排序。
- Create `tests/domain/team-type-analysis.test.js`: 领域口径、样例队伍、空位和失效成员回归。
- Create `src/components/TeamTypeAnalysisPanel.jsx`: 重点风险／全部属性、属性行和成员明细。
- Create `tests/ui/team-type-analysis-panel.test.jsx`: 组件内容、展开、空状态和无障碍测试。
- Reference `docs/images/team-defensive-type-analysis-mock.png`: UI 层级、密度、颜色与图标化基准，不作为运行时资源打包。
- Modify `src/components/TeamDrawer.jsx`: 增加“成员配置／队伍分析”局部页签并传入当前队伍。
- Modify `tests/ui/team-drawer.test.jsx`: 抽屉切换、实时刷新和切队回归。
- Modify `src/styles.css`: 桌面、窄屏、移动端、深色模式样式。
- Modify `src/data/user-release-notes.js`: 发布时加入用户可见的一条功能说明。

### Task 1: 队伍防守属性聚合器

**Files:**
- Create: `src/domain/team-type-analysis.js`
- Create: `tests/domain/team-type-analysis.test.js`
- Read: `src/domain/type-chart.js:1-177`

**Interfaces:**
- Consumes: `ELEMENT_TYPES`、`getTypeMultiplier(attackType, defenderTypes, chart)`。
- Produces: `analyzeTeamDefensiveTypes({ members, spirits, typeChart })`。
- Return shape:

```js
{
  configuredCount: 6,
  skippedCount: 0,
  rows: [{
    type: "电",
    weakCount: 2,
    resistanceCount: 1,
    neutralCount: 3,
    immunityCount: 0,
    weakMembers: [{ slotIndex: 3, spiritId: "...", name: "圣水守护", multiplier: 2 }],
    resistantMembers: [{ slotIndex: 0, spiritId: "...", name: "伊兰亚龙", multiplier: 0.5 }],
    immuneMembers: [],
  }],
  riskRows: [],
}
```

- [ ] **Step 1: 写最终倍率聚合的失败测试**

```js
import { describe, expect, test } from "vitest";
import { analyzeTeamDefensiveTypes } from "../../src/domain/team-type-analysis.js";

const spirits = [
  { id: "water", fullName: "水灵", types: ["水"] },
  { id: "water-ground", fullName: "水地灵", types: ["水", "地"] },
  { id: "dragon", fullName: "龙灵", types: ["龙"] },
];

test("counts each member once using the final dual-type multiplier", () => {
  const result = analyzeTeamDefensiveTypes({
    members: [
      { spiritId: "water" },
      { spiritId: "water-ground" },
      { spiritId: "dragon" },
      null,
      null,
      null,
    ],
    spirits,
  });
  const grass = result.rows.find((row) => row.type === "草");
  expect(grass).toMatchObject({
    weakCount: 2,
    resistanceCount: 1,
    neutralCount: 0,
  });
  expect(grass.weakMembers).toEqual([
    expect.objectContaining({ name: "水灵", multiplier: 2 }),
    expect.objectContaining({ name: "水地灵", multiplier: 3 }),
  ]);
});
```

- [ ] **Step 2: 运行领域测试并确认失败**

Run: `npm test -- --run tests/domain/team-type-analysis.test.js`

Expected: FAIL，提示 `team-type-analysis.js` 或导出函数不存在。

- [ ] **Step 3: 实现最小聚合器**

```js
import { ELEMENT_TYPES, getTypeMultiplier } from "./type-chart.js";

function memberRecord(member, index, spiritMap) {
  if (!member || member.needsRepair) return null;
  const spirit = spiritMap.get(member.spiritId);
  if (!spirit || !Array.isArray(spirit.types) || spirit.types.length === 0) {
    return null;
  }
  return {
    slotIndex: index,
    spiritId: spirit.id,
    name: spirit.fullName,
    types: spirit.types,
  };
}

export function analyzeTeamDefensiveTypes({ members = [], spirits = [], typeChart }) {
  const spiritMap = new Map(spirits.map((spirit) => [spirit.id, spirit]));
  const configured = members
    .map((member, index) => memberRecord(member, index, spiritMap))
    .filter(Boolean);
  const occupiedCount = members.filter(Boolean).length;
  const rows = ELEMENT_TYPES.map((type, order) => {
    const matchups = configured.map((member) => ({
      ...member,
      multiplier: getTypeMultiplier(type, member.types, typeChart),
    }));
    const weakMembers = matchups.filter(({ multiplier }) => multiplier > 1);
    const resistantMembers = matchups.filter(
      ({ multiplier }) => multiplier > 0 && multiplier < 1,
    );
    const immuneMembers = matchups.filter(({ multiplier }) => multiplier === 0);
    return {
      immunityCount: immuneMembers.length,
      immuneMembers,
      neutralCount: matchups.filter(({ multiplier }) => multiplier === 1).length,
      order,
      resistanceCount: resistantMembers.length,
      resistantMembers,
      type,
      weakCount: weakMembers.length,
      weakMembers,
    };
  });
  const riskRows = rows
    .filter(({ weakCount }) => weakCount > 0)
    .sort((left, right) =>
      right.weakCount - left.weakCount ||
      right.weakMembers.filter(({ multiplier }) => multiplier === 3).length -
        left.weakMembers.filter(({ multiplier }) => multiplier === 3).length ||
      left.resistanceCount - right.resistanceCount ||
      left.order - right.order,
    );
  return {
    configuredCount: configured.length,
    riskRows,
    rows,
    skippedCount: occupiedCount - configured.length,
  };
}
```

- [ ] **Step 4: 增加截图队伍固定验收样例**

测试夹具使用伊兰亚龙、飞飞钥、友爱星飞、圣水守护、彩蝶鲨、白金独角兽的实际属性，断言：

```js
expect(row("电")).toMatchObject({ weakCount: 2, resistanceCount: 1 });
expect(row("草")).toMatchObject({ weakCount: 2, resistanceCount: 2 });
expect(row("冰")).toMatchObject({ weakCount: 2, resistanceCount: 1 });
expect(row("火")).toMatchObject({ weakCount: 1, resistanceCount: 3 });
```

- [ ] **Step 5: 覆盖空位、失效形态、快照矩阵和数量守恒**

每一行断言：

```js
expect(
  row.weakCount + row.resistanceCount + row.neutralCount + row.immunityCount,
).toBe(result.configuredCount);
```

并确认 `needsRepair`、未知 `spiritId` 进入 `skippedCount` 而不抛异常。

- [ ] **Step 6: 运行测试并提交**

Run: `npm test -- --run tests/domain/team-type-analysis.test.js tests/domain/type-chart.test.js`

Expected: PASS。

```bash
git add src/domain/team-type-analysis.js tests/domain/team-type-analysis.test.js
git commit -m "feat: add team defensive type analysis"
```

### Task 2: 队伍分析展示组件

**Files:**
- Create: `src/components/TeamTypeAnalysisPanel.jsx`
- Create: `tests/ui/team-type-analysis-panel.test.jsx`
- Read: `src/components/ElementIcon.jsx`

**Interfaces:**
- Consumes: Task 1 的分析结果对象。
- Produces: `<TeamTypeAnalysisPanel analysis={analysis} />`，视觉目标见 `docs/images/team-defensive-type-analysis-mock.png`。

- [ ] **Step 1: 写重点风险和展开明细的失败测试**

```jsx
render(<TeamTypeAnalysisPanel analysis={analysis} />);
expect(screen.getByRole("region", { name: "队伍防守面" })).toBeVisible();
expect(screen.getByText("6/6")).toBeVisible();
expect(screen.getByRole("button", { name: /电.*弱点 2.*抗性 1/ })).toBeVisible();
expect(screen.queryByText("圣水守护 ×2")).not.toBeInTheDocument();
await user.click(screen.getByRole("button", { name: /电.*弱 2.*抗 1/ }));
expect(screen.getByText("圣水守护 ×2")).toBeVisible();
expect(screen.getByText("彩蝶鲨 ×3")).toBeVisible();
```

- [ ] **Step 2: 运行组件测试并确认失败**

Run: `npm test -- --run tests/ui/team-type-analysis-panel.test.jsx`

Expected: FAIL，提示组件不存在。

- [ ] **Step 3: 实现紧凑属性行**

组件内部实现：

```jsx
function TypeSummaryRow({ expanded, onToggle, row }) {
  return (
    <li className="team-type-row" data-expanded={expanded || undefined}>
      <button
        aria-expanded={expanded}
        aria-label={`${row.type}，弱点 ${row.weakCount} 只，抗性 ${row.resistanceCount} 只，${expanded ? "收起" : "展开"}成员明细`}
        className="team-type-row__summary"
        onClick={onToggle}
        type="button"
      >
        <ElementIcon label size={28} type={row.type} />
        <span className="team-type-row__name">{row.type}</span>
        <span aria-hidden="true" className="team-type-row__weak"><ShieldWarning /> <b>{row.weakCount}</b></span>
        <span aria-hidden="true" className="team-type-row__resist"><ShieldCheck /> <b>{row.resistanceCount}</b></span>
        <MultiplierChips row={row} />
        <CaretDown aria-hidden="true" />
      </button>
      {expanded ? <MemberMatchupDetails row={row} /> : null}
    </li>
  );
}
```

倍率分组通过成员数组计算，显示 `×3·1`、`×2·1`、`×0.5·1` 等可解释芯片，不计算平均倍率或综合分。所有成员名称前显示紧凑槽位号 `${slotIndex + 1}`。

- [ ] **Step 4: 实现重点风险／全部属性切换与空状态**

```jsx
const [mode, setMode] = useState("risk");
const rows = mode === "risk" ? analysis.riskRows : analysis.rows;
```

空队伍显示“添加精灵后查看”；`skippedCount > 0` 只显示警告图标，Tooltip 为“跳过 N 个失效成员”。切换模式不能清除已展开属性。

- [ ] **Step 5: 运行组件测试并提交**

Run: `npm test -- --run tests/ui/team-type-analysis-panel.test.jsx`

Expected: PASS。

```bash
git add src/components/TeamTypeAnalysisPanel.jsx tests/ui/team-type-analysis-panel.test.jsx
git commit -m "feat: show team type analysis panel"
```

### Task 3: 接入队伍抽屉并实时刷新

**Files:**
- Modify: `src/components/TeamDrawer.jsx:32-253`
- Modify: `tests/ui/team-drawer.test.jsx:1-360`

**Interfaces:**
- Consumes: `analyzeTeamDefensiveTypes()`、`TeamTypeAnalysisPanel`。
- Produces: 队伍抽屉局部 `paneMode: "member" | "analysis"`。

- [ ] **Step 1: 写抽屉页签失败测试**

```jsx
await user.click(screen.getByRole("button", { name: "新建队伍" }));
expect(screen.getByRole("button", { name: "成员配置" })).toHaveAttribute(
  "aria-pressed",
  "true",
);
await user.click(screen.getByRole("button", { name: "队伍分析" }));
expect(screen.getByRole("region", { name: "队伍防守面" })).toBeVisible();
expect(screen.queryByRole("region", { name: "成员 1 配置" })).not.toBeInTheDocument();
```

- [ ] **Step 2: 运行抽屉测试并确认失败**

Run: `npm test -- --run tests/ui/team-drawer.test.jsx`

Expected: FAIL，找不到“队伍分析”。

- [ ] **Step 3: 在 TeamDrawer 派生分析结果**

```jsx
const [paneMode, setPaneMode] = useState("member");
const teamAnalysis = useMemo(
  () =>
    analyzeTeamDefensiveTypes({
      members: activeTeam?.members ?? [],
      spirits: snapshot.spirits ?? [],
      typeChart: snapshot.typeChart,
    }),
  [activeTeam?.members, snapshot.spirits, snapshot.typeChart],
);
```

切换队伍时保留 `paneMode`，但由 `TeamTypeAnalysisPanel` 通过 `key={activeTeam.id}` 重置展开状态。

- [ ] **Step 4: 增加右侧分段按钮并条件渲染**

```jsx
<div aria-label="队伍面板" className="team-drawer__pane-switch" role="group">
  <button aria-label="成员配置" aria-pressed={paneMode === "member"} onClick={() => setPaneMode("member")}><Users />成员</button>
  <button aria-label="队伍分析" aria-pressed={paneMode === "analysis"} onClick={() => setPaneMode("analysis")}><ChartBar />分析</button>
</div>
```

`paneMode === "member"` 时保留现有存攻方／存防方和 `TeamMemberEditor`；分析模式只渲染 `TeamTypeAnalysisPanel`，避免两套内容同时撑高抽屉。

- [ ] **Step 5: 验证成员变化立即更新**

在测试中进入分析模式，记录“草”的弱点数；切回成员配置更换精灵，再回到分析模式，断言计数已改变且无需关闭抽屉。

- [ ] **Step 6: 运行回归并提交**

Run: `npm test -- --run tests/ui/team-drawer.test.jsx tests/ui/team-type-analysis-panel.test.jsx tests/state/team-presets.test.js`

Expected: PASS。

```bash
git add src/components/TeamDrawer.jsx tests/ui/team-drawer.test.jsx
git commit -m "feat: integrate team analysis into drawer"
```

### Task 4: 图标化、响应式、深色模式与信息层级

**Files:**
- Modify: `src/styles.css:2638-2909`
- Modify: `src/styles.css:3754-3756`
- Modify: `src/styles.css:6657-6734`
- Modify: `src/styles.css:7377-7451`
- Test: `tests/ui/team-type-analysis-panel.test.jsx`

**Interfaces:**
- Consumes: Task 2 的 `team-type-*` 类名。
- Produces: 桌面双栏内紧凑行、窄屏折行、深色模式可读性。

- [ ] **Step 1: 增加语义 CSS**

```css
.team-type-analysis { display: grid; gap: 12px; min-width: 0; }
.team-type-analysis__list { border: 1px solid var(--line); border-radius: 10px; overflow: clip; }
.team-type-row + .team-type-row { border-top: 1px solid var(--line); }
.team-type-row__summary { align-items: center; display: grid; grid-template-columns: 28px minmax(36px, 1fr) auto auto minmax(0, auto) 20px; gap: 8px; min-height: 44px; width: 100%; }
.team-type-row__weak { color: var(--attack); }
.team-type-row__resist { color: var(--success); }
.team-type-row__details { border-top: 1px solid var(--line); display: grid; gap: 6px; padding: 8px 10px; }
```

使用项目现有变量的真实名称；如果 `--success` 不存在，复用当前 `.type-analysis-chip[data-tone="resistance"]` 使用的颜色，不新建另一套绿色。

- [ ] **Step 2: 增加窄屏折行**

在现有队伍抽屉响应式断点内：低于 900px 时队伍名单与分析改为同级页签，不再强行双栏；390px 下 `.team-type-row__summary` 改为两行，倍率芯片进入第二行；最小点击区域保持 44px。

- [ ] **Step 3: 增加深色模式与焦点状态**

为属性行、展开区、分段按钮添加深色背景、边框和 `:focus-visible`；红绿图标、数字和倍率芯片在深色模式下仍需清晰，文本对比度不得依赖浅色背景。测试使用 `document.documentElement.dataset.theme = "dark"` 后断言关键文本仍存在且控件可聚焦。

- [ ] **Step 4: 运行 UI 测试并做四视口截图验收**

Run: `npm test -- --run tests/ui/team-type-analysis-panel.test.jsx tests/ui/team-drawer.test.jsx`

Visual viewports:

```text
1440×900  完整六人队伍，重点风险
1024×768  抽屉双栏不溢出
390×844   属性摘要折行、展开成员可滚动
1440×900  深色模式
```

逐张与 `docs/images/team-defensive-type-analysis-mock.png` 对照，重点检查：没有综合倍率、没有重复“弱／抗”文字、官方属性图标未拉伸、成员名和倍率不截断。

- [ ] **Step 5: 提交样式**

```bash
git add src/styles.css tests/ui/team-type-analysis-panel.test.jsx
git commit -m "style: refine team type analysis layout"
```

### Task 5: 发布说明与全量验收

**Files:**
- Modify: `src/data/user-release-notes.js`
- Verify only: `src/state/team-presets.js`
- Verify only: `src/domain/calculator-view-model.js`

**Interfaces:**
- Consumes: 完成后的队伍分析功能。
- Produces: 用户可见版本记录和发布门禁结果。

- [ ] **Step 1: 增加精简发布说明**

加入一条：

```text
队伍编辑新增防守属性分析：按 18 种属性统计整队弱点、抗性与具体成员，双属性使用最终倍率计算。
```

- [ ] **Step 2: 运行定向测试**

Run:

```text
npm test -- --run tests/domain/team-type-analysis.test.js tests/domain/type-chart.test.js tests/ui/team-type-analysis-panel.test.jsx tests/ui/team-drawer.test.jsx tests/state/team-presets.test.js
```

Expected: 全部 PASS。

- [ ] **Step 3: 运行项目回归门禁**

Run:

```text
npm run data:validate
npm test
npm run acceptance:verify
npm run e2e
npm run build
git diff --check
```

Expected: 全部退出码 0；队伍存储、主结果栏属性分析和伤害测试无回归。

- [ ] **Step 4: 人工验收截图队伍**

建立六人队伍：伊兰亚龙、飞飞钥、友爱星飞、圣水守护、彩蝶鲨、白金独角兽，确认：

```text
电：弱2、抗1
草：弱2、抗2
冰：弱2、抗1
火：弱1、抗3
```

逐项展开核对成员名称与 ×3／×2／×0.5／×0.25；删除一名成员后所有行的分类合计变为 5。

- [ ] **Step 5: 检查改动边界并提交**

Run:

```text
git status --short
git diff -- src/domain/team-type-analysis.js src/components/TeamTypeAnalysisPanel.jsx src/components/TeamDrawer.jsx src/styles.css tests/domain/team-type-analysis.test.js tests/ui/team-type-analysis-panel.test.jsx tests/ui/team-drawer.test.jsx src/data/user-release-notes.js
```

确认没有暂存其他任务的脏文件，然后：

```bash
git add src/domain/team-type-analysis.js src/components/TeamTypeAnalysisPanel.jsx src/components/TeamDrawer.jsx src/styles.css tests/domain/team-type-analysis.test.js tests/ui/team-type-analysis-panel.test.jsx tests/ui/team-drawer.test.jsx src/data/user-release-notes.js
git commit -m "feat: add team defensive type analysis"
```

## Self-Review

- Spec coverage: 队伍聚合、倍率口径、UI、展开明细、空位、失效成员、响应式、深色模式和回归均有对应任务。
- Placeholder scan: 无 TBD、TODO 或未定义的“类似处理”。
- Type consistency: 所有任务统一使用 `analyzeTeamDefensiveTypes({ members, spirits, typeChart })` 和 `TeamTypeAnalysisPanel({ analysis })`。
- Scope check: 本计划只交付单队防守属性分析；整队进攻覆盖和 6×6 对位矩阵明确留待独立计划。
