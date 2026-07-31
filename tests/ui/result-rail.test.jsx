import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { ResultRail } from "../../src/components/ResultRail.jsx";

const result = {
  attackerName: "音速犬",
  defenderName: "水灵",
  defenderHp: 434,
  defenderMaxHp: 434,
  mode: "single",
  selectedSkillName: "风力冲击",
  selectedResult: {
    formulaSteps: [
      { label: "攻击面板", value: "271", source: "输入" },
      { label: "基础威力", value: "80", source: "技能快照" },
      { label: "属性克制", value: "×2", source: "S3 属性表" },
      { label: "专注力", value: "×2", source: "特性规则" },
      { label: "减伤、连击与最终倍率", value: "399", source: "伤害公式" },
    ],
    hpPercent: 91.9,
    lethal: false,
    status: "exact",
    totalDamage: 399,
  },
  skillResults: [
    { id: "wind", name: "风力冲击", damage: 399, hpPercent: 91.9, selected: true },
    { id: "empty-2", name: "技能2", damage: null, hpPercent: null },
  ],
};

test("keeps the exact damage and percent prominent", () => {
  render(<ResultRail onShare={vi.fn()} result={result} />);

  expect(screen.getByTestId("primary-damage")).toHaveTextContent("399");
  expect(screen.getByText("91.9% HP")).toBeVisible();
  expect(screen.queryByText("技能2")).not.toBeInTheDocument();
  expect(screen.queryByText(/随机|范围|置信/)).not.toBeInTheDocument();
});

test("shows attacker and defender mark settlements separately", () => {
  render(
    <ResultRail
      result={{
        ...result,
        selectedResult: {
          ...result.selectedResult,
          markSettlements: [
            {
              markId: "tailwind",
              side: "attacker",
              stacks: 2,
              status: "applied",
              text: "风起 ×2 技能威力 +40%",
            },
            {
              damage: 35,
              markId: "starfall",
              side: "defender",
              stacks: 3,
              status: "applied",
              text: "星陨 ×3 +35 伤害",
            },
          ],
        },
      }}
    />,
  );

  const marks = screen.getByRole("region", { name: "印记结算" });
  expect(within(marks).getByText("进攻方")).toBeVisible();
  expect(within(marks).getByText("风起 ×2 技能威力 +40%")).toBeVisible();
  expect(within(marks).getByText("防御方")).toBeVisible();
  expect(within(marks).getByText("星陨 ×3 +35 伤害")).toBeVisible();
});

test("keeps the result visible while naming an unapplied trait", () => {
  render(
    <ResultRail
      result={{
        ...result,
        selectedResult: {
          ...result.selectedResult,
          warnings: ["未计入特性：未验证特性"],
        },
      }}
    />,
  );

  expect(screen.getByTestId("primary-damage")).toHaveTextContent("399");
  expect(screen.getByText("未计入特性：未验证特性")).toBeVisible();
});

test("keeps the four-skill comparison visible in four-skill mode", () => {
  render(
    <ResultRail
      onShare={vi.fn()}
      result={{
        ...result,
        mode: "four",
        skillResults: [
          { id: "safe", name: "感电", damage: 78, hpPercent: 17.9 },
          { id: "warning-low", name: "超导", damage: 123, hpPercent: 28.3 },
          { id: "warning-high", name: "影袭", damage: 217, hpPercent: 50 },
          { id: "danger", name: "追打", damage: 545, hpPercent: 125.6 },
        ],
      }}
    />,
  );

  const skillResults = screen.getByRole("region", { name: "技能结果" });
  expect(within(skillResults).getByText("17.9%").closest(".skill-result-row"))
    .toHaveAttribute("data-tone", "safe");
  expect(within(skillResults).getByText("28.3%").closest(".skill-result-row"))
    .toHaveAttribute("data-tone", "warning");
  expect(within(skillResults).getByText("50.0%").closest(".skill-result-row"))
    .toHaveAttribute("data-tone", "warning");
  expect(within(skillResults).getByText("125.6%").closest(".skill-result-row"))
    .toHaveAttribute("data-tone", "danger");
  expect(within(skillResults).queryByText("545")).not.toBeInTheDocument();
});

test("does not expose formula, share, or developer provenance in the result rail", () => {
  render(<ResultRail onShare={vi.fn()} result={result} />);

  expect(screen.queryByRole("button", { name: "公式" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "分享" })).not.toBeInTheDocument();
  expect(screen.queryByText("数据依据")).not.toBeInTheDocument();
  expect(screen.queryByText("S3 属性表")).not.toBeInTheDocument();
});

test("can switch the calculation direction from the always-visible rail", async () => {
  const user = userEvent.setup();
  const onDirectionToggle = vi.fn();
  render(
    <ResultRail
      onDirectionToggle={onDirectionToggle}
      onShare={vi.fn()}
      result={result}
    />,
  );

  const directionButton = screen.getByRole("button", {
    name: "切换计算方向",
  });
  expect(directionButton).toHaveAttribute("title", "切换计算方向");
  await user.click(directionButton);
  expect(onDirectionToggle).toHaveBeenCalledOnce();
});

test("edits the defender current HP without leaving the result rail", async () => {
  const user = userEvent.setup();
  const onCurrentHpChange = vi.fn();
  render(
    <ResultRail
      onCurrentHpChange={onCurrentHpChange}
      onShare={vi.fn()}
      result={result}
    />,
  );

  const currentHp = screen.getByRole("spinbutton", {
    name: "防御方当前生命",
  });
  expect(currentHp).toHaveValue(434);
  expect(screen.getByText("/ 434")).toBeVisible();

  fireEvent.change(currentHp, { target: { value: "200" } });
  expect(onCurrentHpChange).toHaveBeenLastCalledWith(200);

  await user.click(screen.getByRole("button", { name: "恢复满血" }));
  expect(onCurrentHpChange).toHaveBeenLastCalledWith(434);
});

test("switches target HP to percentage input without committing an empty draft", async () => {
  const user = userEvent.setup();
  const onCurrentHpChange = vi.fn();
  render(
    <ResultRail
      onCurrentHpChange={onCurrentHpChange}
      result={result}
    />,
  );

  await user.click(screen.getByRole("button", { name: "按百分比输入" }));
  const percent = screen.getByRole("spinbutton", {
    name: "防御方生命百分比",
  });
  expect(percent).toHaveValue(100);

  await user.clear(percent);
  expect(onCurrentHpChange).not.toHaveBeenCalled();
  await user.type(percent, "50");
  expect(onCurrentHpChange).toHaveBeenLastCalledWith(217);
});

test("does not invent a number when a dynamic rule still needs input", () => {
  render(
    <ResultRail
      onShare={vi.fn()}
      result={{
        ...result,
        selectedResult: {
          formulaSteps: [],
          hpPercent: null,
          lethal: false,
          reason: "需要输入当前能量",
          status: "needs_input",
          totalDamage: null,
        },
      }}
    />,
  );

  expect(screen.getByTestId("primary-damage")).toHaveTextContent("—");
  expect(screen.getByText("需要输入当前能量")).toBeVisible();
  expect(screen.queryByText(/NaN|0.0% HP/)).not.toBeInTheDocument();
});
