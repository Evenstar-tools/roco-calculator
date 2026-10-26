import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { ComparisonDamage, ComparisonStatus, ComparisonSummary } from "../../src/features/balance-comparison/ComparisonResults.jsx";

const result = (damage, extra = {}) => ({ status: "exact", totalDamage: damage,
  hpPercent: damage / 4, remainingHp: 400 - damage, lethal: damage >= 400, ...extra });
const comparison = (before, after, extra = {}) => ({ active: true,
  beforeLabel: "S4 正式数据", afterLabel: "自定义试算",
  beforeView: { result: { defenderHp: 400, selectedResult: before } },
  afterView: { result: { defenderHp: 400, selectedResult: after } }, ...extra });

test("main comparison distinguishes relative damage change, HP percentage points and custom source", () => {
  render(<ComparisonSummary comparison={comparison(result(50), result(68), {
    changes: [{ entityId: "dimo", entityName: "迪莫", label: "物攻种族值", before: 80, after: 100 }],
  })} />);
  expect(screen.getByText("S4 正式数据")).toBeVisible();
  expect(screen.getByText("自定义试算")).toBeVisible();
  expect(screen.getByText("伤害增加 18 HP")).toBeVisible();
  expect(screen.getByText("+36.0%")).toBeVisible();
  expect(screen.getByText("生命占比 +4.5 个百分点")).toBeVisible();
  expect(screen.getByText("剩余 350 HP")).toBeVisible();
  expect(screen.getByText("剩余 332 HP")).toBeVisible();
  expect(screen.getByText("迪莫 · 物攻种族值：80 → 100")).toBeInTheDocument();
});

test.each([[0, 50, "新增伤害"], [0, 0, "无变化"], [50, 50, "无变化"], [100, 75, "-25.0%"]])(
  "row %d → %d displays %s without division by zero", (before, after, label) => {
    const { container } = render(<ComparisonDamage before={result(before)} after={result(after)} />);
    expect(container).toHaveTextContent(`${before} → ${after}`);
    expect(container).toHaveTextContent(label);
    expect(container).not.toHaveTextContent(/Infinity|NaN/);
  },
);

test("settled status HP loss is included but freeze threshold remains separate", () => {
  const before = result(200);
  const after = result(200, { negativeStatusSettlement: {
    maxHp: 400, actualStatusDamage: 40, remainingHp: 160, lethal: false,
    freeze: { thresholdPercent: 15, lethal: false },
    breakdown: [{ id: "burn", damage: 40, stacks: 2 }],
  } });
  render(<ComparisonSummary comparison={comparison(before, after)} />);
  expect(screen.getByText("伤害增加 40 HP")).toBeVisible();
  expect(screen.getByText("+20.0%")).toBeVisible();
  expect(screen.getByText("占最大生命 60.0%")).toBeVisible();
  expect(screen.getByText("生命占比 +10.0 个百分点")).toBeVisible();
  expect(screen.getByText("冻结斩杀线 15% · 不额外扣血")).toBeVisible();
  expect(screen.getByText("剩余 160 HP")).toBeVisible();
});

test("freeze-only KO changes the outcome without presenting threshold as new damage", () => {
  const after = result(340, { negativeStatusSettlement: {
    maxHp: 400, actualStatusDamage: 0, remainingHp: 60, lethal: true,
    freeze: { thresholdPercent: 15, lethal: true },
  } });
  render(<ComparisonSummary comparison={comparison(result(340), after)} />);
  expect(screen.getByText("伤害无变化")).toBeVisible();
  expect(screen.getByText("生命占比 0.0 个百分点")).toBeVisible();
  expect(screen.getByText("本次可击倒 · 冻结斩杀")).toBeVisible();
  expect(screen.getByText("剩余 60 HP")).toBeVisible();
});

test("pure status skill compares settled damage and preserves freeze-only zero", () => {
  const before = result(0, { statusOnly: true, negativeStatusSettlement: {
    maxHp: 400, actualStatusDamage: 0, remainingHp: 400, lethal: false,
    freeze: { thresholdPercent: 10 },
  } });
  const after = result(0, { statusOnly: true, negativeStatusSettlement: {
    maxHp: 400, actualStatusDamage: 20, remainingHp: 380, lethal: false,
    freeze: { thresholdPercent: 10 },
  } });
  const { container } = render(<ComparisonDamage before={before} after={after} />);
  expect(container).toHaveTextContent("0 → 20");
  expect(container).toHaveTextContent("新增伤害");
});

test("unverified rule is an unavailable result rather than an unchanged pair", () => {
  render(<ComparisonSummary comparison={comparison(result(50), {
    status: "unsupported", reason: "新特性规则待核验", totalDamage: 50,
  })} />);
  expect(screen.getByText("当前不可对比")).toBeVisible();
  expect(screen.getByText("新特性规则待核验")).toBeVisible();
  expect(screen.queryByText("伤害无变化")).not.toBeInTheDocument();
});

test("explicit blocker wins over numeric results for summary and rows", () => {
  const state = comparison(result(50), result(50), { issue: { reason: "旧版技能不存在" } });
  const { container } = render(<><ComparisonSummary comparison={state} />
    <ComparisonDamage before={result(50)} after={result(50)} issue={state.issue} /></>);
  expect(container).toHaveTextContent("旧版技能不存在");
  expect(container).not.toHaveTextContent("50 → 50");
});

test("comparison does not show when switched off", () => {
  const { container } = render(<><ComparisonSummary comparison={{ active: false }} />
    <ComparisonStatus comparison={{ active: false }} /></>);
  expect(container).toBeEmptyDOMElement();
});
