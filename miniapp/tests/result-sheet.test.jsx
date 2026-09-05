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
  test("shows negative status settlement when the calculation returns it", () => {
    render(
      <ResultSheet
        onClose={vi.fn()}
        open
        view={{
          attackerName: "烈焰兽",
          defenderName: "潮汐兽",
          rows: [],
          selectedResult: {
            hpPercent: 20,
            negativeStatusSettlement: {
              actualStatusDamage: 42,
              breakdown: [
                { damage: 42, id: "burn", label: "灼烧", stacks: 3 },
              ],
              freeze: { stacks: 0, thresholdPercent: 0 },
              remainingHp: 300,
            },
            remainingHp: 342,
            skillName: "烈焰冲击",
            totalDamage: 86,
          },
          status: "exact",
        }}
      />,
    );

    const settlement = screen.getByLabelText("负面状态结算");
    expect(settlement).toHaveTextContent("状态追加 42 HP");
    expect(settlement).toHaveTextContent("灼烧 ×3");
  });

  test("distinguishes all five statuses and shows the next-turn preview", () => {
    render(
      <ResultSheet
        onClose={vi.fn()}
        open
        view={{
          attackerName: "烈焰兽",
          defenderName: "潮汐兽",
          rows: [],
          selectedResult: {
            hpPercent: 20,
            negativeStatusSettlement: {
              actualStatusDamage: 46,
              breakdown: [
                { damage: 8, id: "burn", label: "灼烧", stacks: 1 },
                { damage: 6, id: "parasitism", label: "寄生", stacks: 1 },
                { damage: 12, id: "poison", label: "中毒", stacks: 1 },
                { damage: 20, id: "electrified", label: "引电", stacks: 2 },
              ],
              freeze: { stacks: 1, thresholdPercent: 5 },
              maxHp: 400,
              remainingHp: 274,
              stacks: {
                burn: 1,
                electrified: 2,
                freeze: 1,
                parasitism: 1,
                poison: 1,
              },
              turnPreview: {
                focusStatusIds: ["burn", "freeze"],
                next: {
                  actualStatusDamage: 24,
                  freeze: { stacks: 2, thresholdPercent: 10 },
                  maxHp: 400,
                  stacks: { burn: 2, freeze: 2 },
                },
                repeated: true,
              },
            },
            remainingHp: 320,
            skillName: "烈焰冲击",
            totalDamage: 80,
          },
          status: "exact",
        }}
      />,
    );

    const settlement = screen.getByLabelText("负面状态结算");
    for (const id of ["burn", "parasitism", "poison", "electrified", "freeze"]) {
      expect(settlement.querySelector(`[data-status="${id}"]`)).not.toBeNull();
    }
    const preview = screen.getByLabelText("回合状态预估");
    expect(preview).toHaveTextContent("本回合");
    expect(preview).toHaveTextContent("下回合");
    expect(preview).toHaveTextContent("续用");
    expect(preview).toHaveTextContent("灼烧 ×2");
    expect(preview).toHaveTextContent("冻结 ×2");
    expect(preview).toHaveTextContent("6.0% · 24 HP");
  });

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

    fireEvent.click(screen.getByRole("button", { name: "展开属性分析" }));
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
        showTypeAnalysis
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

  test("shows 重组 as a separate total term and a concise settlement note", () => {
    const selectedResult = {
      additionalDamage: 0,
      formulaSteps: [
        {
          after: 100,
          before: 100,
          input: "physicalAttack",
          label: "攻击面板",
        },
        {
          after: 90,
          before: 90,
          input: {
            attackerStat: 100,
            calculationPower: 50,
            coefficient: 37 / 41,
            defenderDefense: 50,
            displayedPower: 50,
            roundedNumerator: 4500,
          },
          label: "等级系数与攻防比",
        },
        {
          after: 90,
          before: 90,
          input: {
            finalDamageMultiplier: 1,
            hitCount: 1,
            oneHitAfterFinal: 90,
          },
          label: "减伤、连击与最终倍率",
        },
      ],
      hpPercent: 30,
      mainDamage: 90,
      markSettlements: [{
        damage: 27,
        markId: "reassembly",
        side: "attacker",
        stacks: 3,
        status: "applied",
        text: "重组（应对防御）：追加 300% 幻系伤害 27",
      }],
      reassemblyDamage: 27,
      remainingHp: 273,
      skillName: "抓挠",
      status: "exact",
      totalDamage: 117,
      traitDamage: 0,
    };
    render(
      <ResultSheet
        onClose={() => {}}
        onSelectSkill={() => {}}
        open
        selectedIndex={0}
        view={{
          attackerName: "测试攻方",
          defenderName: "测试守方",
          rows: [selectedResult],
          selectedResult,
          status: "exact",
        }}
      />,
    );

    expect(screen.getByText("重组追加")).toBeInTheDocument();
    expect(screen.getByText("重组（应对防御）：追加 300% 幻系伤害 27"))
      .toBeInTheDocument();
  });

  test("keeps the Baron Greed settlement in two readable lines", () => {
    render(
      <ResultSheet
        onClose={() => {}}
        open
        view={{
          attackerName: "恶魔男爵",
          defenderName: "骨龙",
          rows: [],
          selectedResult: {
            remainingHp: 0,
            skillName: "撕咬",
            totalDamage: 648,
            traitSettlements: [{
              kind: "baron-greed",
              lines: [
                "逐击 127 / 127 / 127 / 127 / 140 · 吸血 198",
                "溢出回复 24 · 本次总加攻 +10%",
              ],
            }],
          },
          status: "exact",
        }}
      />,
    );

    const settlement = screen.getByLabelText("贪得无厌结算");
    expect(within(settlement).getByText("贪得无厌")).toBeInTheDocument();
    expect(within(settlement).getByText(
      "逐击 127 / 127 / 127 / 127 / 140 · 吸血 198",
    )).toBeInTheDocument();
    expect(within(settlement).getByText(
      "溢出回复 24 · 本次总加攻 +10%",
    )).toBeInTheDocument();
  });

  test("selects the bloodline magic result without closing details", () => {
    const onSelectBloodline = vi.fn();
    const bloodlineResult = {
      formulaSteps: [
        { after: 75, before: 75, label: "血脉魔法回复" },
        {
          after: 225,
          before: 75,
          input: { ticks: 3 },
          label: "血脉魔法后续回复",
        },
        {
          after: 60,
          input: { actualHealing: 60, requestedHealing: 75 },
          label: "戏耍特性伤害",
        },
      ],
      remainingHp: 368,
      remainingHpPercent: 86,
      skillName: "戏耍·光合治愈",
      sourceKind: "bloodline",
      status: "exact",
      totalDamage: 60,
    };
    render(
      <ResultSheet
        onClose={() => {}}
        onSelectBloodline={onSelectBloodline}
        onSelectSkill={() => {}}
        open
        selectedIndex={0}
        view={{
          attackerName: "迪莫",
          bloodlineResult,
          defenderName: "圣光迪莫",
          rows: [{ skillName: "抓挠", status: "exact", totalDamage: 27 }],
          selectedDamageSource: "bloodline",
          selectedResult: bloodlineResult,
          status: "exact",
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "选择血脉魔法伤害结果" }));
    expect(onSelectBloodline).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("dialog", { name: "伤害结果" }))
      .toBeInTheDocument();
    expect(screen.getByText("立即回复")).toBeInTheDocument();
    expect(screen.getByText("后续回复")).toBeInTheDocument();
    expect(screen.getByText("名义合计（未扣溢出）")).toBeInTheDocument();
    expect(screen.getByText("戏耍真伤")).toBeInTheDocument();
  });

  test("keeps type analysis compact and expandable in result details", () => {
    render(
      <ResultSheet
        onClose={() => {}}
        onSelectSkill={() => {}}
        open
        selectedIndex={0}
        showTypeAnalysis
        view={{
          attackerName: "迪莫",
          defenderName: "圣光迪莫",
          rows: [],
          selectedResult: {
            remainingHp: 401,
            skillName: "抓挠",
            totalDamage: 27,
          },
          status: "exact",
          typeAnalysis: {
            subjectName: "迪莫",
            defense: {
              resistances: [{ multiplier: 0.5, type: "龙" }],
              weaknesses: [{ multiplier: 2, type: "武" }],
            },
            offense: {
              blindSpots: [{ multiplier: 0.5, type: "机械" }],
              coverage: [{ multiplier: 2, type: "普通" }],
            },
          },
        }}
      />,
    );

    const toggle = screen.getByRole("button", { name: "展开属性分析" });
    fireEvent.click(toggle);
    expect(screen.getByLabelText("属性分析")).toBeInTheDocument();
    expect(screen.getByText("迪莫 · 自身防御面")).toBeInTheDocument();
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
    expect(within(process).getByText("37/41")).toBeInTheDocument();
    expect(within(process).getByText("伤害分子")).toBeInTheDocument();
    expect(within(process).getByText("37/41")).toBeInTheDocument();
    expect(within(process).queryByText("0.902439")).not.toBeInTheDocument();
    expect(within(process).getByText("段数")).toBeInTheDocument();
  });

  test("shows the current result and four-skill comparison before adjustments", () => {
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
    const adjustments = screen.getByLabelText("结果调整工作台");
    expect(
      current.compareDocumentPosition(comparison) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      comparison.compareDocumentPosition(adjustments) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  test("shows skill parameters as the default inline result adjustment tab", () => {
    render(
      <ResultSheet
        actions={{ defense: [], modifiers: [] }}
        onClose={() => {}}
        onSelectSkill={() => {}}
        open
        selectedIndex={0}
        showSkillConditions
        skillConditionContext={{}}
        skillConditionDirection="attacker"
        skillConditionPresentation={{ inputs: [] }}
        skillConditionSkill={{ id: "skill-a", name: "烈焰冲击" }}
        view={{
          attackerName: "烈焰兽",
          defenderName: "潮汐兽",
          rows: [],
          selectedResult: {
            hpPercent: 21.7,
            remainingHp: 335,
            skillName: "烈焰冲击",
            totalDamage: 93,
          },
          status: "exact",
        }}
      />,
    );

    const workbench = screen.getByLabelText("结果调整工作台");
    expect(within(workbench).getByRole("button", { name: "技能参数" }))
      .toHaveAttribute("aria-pressed", "true");
    expect(within(workbench).getByLabelText("技能条件")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "展开技能参数" }))
      .not.toBeInTheDocument();
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

  test("keeps repeated skill slots as distinct result rows", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

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
              skillId: "skill-repeat",
              skillName: "连续冲击",
              status: "exact",
              totalDamage: 93,
            },
            {
              hpPercent: 21.7,
              skillId: "skill-repeat",
              skillName: "连续冲击",
              status: "exact",
              totalDamage: 93,
            },
          ],
          selectedResult: {
            hpPercent: 21.7,
            skillName: "连续冲击",
            totalDamage: 93,
          },
          status: "exact",
        }}
      />,
    );

    expect(consoleError.mock.calls.some((call) =>
      call.some((value) => String(value).includes("same key"))
    )).toBe(false);
    consoleError.mockRestore();
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
    const previewButton = screen.getByRole("button", {
      name: "预览并分享",
    });
    expect(previewButton).not.toHaveAttribute("data-open-type", "share");
    fireEvent.click(previewButton);

    const sharePreview = screen.getByRole("dialog", { name: "分享预览" });
    expect(within(sharePreview).getByText("分享给好友前确认"))
      .toBeInTheDocument();
    expect(within(sharePreview).getByText(/烈焰兽 → 潮汐兽/u))
      .toBeInTheDocument();
    const configuration = within(sharePreview).getByLabelText("分享配置摘要");
    expect(configuration).toHaveTextContent("攻击方配置");
    expect(configuration).toHaveTextContent("防守方配置");
    expect(configuration).toHaveTextContent("能力等级");
    expect(configuration).toHaveTextContent("技能参数");
    expect(configuration).toHaveTextContent("战斗条件");
    const shareButton = within(sharePreview).getByRole("button", {
      name: "确认分享",
    });
    expect(shareButton).toHaveAttribute("data-open-type", "share");

    fireEvent.click(within(sharePreview).getByRole("button", {
      name: "返回修改",
    }));
    expect(screen.queryByRole("dialog", { name: "分享预览" }))
      .not.toBeInTheDocument();
  });

  test("confirms applied skill effects and detailed trait conditions before sharing", () => {
    render(
      <ResultSheet
        actions={{ defense: [], modifiers: [] }}
        onClose={() => {}}
        onSelectSkill={() => {}}
        open
        selectedIndex={0}
        shareSummary={{
          appliedSkillEffects: ["羽化加速已应用（全技能威力 +20）"],
          attackStageLabel: "0",
          attackerIvs: "个体全60",
          attackerNature: "平衡",
          conditions: ["先知：触发层数 1；每层双攻 50；每层速度 50"],
          defenseStageLabel: "0",
          defenderIvs: "个体全60",
          defenderNature: "平衡",
        }}
        showSkillConditions
        skillConditionContext={{}}
        skillConditionDirection={{ hitCount: 1, overrides: {} }}
        skillConditionPresentation={{ inputs: [] }}
        skillConditionSkill={{ id: "skill-a", name: "午夜噪音" }}
        view={{
          attackerName: "黑猫密探",
          defenderName: "梦想三三",
          rows: [],
          selectedResult: {
            hpPercent: 49.9,
            remainingHp: 206,
            skillName: "午夜噪音",
            totalDamage: 205,
          },
          status: "exact",
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "预览并分享" }));
    const preview = screen.getByRole("dialog", { name: "分享预览" });
    expect(within(preview).getByText(/羽化加速已应用/u)).toBeInTheDocument();
    expect(within(preview).getByText(/先知：触发层数 1/u)).toBeInTheDocument();
    expect(within(preview).queryByText("默认参数")).not.toBeInTheDocument();
    expect(within(preview).queryByText("无额外战斗条件"))
      .not.toBeInTheDocument();
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
