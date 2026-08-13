import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import BattleWorkspace from "../src/components/BattleWorkspace.jsx";
import BattleConditionStrip from "../src/components/BattleConditionStrip.jsx";
import ResultBar from "../src/components/ResultBar.jsx";
import ResultSheet from "../src/components/ResultSheet.jsx";
import { createCalculatorStore } from "../src/state/calculator-store.js";

function createSnapshot() {
  return {
    meta: { id: "data-v1", rulesVersion: "rules-v1" },
    spirits: [
      {
        id: "spirit-a",
        fullName: "烈焰兽",
        raceStats: {
          hp: 120,
          magicalAttack: 100,
          magicalDefense: 100,
          physicalAttack: 140,
          physicalDefense: 100,
          speed: 100,
        },
        types: ["火"],
      },
      {
        id: "spirit-b",
        fullName: "潮汐兽",
        raceStats: {
          hp: 150,
          magicalAttack: 115,
          magicalDefense: 120,
          physicalAttack: 100,
          physicalDefense: 125,
          speed: 90,
        },
        types: ["水"],
      },
    ],
    skills: [
      {
        basePower: 80,
        category: "physical",
        id: "skill-a",
        name: "烈焰冲击",
        type: "火",
      },
      {
        basePower: 50,
        category: "physical",
        id: "skill-b",
        name: "连环火花",
        type: "火",
      },
      {
        basePower: 70,
        category: "magical",
        id: "skill-c",
        name: "潮汐冲击",
        type: "水",
      },
      {
        basePower: 40,
        category: "physical",
        id: "skill-d",
        name: "火花",
        type: "火",
      },
    ],
    learnsets: [
      {
        spiritId: "spirit-a",
        skillIds: ["skill-a", "skill-b", "skill-d"],
      },
      {
        spiritId: "spirit-b",
        skillIds: ["skill-c"],
      },
    ],
    traits: [],
    typeChart: {
      matrix: [
        [1, 1],
        [1, 1],
      ],
      types: ["火", "水"],
    },
  };
}

function renderWorkspace() {
  const snapshot = createSnapshot();
  const store = createCalculatorStore(snapshot);
  store.dispatch({ type: "mode/set", value: "four" });
  store.dispatch({
    index: 1,
    side: "attacker",
    type: "side/set-four-skill",
    value: "skill-b",
  });

  return {
    store,
    ...render(
      <BattleWorkspace
        petImages={{}}
        snapshot={snapshot}
        store={store}
      />,
    ),
  };
}

