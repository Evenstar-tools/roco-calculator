import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import BattleWorkspace from "../src/components/BattleWorkspace.jsx";
import BattleAdvancedEditor from "../src/components/BattleAdvancedEditor.jsx";
import SkillSlots from "../src/components/SkillSlots.jsx";
import { createCalculatorStore } from "../src/state/calculator-store.js";
import {
  createCalculationView,
  selectDamageResult,
} from "../src/view-models/calculation.js";

function snapshotFixture() {
  const raceStats = {
    hp: 100,
    magicalAttack: 100,
    magicalDefense: 100,
    physicalAttack: 100,
    physicalDefense: 100,
    speed: 100,
  };
  return {
    learnsets: [
      {
        spiritId: "attacker",
        skillIds: ["steam", "feather", "reassembly", "scratch"],
      },
      { spiritId: "defender", skillIds: ["scratch"] },
    ],
    meta: { id: "test-data", rulesVersion: "test-rules" },
    skills: [
      {
        basePower: 0,
        category: "status",
        id: "steam",
        name: "蒸汽进行曲",
        type: "机械",
      },
      {
        basePower: 35,
        category: "physical",
        id: "scratch",
        name: "抓挠",
        type: "普通",
      },
      {
        basePower: 0,
        category: "status",
        id: "feather",
        name: "羽化加速",
        type: "翼",
      },
      {
        basePower: 0,
        category: "status",
        description:
          "下一次攻击时，额外造成100%幻系伤害，应对防御：改为额外造成300%幻系伤害。",
        id: "reassembly",
        name: "重组",
        type: "幻",
      },
    ],
    spirits: [
      {
        fullName: "测试攻方",
        id: "attacker",
        raceStats,
        traitIds: [],
        types: ["普通"],
      },
      {
        fullName: "测试守方",
        id: "defender",
        raceStats,
        traitIds: [],
        types: ["普通"],
      },
    ],
    traits: [],
    typeChart: { matrix: [[1]], types: ["普通"] },
  };
}

