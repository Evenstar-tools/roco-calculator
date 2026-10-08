import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import ResultSheet from "../src/components/ResultSheet.jsx";
import ResultFormulaAudit from "../src/components/ResultFormulaAudit.jsx";

test("结果栏无增益不占行，有增益只显示普通文本", () => {
  const view = { status: "exact", rows: [], selectedResult: { skillName: "折射", totalDamage: 100, hpPercent: 25 } };
  const { container, rerender } = render(<ResultSheet open view={view} />);
  expect(container.querySelector(".result-sheet__gains")).toBeNull();
  rerender(<ResultSheet open view={{ ...view, selectedResult: { ...view.selectedResult, gainSummary: "折射×2 · 夺目" } }} />);
  expect(screen.getByLabelText("计算条件").textContent).toContain("增益来源　折射×2 · 夺目");
  expect(container.querySelector(".result-sheet__summary .result-sheet__gains")).toBeNull();
  rerender(<ResultSheet open view={{ status: "unresolved", rows: [], selectedResult: { skillName: "力量增效", gainSummary: "力量增效×1" } }} />);
  expect(screen.getByLabelText("计算条件").textContent).toContain("力量增效×1");
});

test("公式原项带来源，不再重复使用摘要和下次预览", () => {
  const source = { kind: "skill", id: "coax", name: "撒娇", count: 1, amount: 10 };
  const result = { status: "exact", skillName: "折射", totalDamage: 100,
    usageSummary: { count: 1, nextHint: "本次可得：不要重复" },
    gainSources: { fixed: [source], attack: [{ ...source, name: "折射", amount: 3 }] },
    formulaSteps: [{ label: "基础威力", before: 50, after: 50 }, { label: "固定威力增加", input: 10 }, { label: "攻击面板", input: "magicalAttack", after: 260 }] };
  const { container } = render(<ResultFormulaAudit result={result} />);
  expect(screen.getByText("撒娇×1")).toBeTruthy();
  expect(screen.getByText("魔攻 · +3层（折射×1）")).toBeTruthy();
  expect(container.querySelector(".skill-usage")).toBeNull();
  expect(screen.queryByText(/本次可得/)).toBeNull();
});

test("顺风与雨天按真实基数加算，保留两处真实取整并精简单段结果", () => {
  const result = {
    skillName: "水刃", staticPower: 115, totalDamage: 211, hitCount: 1,
    gainSources: { powerPercent: [{ name: "顺风", amount: 0.5 }, { name: "雨天", amount: 0.75 }] },
    formulaSteps: [
      { label: "基础威力", input: 115, before: 115, after: 115 },
      { label: "技能威力百分比", input: [0.5, 0.75], before: 115, after: 258 },
      { label: "本系", input: 1, before: 258, after: 258 },
      { label: "属性克制", before: 258, after: 129 },
      { label: "显示威力", input: { method: "floor" }, before: 129, after: 129 },
      { label: "攻击面板", input: "physicalAttack", after: 271 },
      { label: "等级系数与攻防比", after: 211, input: {
        attackerStat: 271, calculationPower: 129, displayedPower: 129,
        coefficient: 37 / 41, level: 60, roundedNumerator: 31548, defenderDefense: 149,
      } },
      { label: "减伤、连击与最终倍率", before: 211, after: 211,
        input: { finalDamageMultiplier: 1, hitCount: 1, oneHitAfterFinal: 211 } },
    ],
  };
  const { container } = render(<ResultFormulaAudit result={result} />);
  const rows = container.querySelectorAll(".result-formula__row");
  expect(rows).toHaveLength(4);
  expect(rows[0].textContent).toBe("静态威力规则值115");
  expect(rows[1].textContent).toBe("显示威力基础115×同区加成(1 + 顺风50% + 雨天75%)=未取整258.75→向下取整加成后威力258×克制倍率0.5=显示威力129");
  expect(rows[1].textContent).not.toContain("公式值");
  expect(rows[2].textContent).toContain("→四舍五入伤害分子31548÷物防149→向下取整结果211");
  expect(rows[3].textContent).toBe("总伤害1段211");
  expect(result.totalDamage).toBe(211);
});

test("固定威力先加后按外部百分比结算，手动显示威力不重套增益", () => {
  const result = {
    skillName: "水刃", staticPower: 80, totalDamage: 180,
    gainSources: { staticPercent: [{ name: "不应重复套用的技能加成", amount: 0.5 }], powerPercent: [{ name: "雨天", amount: 0.75 }] },
    formulaSteps: [
      { label: "手动静态威力", input: 80, before: 80, after: 80 },
      { label: "外部固定威力", input: { trait: 10 }, before: 80, after: 90 },
      { label: "外部威力加成", input: [0.75], before: 90, after: 157 },
      { label: "本系", input: 1, before: 157, after: 157 },
      { label: "显示威力", input: { method: "floor" }, before: 157, after: 157 },
    ],
  };
  const { container, rerender } = render(<ResultFormulaAudit result={result} />);
  expect(container.querySelector(".result-formula__row--power").textContent).toBe("静态威力手动80");
  expect(container.querySelector(".result-formula__row--display").textContent).toBe("显示威力手动静态80+外部固定威力10=加成基数90×同区加成(1 + 雨天75%)=未取整157.5→向下取整显示威力157");
  rerender(<ResultFormulaAudit result={{ ...result, effectivePower: 260,
    formulaSteps: [{ label: "手动显示威力", input: 260, before: 260, after: 260 }] }} />);
  expect(container.querySelector(".result-formula__row--display").textContent).toBe("显示威力手动显示威力260");
  expect(container.querySelector(".result-formula__row--display").textContent).not.toContain("雨天");
});

test("旧或局部威力步骤不补造固定加成及错误等式", () => {
  const result = {
    skillName: "折射", staticPower: 60, totalDamage: 100,
    formulaSteps: [
      { label: "基础威力", before: 50, after: 50 },
      { label: "固定威力增加", input: 10 },
      { label: "显示威力", before: 97.5, after: 97 },
    ],
  };
  const { container, rerender } = render(<ResultFormulaAudit result={result} />);
  const displayText = () => container.querySelector(".result-formula__row--display").textContent;
  expect(displayText()).toContain("基础50+技能固定10→加成后威力97.5→向下取整显示威力97");
  expect(displayText()).not.toContain("+技能固定10=加成后威力97.5");
  rerender(<ResultFormulaAudit result={{ ...result, formulaSteps: [
    { label: "基础威力", before: 50, after: 50 },
    { label: "技能威力百分比", input: [0.5], before: 60, after: 90 },
    { label: "显示威力", before: 90, after: 90 },
  ] }} />);
  expect(displayText()).toContain("基础50→加成基数60×同区加成(1 + 50%)=显示威力90");
  rerender(<ResultFormulaAudit result={{ ...result, formulaSteps: [
    { label: "攻击面板", before: 200, after: 260 },
    { label: "技能威力百分比", input: [0.5], before: 60, after: 90 },
    { label: "显示威力", before: 90, after: 90 },
  ] }} />);
  expect(displayText()).toContain("加成基数60×同区加成(1 + 50%)=显示威力90");
  expect(displayText()).not.toContain("+攻击面板");
});
