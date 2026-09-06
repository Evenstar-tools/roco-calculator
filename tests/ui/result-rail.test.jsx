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

  expect(screen.queryByText("技能直接伤害")).not.toBeInTheDocument();
  expect(screen.getByTestId("primary-damage")).toHaveTextContent("399");
  expect(screen.getByText("91.9% HP")).toBeVisible();
  expect(screen.queryByText("技能2")).not.toBeInTheDocument();
  expect(screen.queryByText(/随机|范围|置信/)).not.toBeInTheDocument();
});

test("separates actual status damage from freeze threshold without ambiguous loss copy", () => {
  render(
    <ResultRail
      result={{
        ...result,
        selectedResult: {
          ...result.selectedResult,
          negativeStatusSettlement: {
            added: { burn: 2, freeze: 1, parasitism: 0, poison: 0 },
            breakdown: [
              {
                damage: 40,
                healing: 0,
                id: "burn",
                immune: false,
                label: "灼烧",
                stacks: 2,
              },
            ],
            combinedHpLoss: 434,
            directDamage: 399,
            freeze: {
              immune: false,
              label: "冻结",
              stacks: 1,
              thresholdPercent: 5,
            },
            lethal: true,
            maxHp: 434,
            outcome: "负面状态击倒",
            remainingHp: 0,
            skipped: null,
            stacks: { burn: 2, freeze: 1, parasitism: 0, poison: 0 },
            statusDamage: 40,
            actualStatusDamage: 35,
          },
        },
      }}
    />,
  );

  expect(screen.getByTestId("primary-damage")).toHaveTextContent("399");
  const settlement = screen.getByRole("region", { name: "负面状态结算" });
  expect(within(settlement).getByText("状态结算")).toBeVisible();
  expect(within(settlement).queryByText("实际追加 35 HP")).not.toBeInTheDocument();
  expect(within(settlement).getByText("灼烧 ×2")).toBeVisible();
  expect(within(settlement).getByText("9.2% · 40 HP")).toBeVisible();
  expect(within(settlement).getByText("冻结 ×1")).toBeVisible();
  expect(within(settlement).getByText("5% 斩杀线")).toBeVisible();
  expect(within(settlement).getByText("≤21 HP · 不额外扣血")).toBeVisible();
  expect(within(settlement).getByText("合计 434 HP")).toBeVisible();
  expect(within(settlement).getByText("负面状态击倒")).toBeVisible();
  expect(within(settlement).queryByText("回合结束")).not.toBeInTheDocument();
});

test("explains freeze-only settlement as a threshold instead of extra damage", () => {
  render(
    <ResultRail
      result={{
        ...result,
        defenderHp: 372,
        defenderMaxHp: 372,
        selectedResult: {
          ...result.selectedResult,
          hpPercent: 50.8,
          totalDamage: 189,
          negativeStatusSettlement: {
            actualStatusDamage: 0,
            added: { burn: 0, freeze: 1, parasitism: 0, poison: 0 },
            breakdown: [],
            combinedHpLoss: 189,
            directDamage: 189,
            freeze: {
              immune: false,
              lethal: false,
              stacks: 1,
              thresholdHp: 18,
              thresholdPercent: 5,
            },
            lethal: false,
            outcome: "剩余 183 HP",
            remainingHp: 183,
            skipped: null,
            stacks: { burn: 0, freeze: 1, parasitism: 0, poison: 0 },
            statusDamage: 0,
          },
        },
      }}
    />,
  );

  const settlement = screen.getByRole("region", { name: "负面状态结算" });
  expect(within(settlement).getByText("冻结 ×1")).toBeVisible();
  expect(within(settlement).getByText("5% 斩杀线")).toBeVisible();
  expect(within(settlement).getByText("≤18 HP · 不额外扣血")).toBeVisible();
  expect(within(settlement).queryByText(/追加|总伤害|合计损失|合计/)).not.toBeInTheDocument();
  expect(within(settlement).getByRole("img", { name: "冻结斩杀阈值 5%，等效不高于 18 HP，不额外扣血" })).toBeVisible();
});