describe("mini-program desktop feature parity", () => {
  test("shows optional negative status controls only when enabled", () => {
    const snapshot = snapshotFixture();
    const store = createCalculatorStore(snapshot);
    const { rerender } = render(
      <BattleWorkspace
        negativeStatusEnabled={false}
        snapshot={snapshot}
        store={store}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "编辑战斗条件" }));
    expect(screen.queryByLabelText("负面状态层数")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "关闭战斗条件" }));
    rerender(
      <BattleWorkspace
        negativeStatusEnabled
        snapshot={snapshot}
        store={store}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "编辑战斗条件" }));
    expect(screen.getByLabelText("负面状态层数")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "查看防守方负面状态" }))
      .toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("button", { name: "攻击方灼烧层数增加" }))
      .not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "查看攻击方负面状态" }));
    expect(screen.getByRole("button", { name: "攻击方灼烧层数增加" }))
      .toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "防守方灼烧层数增加" }))
      .not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "雷暴" }));
    expect(store.getState().directions.forward.context.weatherThunder).toBe(true);
    expect(store.getState().directions.reverse.context.weatherThunder).toBe(true);
  });

  test("keeps mode changes out of undo and coalesces rapid control changes", () => {
    const snapshot = snapshotFixture();
    const store = createCalculatorStore(snapshot);
    const { rerender } = render(
      <BattleWorkspace quickUndoEnabled={false} snapshot={snapshot} store={store} />,
    );
    expect(screen.queryByRole("button", { name: "撤回上一步" }))
      .not.toBeInTheDocument();

    rerender(
      <BattleWorkspace quickUndoEnabled snapshot={snapshot} store={store} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "四技能模式" }));
    expect(store.getState().mode).toBe("four");
    expect(screen.getByRole("button", { name: "撤回上一步" })).toBeDisabled();

    const increase = screen.getByRole("button", { name: "当前攻击等级提高一级" });
    fireEvent.click(increase);
    fireEvent.click(increase);
    expect(store.getState().directions.forward.overrides.attackLevelStage).toBe(2);
    fireEvent.click(screen.getByRole("button", { name: "撤回上一步" }));
    expect(store.getState().directions.forward.overrides.attackLevelStage ?? 0).toBe(0);
    expect(store.getState().mode).toBe("four");
  });

  test("docks quick undo beside the mode switch without covering content", () => {
    const snapshot = snapshotFixture();
    const store = createCalculatorStore(snapshot);
    render(
      <BattleWorkspace
        quickUndoEnabled
        snapshot={snapshot}
        store={store}
      />,
    );

    const toolbar = screen.getByLabelText("技能操作");
    expect(within(toolbar).getByRole("button", { name: "撤回上一步" }))
      .toBeInTheDocument();
    expect(screen.queryByLabelText("移动撤回按钮")).not.toBeInTheDocument();
  });

  test("selects direct trait damage as the active result source", () => {
    const skill = { skillName: "抓挠", totalDamage: 30 };
    const trait = { skillName: "刺肤", totalDamage: 50 };

    expect(selectDamageResult({
      rows: [skill],
      selectedDamageSource: "trait",
      selectedIndex: 0,
      traitResult: trait,
    })).toEqual({
      selectedDamageSource: "trait",
      selectedResult: trait,
    });
  });

  test("selects bloodline damage as the active result source", () => {
    const skill = { skillName: "抓挠", totalDamage: 30 };
    const bloodline = { skillName: "戏耍·光合治愈", totalDamage: 50 };

    expect(selectDamageResult({
      bloodlineResult: bloodline,
      rows: [skill],
      selectedDamageSource: "bloodline",
      selectedIndex: 0,
      traitResult: null,
    })).toEqual({
      selectedDamageSource: "bloodline",
      selectedResult: bloodline,
    });
  });

  test("exposes desktop bloodline magic choices in advanced conditions", () => {
    const onChange = vi.fn();
    render(
      <BattleAdvancedEditor
        direction={{ context: {}, finalDamageMultiplier: 1, reduction: 1 }}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "展开高级参数" }));
    fireEvent.click(screen.getByRole("button", { name: "选择光合治愈" }));
    expect(onChange).toHaveBeenCalledWith({
      context: {
        bloodlineMagicId: "photosynthetic-healing",
        bloodlineMagicTriggered: false,
      },
    });
    expect(screen.getByText("当前仅光合治愈参与伤害结算"))
      .toBeInTheDocument();
  });

  test("keeps desktop type analysis data in the mini-program result view", () => {
    const snapshot = snapshotFixture();
    const store = createCalculatorStore(snapshot);
    const view = createCalculationView(snapshot, store.getState(), "forward");

    expect(view.typeAnalysis).toMatchObject({
      subjectName: "测试攻方",
      defense: expect.any(Object),
      offense: expect.any(Object),
    });
  });

  test("renders seven skill slots for the extra-slot trait", () => {
    const snapshot = snapshotFixture();
    snapshot.spirits[0].traitIds = ["dazzling"];
    snapshot.traits = [
      {
        description: "额外获得三个未携带的随机技能。",
        id: "dazzling",
        name: "夺目",
      },
    ];
    const store = createCalculatorStore(snapshot);

    expect(store.getState().sides.attacker.skills.four).toHaveLength(7);
    render(
      <SkillSlots
        choices={[]}
        label="攻击方"
        onChange={() => {}}
        onSelect={() => {}}
        rows={[]}
        selectedIndex={0}
        values={store.getState().sides.attacker.skills.four}
      />,
    );
    expect(
      screen.getByRole("button", { name: "选择攻击方技能 7" }),
    ).toBeInTheDocument();
  });

  test("defaults a selected status skill to triggered and safely undoes it", () => {
    const snapshot = snapshotFixture();
    const store = createCalculatorStore(snapshot);
    store.dispatch({ type: "mode/set", value: "four" });
    store.dispatch({
      index: 0,
      side: "attacker",
      type: "side/set-four-skill",
      value: {
        context: { applyAttackBoost: true, applySpeedBoost: true },
        skillId: "steam",
      },
    });

    render(<BattleWorkspace snapshot={snapshot} store={store} />);
    fireEvent.click(screen.getByRole("button", { name: "展开伤害结果" }));
    expect(screen.getByRole("dialog", { name: "伤害结果" }))
      .toBeInTheDocument();
    expect(screen.getByRole("button", { name: "取消状态触发" }))
      .toHaveTextContent("已触发");
    fireEvent.click(screen.getByRole("button", { name: "增减" }));
    expect(screen.queryByRole("button", { name: "撤销蒸汽进行曲" }))
      .not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "技能参数" }));

    expect(store.getState().directions.forward.overrides).toMatchObject({
      attackLevelStage: 9,
      attackerSpeedFlat: 60,
    });
    expect(screen.getByRole("dialog", { name: "伤害结果" }))
      .toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "取消状态触发" }),
    );
    expect(store.getState().directions.forward.overrides).toEqual({});
    expect(screen.getByRole("dialog", { name: "伤害结果" }))
      .toBeInTheDocument();
  });

  test("reapplies a repeatable status skill when its trigger count changes", () => {
    const snapshot = snapshotFixture();
    const store = createCalculatorStore(snapshot);
    store.dispatch({ type: "mode/set", value: "four" });
    store.dispatch({
      index: 0,
      side: "attacker",
      type: "side/set-four-skill",
      value: { skillId: "feather" },
    });

    render(<BattleWorkspace snapshot={snapshot} store={store} />);
    fireEvent.click(screen.getByRole("button", { name: "展开伤害结果" }));

    expect(store.getState().directions.forward.overrides.fixedPowerAdd).toBe(20);
    expect(screen.getByRole("button", { name: "取消状态触发" }))
      .toHaveTextContent("已触发");
    fireEvent.input(screen.getByLabelText("状态触发次数"), {
      target: { value: "2" },
    });

    expect(store.getState().sides.attacker.skills.four[0].statusTriggerCount)
      .toBe(2);
    expect(store.getState().directions.forward.overrides.fixedPowerAdd).toBe(40);
    expect(screen.getByText("全技能威力 +40")).toBeInTheDocument();
    expect(screen.queryByLabelText("静态威力")).not.toBeInTheDocument();
  });

  test("reapplies 重组 after its response toggle changes and carries it to an attack", () => {
    const snapshot = snapshotFixture();
    const store = createCalculatorStore(snapshot);
    store.dispatch({ type: "mode/set", value: "four" });
    store.dispatch({
      index: 0,
      side: "attacker",
      type: "side/set-four-skill",
      value: { context: {}, skillId: "reassembly" },
    });
    store.dispatch({
      index: 1,
      side: "attacker",
      type: "side/set-four-skill",
      value: { skillId: "scratch" },
    });

    render(<BattleWorkspace snapshot={snapshot} store={store} />);
    fireEvent.click(screen.getByRole("button", { name: "展开伤害结果" }));
    expect(store.getState().marks.attacker.positive).toEqual({
      id: "reassembly",
      stacks: 1,
    });

    fireEvent.click(screen.getByRole("button", { name: "应对防御成功" }));
    expect(store.getState().marks.attacker.positive).toEqual({
      id: "reassembly",
      stacks: 3,
    });

    fireEvent.click(screen.getByRole("button", { name: "关闭伤害结果" }));
    fireEvent.click(screen.getByRole("button", { name: "选择攻击方技能 2" }));
    fireEvent.click(
      screen.getAllByRole("button", { name: "关闭攻击方技能 2选项" })[1],
    );
    fireEvent.click(screen.getByRole("button", { name: "展开伤害结果" }));
    const attackResult = createCalculationView(
      snapshot,
      store.getState(),
      "forward",
    ).rows[1];
    expect(attackResult.reassemblyDamage).toBeGreaterThan(0);
    expect(attackResult.totalDamage).toBe(
      attackResult.mainDamage +
        attackResult.additionalDamage +
        attackResult.reassemblyDamage +
        attackResult.traitDamage,
    );
    expect(screen.getByText(/重组（应对防御）：追加 300% 幻系伤害/u))
      .toBeInTheDocument();
  });

  test("does not stack a selected status action after the workspace remounts", () => {
    const snapshot = snapshotFixture();
    const store = createCalculatorStore(snapshot);
    store.dispatch({ type: "mode/set", value: "four" });
    store.dispatch({
      index: 0,
      side: "attacker",
      type: "side/set-four-skill",
      value: { skillId: "feather" },
    });

    const first = render(<BattleWorkspace snapshot={snapshot} store={store} />);
    fireEvent.click(screen.getByRole("button", { name: "展开伤害结果" }));
    expect(store.getState().directions.forward.overrides.fixedPowerAdd).toBe(20);
    expect(store.getState().sides.attacker.skills.four[0].statusAction)
      .toMatchObject({ actionKey: "skill:attacker:four:0" });
    first.unmount();

    render(<BattleWorkspace snapshot={snapshot} store={store} />);
    fireEvent.click(screen.getByRole("button", { name: "展开伤害结果" }));
    expect(store.getState().directions.forward.overrides.fixedPowerAdd).toBe(20);
    fireEvent.click(screen.getByRole("button", { name: "取消状态触发" }));
    expect(store.getState().directions.forward.overrides).toEqual({});
  });

  test("keeps ability stages on the main workspace without duplicating them in conditions", () => {
    const snapshot = snapshotFixture();
    const store = createCalculatorStore(snapshot);
    render(<BattleWorkspace snapshot={snapshot} store={store} />);

    const editor = screen.getByLabelText("当前计算能力等级");
    expect(within(editor).getByText("攻击方")).toBeInTheDocument();
    expect(within(editor).getByText("防守方")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "编辑战斗条件" }));
    expect(screen.queryByLabelText("能力等级")).not.toBeInTheDocument();
    expect(within(screen.getByRole("dialog", { name: "战斗条件" }))
      .queryByLabelText("当前计算能力等级")).not.toBeInTheDocument();
  });

  test("edits the active calculation ability stages from the main workspace", () => {
    const snapshot = snapshotFixture();
    const store = createCalculatorStore(snapshot);
    render(<BattleWorkspace snapshot={snapshot} store={store} />);

    const editor = screen.getByLabelText("当前计算能力等级");
    fireEvent.click(within(editor).getByRole("button", {
      name: "当前攻击等级提高一级",
    }));
    fireEvent.click(within(editor).getByRole("button", {
      name: "当前防御等级降低一级",
    }));

    expect(within(editor).getByText("+1层"))
      .toBeInTheDocument();
    expect(within(editor).getByText("+10%"))
      .toBeInTheDocument();
    expect(within(editor).getByText("-1层"))
      .toBeInTheDocument();
    expect(within(editor).getByText("-10%"))
      .toBeInTheDocument();
    expect(store.getState().directions.forward.overrides).toMatchObject({
      attackLevelStage: 1,
      defenseLevelStage: -1,
    });
  });

  test("caps active calculation ability stages at positive and negative 99", () => {
    const snapshot = snapshotFixture();
    const store = createCalculatorStore(snapshot);
    render(<BattleWorkspace snapshot={snapshot} store={store} />);

    const editor = screen.getByLabelText("当前计算能力等级");
    const increase = within(editor).getByRole("button", {
      name: "当前攻击等级提高一级",
    });
    const decrease = within(editor).getByRole("button", {
      name: "当前防御等级降低一级",
    });
    for (let index = 0; index < 100; index += 1) {
      fireEvent.click(increase);
      fireEvent.click(decrease);
    }

    expect(store.getState().directions.forward.overrides).toMatchObject({
      attackLevelStage: 99,
      defenseLevelStage: -99,
    });
    expect(within(editor).getByText("+99层")).toBeInTheDocument();
    expect(within(editor).getByText("+990%")).toBeInTheDocument();
    expect(within(editor).getByText("-99层")).toBeInTheDocument();
    expect(within(editor).getByText("-990%")).toBeInTheDocument();
    expect(increase).toBeDisabled();
    expect(decrease).toBeDisabled();
  });
});