describe("result bar and sheet", () => {
  test("shows defensive matchups and four-skill coverage when enabled", () => {
    render(
      <ResultSheet
        onClose={vi.fn()}
        open
        showTypeAnalysis
        view={{
          attackerName: "烈焰兽",
          defenderName: "潮汐兽",
          message: "请选择技能",
          rows: [],
          selectedResult: null,
          status: "unresolved",
          typeAnalysis: {
            subjectName: "烈焰兽",
            defense: {
              weaknesses: [{ type: "水", multiplier: 2 }],
              resistances: [{ type: "火", multiplier: 0.5 }],
            },
            offense: {
              coverage: [{ type: "草", multiplier: 2 }],
              blindSpots: [{ type: "水", multiplier: 0.5 }],
            },
          },
        }}
      />,
    );

    const analysis = screen.getByLabelText("属性分析");
    expect(analysis).toHaveTextContent("烈焰兽 · 自身防御面");
    expect(analysis).toHaveTextContent("四技能进攻面");
    expect(analysis).toHaveTextContent("水");
    expect(analysis).toHaveTextContent("草");
  });

  test("keeps target HP beside the compact battle condition summary", () => {
    const onCurrentHpChange = vi.fn();
    render(
      <BattleConditionStrip
        currentHp={428}
        maxHp={428}
        onCurrentHpChange={onCurrentHpChange}
        onOpen={() => {}}
        open={false}
        summary={{ count: 2, labels: ["技能", "特性"] }}
      />,
    );

    fireEvent.input(screen.getByLabelText("目标当前生命"), {
      target: { value: "300" },
    });

    expect(onCurrentHpChange).toHaveBeenCalledWith(300);
    expect(screen.getByText("/ 428")).toBeInTheDocument();
  });

  test("edits the target's current HP from the persistent result dock", () => {
    const onCurrentHpChange = vi.fn();
    render(
      <ResultBar
        onCurrentHpChange={onCurrentHpChange}
        onOpen={() => {}}
        open={false}
        view={{
          attackerName: "烈焰兽",
          defenderHp: 100,
          defenderMaxHp: 428,
          defenderName: "潮汐兽",
          selectedResult: {
            hpPercent: 21.7,
            remainingHp: 7,
            skillName: "烈焰冲击",
            totalDamage: 93,
          },
          status: "exact",
        }}
      />,
    );

    fireEvent.input(screen.getByLabelText("结果栏目标当前生命"), {
      target: { value: "88" },
    });
    expect(onCurrentHpChange).toHaveBeenCalledWith(88);
    onCurrentHpChange.mockClear();
    fireEvent.input(screen.getByLabelText("结果栏目标当前生命"), {
      target: { value: "" },
    });
    expect(onCurrentHpChange).not.toHaveBeenCalled();
    expect(screen.getByText("/ 428")).toBeInTheDocument();
  });

  test("exposes settlements, warnings and formula audit in result details", () => {
    render(
      <ResultSheet
        onClose={() => {}}
        onSelectSkill={() => {}}
        open
        selectedIndex={0}
        view={{
          attackerName: "烈焰兽",
          defenderName: "潮汐兽",
          rows: [],
          selectedResult: {
            formulaSteps: [
              { after: 120, before: 80, label: "特性修正", source: "trait" },
              {
                after: 27,
                before: 5843.292682926829,
                label: "等级系数与攻防比",
              },
            ],
            markSettlements: [{ label: "星陨", summary: "消耗 1 层" }],
            remainingHp: 7,
            remainingHpPercent: 1.6,
            skillName: "烈焰冲击",
            totalDamage: 93,
            traitSettlements: [{ label: "冻土", summary: "威力 +20%" }],
            warnings: ["存在未计入的战斗效果"],
          },
          status: "exact",
          traitResult: {
            skillName: "特性伤害",
            totalDamage: 20,
          },
        }}
      />,
    );

    expect(screen.getByText("结算明细")).toBeInTheDocument();
    expect(screen.getByText(/星陨/u)).toBeInTheDocument();
    expect(screen.getByText(/冻土/u)).toBeInTheDocument();
    expect(screen.getByText("计算提醒")).toBeInTheDocument();
    expect(screen.getByText("伤害计算过程")).toBeInTheDocument();
    expect(screen.getByText("每段伤害")).toBeInTheDocument();
    expect(screen.getByText("总伤害")).toBeInTheDocument();
  });

  test("presents the selected damage, four-skill comparison and formula process in the desktop result hierarchy", () => {
    render(
      <ResultSheet
        onClose={() => {}}
        onSelectSkill={() => {}}
        open
        selectedIndex={0}
        view={{
          attackerName: "岚鸟",
          defenderName: "影狸",
          rows: [
            {
              hpPercent: 74.6,
              skillId: "skill-a",
              skillName: "闪击",
              status: "exact",
              totalDamage: 288,
            },
            {
              hpPercent: 9.1,
              skillId: "skill-b",
              skillName: "先发刺人",
              status: "exact",
              totalDamage: 35,
            },
          ],
          selectedResult: {
            formulaSteps: [
              {
                after: 200,
                before: 200,
                input: "magicalAttack",
                label: "攻击面板",
              },
              {
                after: 80,
                before: 80,
                input: 80,
                label: "基础威力",
              },
              {
                after: 100,
                before: 80,
                input: 1.25,
                label: "本系",
              },
              {
                after: 50,
                before: 100,
                input: ["水"],
                label: "属性克制",
              },
              {
                after: 50,
                before: 50,
                input: { multiplier: 1, weather: "无天气" },
                label: "天气",
              },
              {
                after: 50,
                before: 50,
                input: 1,
                label: "攻防等级",
              },
              {
                after: 50,
                before: 50,
                input: 1,
                label: "其他威力乘区",
              },
              {
                after: 50,
                before: 50,
                input: { method: "round" },
                label: "显示威力",
              },
              {
                after: 96,
                before: 96.7,
                input: {
                  attackerStat: 200,
                  calculationPower: 50,
                  coefficient: 0.902439,
                  defenderDefense: 94,
                  displayedPower: 50,
                  roundedNumerator: 9024,
                  unroundedOneHit: 96.7,
                  unroundedNumerator: 9024.39,
                },
                label: "等级系数与攻防比",
              },
              {
                after: 288,
                before: 96,
                input: {
                  damageReductionMultiplier: 1,
                  finalDamageMultiplier: 1,
                  hitCount: 3,
                  oneHitAfterFinal: 96,
                },
                label: "减伤、连击与最终倍率",
              },
            ],
            hpPercent: 74.6,
            remainingHp: 98,
            remainingHpPercent: 25.4,
            skillName: "闪击",
            status: "exact",
            totalDamage: 288,
          },
          status: "exact",
        }}
      />,
    );

    const summary = screen.getByLabelText("伤害摘要");
    expect(within(summary).getByText("288")).toBeInTheDocument();
    expect(within(summary).getByText("74.6% HP")).toBeInTheDocument();
    expect(within(summary).getByText("剩余 98 HP")).toBeInTheDocument();
    expect(
      within(summary).getByRole("img", {
        name: "伤害占目标生命 74.6%",
      }),
    ).toBeInTheDocument();

    const skillResults = screen.getByLabelText("技能结果");
    const selectedSkill = within(skillResults).getByRole("button", {
      name: "查看闪击结果",
    });
    expect(within(selectedSkill).getByText("74.6%")).toBeInTheDocument();
    expect(selectedSkill.querySelector(".result-row__track")).not.toBeNull();

    const process = screen.getByLabelText("伤害计算过程");
    expect(within(process).getByText("技能威力")).toBeInTheDocument();
    expect(within(process).getByText("显示威力")).toBeInTheDocument();
    expect(within(process).getByText("每段伤害")).toBeInTheDocument();
    expect(within(process).getByText("总伤害")).toBeInTheDocument();
    expect(within(process).getByText("伤害分子")).toBeInTheDocument();
    expect(within(process).getByText("段数")).toBeInTheDocument();
  });

  test("shows the current result before the four-skill comparison", () => {
    render(
      <ResultSheet
        onClose={() => {}}
        onSelectSkill={() => {}}
        open
        selectedIndex={0}
        view={{
          attackerName: "烈焰兽",
          defenderName: "潮汐兽",
          rows: [
            { skillName: "烈焰冲击", status: "exact", totalDamage: 93 },
            { skillName: "连环火花", status: "exact", totalDamage: 55 },
          ],
          selectedResult: {
            remainingHp: 335,
            remainingHpPercent: 78,
            skillName: "烈焰冲击",
            totalDamage: 93,
          },
          status: "exact",
        }}
      />,
    );

    const current = screen.getByLabelText("伤害摘要");
    const comparison = screen.getByText("技能结果");
    expect(
      current.compareDocumentPosition(comparison) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  test("keeps the compact bar focused on damage percent and moves sharing into details", () => {
    render(
      <ResultBar
        onOpen={() => {}}
        open={false}
        view={{
          attackerName: "烈焰兽",
          defenderName: "潮汐兽",
          selectedResult: {
            hpPercent: 21.7,
            remainingHpPercent: 78.3,
            skillName: "烈焰冲击",
            totalDamage: 93,
          },
          status: "exact",
        }}
      />,
    );

    expect(screen.getByText("21.7% HP")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "分享当前计算" }),
    ).not.toBeInTheDocument();
  });

  test("shows the selected slot and remaining HP in the compact four-skill result dock", () => {
    render(
      <ResultBar
        mode="four"
        onOpen={() => {}}
        open={false}
        selectedSkillIndex={1}
        view={{
          attackerName: "古卷执政官",
          defenderName: "圣羽翼王",
          rows: [
            { skillName: "技能一", status: "exact" },
            { skillName: "先发刺人", status: "exact" },
            { skillName: "技能三", status: "exact" },
            { skillName: "技能四", status: "exact" },
          ],
          selectedResult: {
            hpPercent: 25.8,
            remainingHp: 330,
            skillName: "先发刺人",
            totalDamage: 115,
          },
          status: "exact",
        }}
      />,
    );

    const dock = screen.getByLabelText("当前伤害结果");
    expect(within(dock).getByText("2/4")).toBeInTheDocument();
    expect(within(dock).getByText("剩余 330 HP")).toHaveClass(
      "result-bar__mobile-remaining",
    );
    const actionIcon = dock.querySelector(".result-bar__action-icon");
    expect(
      within(dock).getByRole("button", { name: "展开伤害结果" }),
    ).toContainElement(actionIcon);
    expect(actionIcon).toHaveAttribute(
      "src",
      expect.stringMatching(/caret-right\.png|image\/png/u),
    );
    expect(actionIcon).toHaveAttribute("mode", "aspectFit");
    expect(within(dock).queryByText("详情")).not.toBeInTheDocument();
  });

  test("colors damage bars at the 20 and 50 percent severity boundaries", () => {
    render(
      <ResultBar
        mode="four"
        onOpen={() => {}}
        open={false}
        view={{
          attackerName: "龙鱼",
          defenderName: "飞飞翔",
          rows: [
            { hpPercent: 19.9, skillName: "角击", status: "exact" },
            { hpPercent: 20, skillName: "龙之利爪", status: "exact" },
            { hpPercent: 49.9, skillName: "潮涌", status: "exact" },
            { hpPercent: 50, skillName: "水刃", status: "exact" },
          ],
          selectedResult: {
            hpPercent: 20,
            remainingHp: 490,
            skillName: "角击",
            totalDamage: 53,
          },
          status: "exact",
        }}
      />,
    );

    const dock = screen.getByLabelText("当前伤害结果");
    expect(dock.querySelector(".result-bar__percent")).toHaveClass(
      "result-bar__percent--warning",
    );
    expect(dock.querySelector(".result-bar__track-fill")).toHaveClass(
      "result-bar__track-fill--warning",
    );

    const rowPercents = dock.querySelectorAll(".result-bar__row-percent");
    expect(rowPercents[0]).toHaveClass("result-bar__row-percent--success");
    expect(rowPercents[1]).toHaveClass("result-bar__row-percent--warning");
    expect(rowPercents[2]).toHaveClass("result-bar__row-percent--warning");
    expect(rowPercents[3]).toHaveClass("result-bar__row-percent--danger");
  });

  test("keeps a four-skill overview available in the tablet result rail", () => {
    render(
      <ResultBar
        onOpen={() => {}}
        open={false}
        view={{
          attackerName: "烈焰兽",
          defenderName: "潮汐兽",
          rows: [
            {
              hpPercent: 21.7,
              skillName: "烈焰冲击",
              status: "exact",
              totalDamage: 93,
            },
            {
              hpPercent: 16.4,
              skillName: "过曝",
              status: "exact",
              totalDamage: 70,
            },
          ],
          selectedResult: {
            hpPercent: 21.7,
            skillName: "烈焰冲击",
            totalDamage: 93,
          },
          status: "exact",
        }}
      />,
    );

    const overview = screen.getByLabelText("技能结果概览");
    expect(within(overview).getByText("烈焰冲击")).toBeInTheDocument();
    expect(within(overview).getByText("70")).toBeInTheDocument();
  });

  test("shows dynamic power in the skill row and selected-result detail", () => {
    const summary = "速度 500 − 430 = 70 → 威力 160";
    render(
      <ResultSheet
        onClose={() => {}}
        onSelectSkill={() => {}}
        open
        selectedIndex={0}
        view={{
          attackerName: "烈焰兽",
          defenderName: "潮汐兽",
          rows: [
            {
              displayedPower: 160,
              powerSummary: summary,
              skillId: "skill-flash-strike",
              skillName: "闪击",
              status: "exact",
              totalDamage: 88,
            },
            {
              displayedPower: 80,
              powerSummary: null,
              skillId: "skill-fixed",
              skillName: "固定技能",
              status: "exact",
              totalDamage: 40,
            },
          ],
          selectedResult: {
            displayedPower: 160,
            powerSummary: summary,
            remainingHp: 62,
            remainingHpPercent: 41,
            skillName: "闪击",
            totalDamage: 88,
          },
          status: "exact",
        }}
      />,
    );

    expect(screen.getByText(summary)).toBeInTheDocument();
    expect(screen.getAllByText(summary)).toHaveLength(1);
    expect(screen.getByText("40 伤害")).toBeInTheDocument();
  });

  test("opens a modal scroll view from a native result button", () => {
    renderWorkspace();

    const trigger = screen.getByRole("button", {
      name: "展开伤害结果",
    });
    expect(trigger.tagName).toBe("BUTTON");
    fireEvent.click(trigger);

    const dialog = screen.getByRole("dialog", { name: "伤害结果" });
    expect(dialog).toBeInTheDocument();
    expect(dialog.parentElement).not.toHaveAttribute(
      "data-catch-move",
      "true",
    );
    expect(dialog.querySelector("[data-scroll-y='true']")).not.toBeNull();
    expect(within(dialog).getByText(/剩余 \d+ HP/u)).toBeInTheDocument();
    const shareButtons = screen.getAllByRole("button", {
      name: "分享当前计算",
    });
    expect(shareButtons).toHaveLength(1);
    for (const button of shareButtons) {
      expect(button).toHaveAttribute("data-open-type", "share");
    }
  });

  test("selects a skill row and closes back to the result trigger", () => {
    const { store } = renderWorkspace();
    const trigger = screen.getByRole("button", {
      name: "展开伤害结果",
    });
    fireEvent.click(trigger);

    fireEvent.click(
      screen.getByRole("button", { name: "查看连环火花结果" }),
    );
    expect(
      store.getState().directions.forward.selectedSkillIndex,
    ).toBe(1);

    fireEvent.click(
      screen.getByRole("button", { name: "关闭伤害结果" }),
    );
    expect(
      screen.queryByRole("dialog", { name: "伤害结果" }),
    ).not.toBeInTheDocument();
    expect(document.activeElement).toBe(trigger);
    expect(trigger).toHaveAttribute("aria-haspopup", "dialog");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveAttribute("tabindex", "0");
  });

  test("renders unavailable HP without converting null to zero percent", () => {
    render(
      <ResultSheet
        onClose={() => {}}
        onSelectSkill={() => {}}
        open
        selectedIndex={0}
        view={{
          attackerName: "烈焰兽",
          defenderName: "潮汐兽",
          rows: [],
          selectedResult: {
            remainingHp: null,
            remainingHpPercent: undefined,
            skillName: "烈焰冲击",
            totalDamage: 88,
          },
          status: "exact",
        }}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "伤害结果" });
    expect(dialog.querySelector(".result-sheet__remaining")).toHaveTextContent(
      "剩余 -- HP",
    );
    expect(dialog).not.toHaveTextContent("0%");
  });

  test("keeps real zero damage and zero remaining HP visible", () => {
    render(
      <ResultSheet
        onClose={() => {}}
        onSelectSkill={() => {}}
        open
        selectedIndex={0}
        view={{
          attackerName: "烈焰兽",
          defenderName: "潮汐兽",
          rows: [],
          selectedResult: {
            hpPercent: 0,
            remainingHp: 0,
            remainingHpPercent: 0,
            skillName: "烈焰冲击",
            totalDamage: 0,
          },
          status: "exact",
        }}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "伤害结果" });
    expect(
      dialog.querySelector(".result-sheet__damage"),
    ).toHaveTextContent("0");
    expect(dialog.querySelector(".result-sheet__remaining")).toHaveTextContent(
      "剩余 0 HP",
    );
    expect(dialog).toHaveTextContent("0%");
  });

  test("uses a fixed unresolved result announcement", () => {
    render(
      <ResultSheet
        onClose={() => {}}
        onSelectSkill={() => {}}
        open
        selectedIndex={0}
        view={{
          attackerName: "烈焰兽",
          defenderName: "潮汐兽",
          message: "任意内部错误文本",
          rows: [],
          selectedResult: null,
          status: "unresolved",
        }}
      />,
    );

    expect(screen.getByText("伤害暂未解析")).toBeInTheDocument();
  });
});