test("shows a compact current and next-turn preview for layered statuses", () => {
  const phase = ({ added, damage, next, remaining, stacks }) => ({
    actualStatusDamage: damage,
    added: { burn: added, electrified: 0, freeze: 0, parasitism: 0, poison: 0 },
    breakdown: [{ damage, id: "burn", stacks: stacks.burn }],
    combinedHpLoss: damage,
    directDamage: 0,
    freeze: { stacks: 0, thresholdPercent: 0 },
    maxHp: 1000,
    nextStacks: { burn: next, electrified: 0, freeze: 0, parasitism: 0, poison: 0 },
    remainingHp: remaining,
    stacks: { ...stacks, electrified: 0, freeze: 0, parasitism: 0, poison: 0 },
    statusDamage: damage,
  });
  const current = phase({ added: 10, damage: 200, next: 5, remaining: 800, stacks: { burn: 10 } });
  current.turnPreview = {
    focusStatusIds: ["burn"],
    next: phase({ added: 10, damage: 300, next: 7, remaining: 500, stacks: { burn: 15 } }),
    repeated: true,
  };

  render(
    <ResultRail
      result={{
        ...result,
        selectedSkillName: "引燃",
        selectedResult: {
          ...result.selectedResult,
          hpPercent: 0,
          statusOnly: true,
          totalDamage: 0,
          negativeStatusSettlement: current,
        },
      }}
    />,
  );

  const preview = screen.getByRole("region", { name: "回合状态预估" });
  expect(within(preview).getByText("本回合")).toBeVisible();
  expect(within(preview).getByText("灼烧 ×10")).toBeVisible();
  expect(within(preview).getByText("20.0% · 200 HP")).toBeVisible();
  expect(within(preview).getByText("下回合")).toBeVisible();
  expect(within(preview).getByText("续用")).toBeVisible();
  expect(within(preview).getByText("灼烧 ×15")).toBeVisible();
  expect(within(preview).getByText("30.0% · 300 HP")).toBeVisible();
  expect(within(preview).queryByText(/不续|再用引燃/)).not.toBeInTheDocument();
});

test("keeps a status-only result readable when negative settlement is enabled", () => {
  render(
    <ResultRail
      result={{
        ...result,
        mode: "four",
        selectedSkillName: "打喷嚏",
        skillResults: [
          {
            id: "sneeze",
            name: "打喷嚏",
            damage: 0,
            hpPercent: 0,
            selected: true,
            statusOnly: true,
            negativeStatusSettlement: {
              added: { freeze: 3 },
              freeze: { stacks: 3, thresholdPercent: 15 },
            },
          },
        ],
        selectedResult: {
          hpPercent: 0,
          lethal: false,
          status: "exact",
          statusOnly: true,
          totalDamage: 0,
          negativeStatusSettlement: {
            actualStatusDamage: 0,
            added: { burn: 0, freeze: 3, parasitism: 0, poison: 0 },
            breakdown: [],
            combinedHpLoss: 0,
            directDamage: 0,
            freeze: {
              immune: false,
              stacks: 3,
              thresholdPercent: 15,
            },
            lethal: false,
            maxHp: 434,
            outcome: "剩余 434 HP",
            remainingHp: 434,
            skipped: null,
            stacks: { burn: 0, freeze: 3, parasitism: 0, poison: 0 },
            statusDamage: 0,
          },
        },
      }}
    />,
  );

  expect(screen.queryByTestId("primary-damage")).not.toBeInTheDocument();
  expect(screen.queryByText("0.0% HP")).not.toBeInTheDocument();
  expect(screen.queryByRole("img", { name: "伤害占最大生命 0.0%" })).not.toBeInTheDocument();
  expect(screen.queryByText("无直接伤害")).not.toBeInTheDocument();
  const settlement = screen.getByRole("region", { name: "负面状态结算" });
  expect(within(settlement).getByText("冻结 ×3")).toBeVisible();
  expect(within(settlement).getByText("15% 斩杀线")).toBeVisible();
  expect(within(settlement).getByText("≤65 HP · 不额外扣血")).toBeVisible();
  expect(within(settlement).queryByText(/合计/)).not.toBeInTheDocument();
  const results = screen.getByRole("region", { name: "技能结果" });
  const row = within(results).getByText("打喷嚏").closest(".skill-result-row");
  expect(within(row).getByLabelText("打喷嚏实际伤害"))
    .toHaveTextContent("—");
  expect(within(row).getByLabelText("打喷嚏生命百分比"))
    .toHaveTextContent("—");
  expect(within(row).queryByText("0.0%")).not.toBeInTheDocument();
});

test("shows a compact status summary for each four-skill row", () => {
  render(
    <ResultRail
      result={{
        ...result,
        mode: "four",
        skillResults: [
          {
            id: "burn",
            name: "易燃物质",
            damage: 50,
            hpPercent: 11.5,
            negativeStatusSettlement: {
              added: { burn: 4, freeze: 0, parasitism: 0, poison: 0 },
              actualStatusDamage: 80,
              breakdown: [{ damage: 80, id: "burn", stacks: 4 }],
              maxHp: 434,
              statusDamage: 80,
              freeze: { stacks: 0, thresholdPercent: 0 },
              outcome: "剩余 304 HP",
            },
          },
        ],
      }}
    />,
  );

  const row = screen.getByText("易燃物质").closest(".skill-result-row");
  expect(within(row).getByText("灼烧×4")).toBeVisible();
});

test("uses distinct visual identities for all five negative states", () => {
  render(
    <ResultRail
      result={{
        ...result,
        selectedResult: {
          ...result.selectedResult,
          negativeStatusSettlement: {
            added: { burn: 1, electrified: 1, freeze: 1, parasitism: 1, poison: 1 },
            breakdown: [
              { damage: 8, id: "burn", label: "灼烧", stacks: 1 },
              { damage: 12, id: "poison", label: "中毒", stacks: 1 },
              { damage: 6, healing: 6, id: "parasitism", label: "寄生", stacks: 1 },
              { damage: 108, id: "electrified", label: "引电", stacks: 2, triggered: true },
            ],
            combinedHpLoss: 434,
            directDamage: 399,
            freeze: { immune: false, stacks: 1, thresholdPercent: 5 },
            outcome: "负面状态击倒",
            statusDamage: 134,
          },
        },
      }}
    />,
  );

  const settlement = screen.getByRole("region", { name: "负面状态结算" });
  for (const id of ["burn", "poison", "parasitism", "freeze", "electrified"]) {
    expect(settlement.querySelector(`[data-status="${id}"]`)).toBeTruthy();
  }
  expect(within(settlement).getByText("回复 +6")).toBeVisible();
  expect(within(settlement).getByText("引电 ×2 · 已触发")).toBeVisible();
});

test("explains a repeated choice skill as two independently calculated passes", () => {
  render(
    <ResultRail
      result={{
        ...result,
        mode: "four",
        selectedResult: {
          ...result.selectedResult,
          choiceTraitSequence: {
            executions: [
              { damage: 140, label: "第一段", power: 140 },
              { damage: 70, label: "第二段", power: 70 },
            ],
            text: "有求必应：第一段 140 + 第二段 70 = 210",
            traitName: "有求必应",
          },
          totalDamage: 210,
        },
      }}
    />,
  );

  expect(
    screen.getByRole("status", { name: "选择特性结算" }),
  ).toHaveTextContent("有求必应：第一段 140 + 第二段 70 = 210");
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

test("shows a concise reassembly damage note in the settlement rail", () => {
  render(
    <ResultRail
      result={{
        ...result,
        selectedResult: {
          ...result.selectedResult,
          markSettlements: [
            {
              damage: 117,
              markId: "reassembly",
              side: "attacker",
              stacks: 3,
              status: "applied",
              text: "重组（应对防御）：追加 300% 幻系伤害 117",
            },
          ],
        },
      }}
    />,
  );

  const marks = screen.getByRole("region", { name: "印记结算" });
  expect(within(marks).getByText("重组（应对防御）：追加 300% 幻系伤害 117"))
    .toBeVisible();
});

test("shows Beast Flower bloodline settlements without pretending they are marks", () => {
  render(
    <ResultRail
      result={{
        ...result,
        selectedResult: {
          ...result.selectedResult,
          traitSettlements: [
            {
              traitId: "trait_beast_flower",
              bloodlineType: "normal",
              side: "attacker",
              status: "applied",
              text: "普通血脉｜技能威力 +40",
            },
            {
              traitId: "trait_beast_flower",
              bloodlineType: "fire",
              side: "defender",
              status: "recorded",
              text: "火系血脉｜灼烧 ×6 · 本次伤害不追加",
            },
          ],
        },
      }}
    />,
  );

  const settlements = screen.getByRole("region", { name: "特性结算" });
  expect(within(settlements).getByText("普通血脉｜技能威力 +40")).toBeVisible();
  expect(within(settlements).getByText("火系血脉｜灼烧 ×6 · 本次伤害不追加")).toBeVisible();
  expect(screen.queryByRole("region", { name: "印记结算" })).not.toBeInTheDocument();
});

test("shows Baron Greed ten-hit details without truncating the whole-skill gain", () => {
  render(
    <ResultRail
      result={{
        ...result,
        selectedResult: {
          ...result.selectedResult,
          traitSettlements: [
            {
              attackPercentAdd: 80,
              hitDamages: [100, 101, 102, 103, 104, 105, 106, 107, 108, 109],
              kind: "baron-greed",
              lifestealPercent: 50,
              lines: [
                "逐击 100/101/102/103/104/105/106/107/108/109",
                "吸血50% · 溢出200 · 本次加攻+80%",
              ],
              overflowHealing: 200,
              side: "attacker",
              status: "applied",
              text: "legacy fallback",
              traitId: "reviewed-trait:baron-greed-v2",
            },
          ],
        },
      }}
    />,
  );

  const settlements = screen.getByRole("region", { name: "特性结算" });
  expect(within(settlements).getByText("贪得无厌")).toBeVisible();
  expect(within(settlements).getByText(
    "逐击 100/101/102/103/104/105/106/107/108/109",
  )).toBeVisible();
  expect(within(settlements).getByText("吸血50% · 溢出200 · 本次加攻+80%"))
    .toBeVisible();
  expect(within(settlements).queryByText("legacy fallback")).not.toBeInTheDocument();
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
  expect(within(skillResults).getByLabelText("追打实际伤害"))
    .toHaveTextContent("545");
});

test("shows actual damage and HP columns without inventing unavailable values", () => {
  render(
    <ResultRail
      result={{
        ...result,
        mode: "four",
        skillResults: [
          { id: "exact", name: "精准打击", damage: 1234, hpPercent: 87.6 },
          { id: "pending", name: "参数待补", damage: null, hpPercent: null },
          {
            id: "status",
            name: "状态技能",
            damage: 0,
            hpPercent: 0,
            statusOnly: true,
            negativeStatusSettlement: {
              actualStatusDamage: 40,
              maxHp: 400,
            },
          },
        ],
        traitResult: {
          damage: 54,
          hpPercent: 12.5,
          name: "刺肤",
        },
      }}
    />,
  );

  const list = screen.getByRole("region", { name: "技能结果" });
  expect(within(list).getByText("伤害")).toBeVisible();
  expect(within(list).getByText("HP")).toBeVisible();
  expect(within(list).getByLabelText("精准打击实际伤害")).toHaveTextContent("1234");
  expect(within(list).getByLabelText("精准打击生命百分比")).toHaveTextContent("87.6%");
  expect(within(list).getByLabelText("参数待补实际伤害")).toHaveTextContent("—");
  expect(within(list).getByLabelText("参数待补生命百分比")).toHaveTextContent("—");
  expect(within(list).getByLabelText("状态技能实际伤害")).toHaveTextContent("40");
  expect(within(list).getByLabelText("状态技能生命百分比")).toHaveTextContent("10.0%");
  expect(within(list).getByLabelText("刺肤实际伤害")).toHaveTextContent("54");
  expect(within(list).getByLabelText("刺肤生命百分比")).toHaveTextContent("12.5%");
});

test("keeps the calculation-process entry out of the result rail", () => {
  render(<ResultRail result={{ ...result, mode: "four" }} />);

  expect(screen.queryByRole("button", { name: "查看当前技能计算过程" }))
    .not.toBeInTheDocument();
});

test("places active advanced conditions after the skill list without a process entry", async () => {
  const user = userEvent.setup();
  const onAdvancedOptionsOpen = vi.fn();
  const { rerender } = render(
    <ResultRail
      activeAdvancedConditions={["雨天", "减伤 20%", "最终倍率 ×1.25"]}
      onAdvancedOptionsOpen={onAdvancedOptionsOpen}
      result={{ ...result, mode: "four", skillResults: [] }}
    />,
  );

  const skillList = screen.getByRole("region", { name: "技能结果" });
  const summary = screen.getByRole("region", {
    name: "当前非默认高级条件",
  });
  expect(within(summary).getByText("计算条件")).toBeVisible();
  expect(summary).toHaveTextContent("雨天 · 减伤 20% · 最终倍率 ×1.25");
  expect(skillList.compareDocumentPosition(summary))
    .toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  expect(screen.queryByRole("button", { name: "查看当前技能计算过程" }))
    .not.toBeInTheDocument();

  await user.click(within(summary).getByRole("button", { name: "调整" }));
  expect(onAdvancedOptionsOpen).toHaveBeenCalledOnce();

  rerender(
    <ResultRail
      activeAdvancedConditions={[]}
      onAdvancedOptionsOpen={onAdvancedOptionsOpen}
      result={{ ...result, mode: "four", skillResults: [] }}
    />,
  );
  expect(screen.queryByRole("region", {
    name: "当前非默认高级条件",
  })).not.toBeInTheDocument();
});

test("shows direct trait damage as a separate selected result above skills", () => {
  render(
    <ResultRail
      result={{
        ...result,
        mode: "four",
        selectedSkillName: "刺肤",
        selectedResult: {
          hpPercent: 12.5,
          lethal: false,
          status: "exact",
          totalDamage: 54,
        },
        traitResult: {
          damage: 54,
          hpPercent: 12.5,
          name: "刺肤",
          selected: true,
        },
      }}
    />,
  );

  const list = screen.getByRole("region", { name: "技能结果" });
  const trait = within(list).getByText("特性造成伤害").closest(".skill-result-row");
  expect(trait).toHaveClass("is-selected");
  expect(within(trait).getByText("12.5%")).toBeVisible();
  expect(within(trait).getByText("刺肤")).toBeVisible();
  expect(within(trait).getByText("特性")).toBeVisible();
});

test("shows bloodline true damage separately and lets the user select it", async () => {
  const user = userEvent.setup();
  const onBloodlineResultFocus = vi.fn();
  render(
    <ResultRail
      onBloodlineResultFocus={onBloodlineResultFocus}
      result={{
        ...result,
        bloodlineResult: {
          damage: 108,
          hpPercent: 24.9,
          name: "戏耍·光合治愈",
          selected: false,
        },
        mode: "four",
      }}
    />,
  );

  const row = screen.getByRole("button", {
    name: "查看戏耍·光合治愈伤害",
  });
  expect(within(row).getByText("24.9%")).toBeVisible();
  await user.click(row);
  expect(onBloodlineResultFocus).toHaveBeenCalledTimes(1);
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

test("renders icon-based type analysis only when the display setting is enabled", () => {
  const typeAnalysis = {
    subjectName: "测试精灵",
    defense: {
      weaknesses: [{ type: "草", multiplier: 2 }],
      resistances: [{ type: "火", multiplier: 0.5 }],
    },
    offense: {
      coverage: [{ type: "水", multiplier: 2 }],
      blindSpots: [{ type: "龙", multiplier: 0.5 }],
    },
  };
  const { rerender } = render(
    <ResultRail result={{ ...result, typeAnalysis }} showTypeCoverage={false} />,
  );
  expect(screen.queryByRole("region", { name: "属性分析" })).not.toBeInTheDocument();

  rerender(
    <ResultRail result={{ ...result, typeAnalysis }} showTypeCoverage />,
  );
  const panel = screen.getByRole("region", { name: "属性分析" });
  expect(within(panel).getByText("测试精灵 · 自身防御面")).toBeVisible();
  expect(within(panel).getByText("四技能进攻面")).toBeVisible();
  expect(within(panel).getByRole("img", { name: "草" })).toBeVisible();
  expect(within(panel).getByLabelText("草 2倍")).toBeVisible();
  expect(within(panel).getByText("盲点")).toBeVisible();
});
