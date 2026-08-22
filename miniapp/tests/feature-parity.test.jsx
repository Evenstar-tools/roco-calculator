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
      { spiritId: "attacker", skillIds: ["steam", "scratch"] },
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

    fireEvent.click(screen.getByRole("button", { name: "编辑战斗条件" }));
    const increase = screen.getByRole("button", { name: "当前攻击等级提高一级" });
    fireEvent.click(increase);
    fireEvent.click(increase);
    expect(store.getState().directions.forward.overrides.attackLevelStage).toBe(2);
    fireEvent.click(screen.getByRole("button", { name: "撤回上一步" }));
    expect(store.getState().directions.forward.overrides.attackLevelStage ?? 0).toBe(0);
    expect(store.getState().mode).toBe("four");
  });

  test("restores and persists the draggable undo position", () => {
    const snapshot = snapshotFixture();
    const store = createCalculatorStore(snapshot);
    const onQuickUndoPositionChange = vi.fn();
    render(
      <BattleWorkspace
        onQuickUndoPositionChange={onQuickUndoPositionChange}
        quickUndoEnabled
        quickUndoPosition={{ bottom: 140, right: 24 }}
        snapshot={snapshot}
        store={store}
      />,
    );

    const undoHandle = screen.getByLabelText("移动撤回按钮");
    expect(undoHandle).toHaveStyle({ bottom: "140px", right: "24px" });
    fireEvent.touchStart(undoHandle, {
      touches: [{ clientX: 320, clientY: 500 }],
    });
    fireEvent.touchMove(undoHandle, {
      touches: [{ clientX: 280, clientY: 460 }],
    });
    fireEvent.touchEnd(undoHandle);

    expect(onQuickUndoPositionChange).toHaveBeenLastCalledWith({
      bottom: 180,
      right: 64,
    });
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

  test("applies and safely undoes a status skill from the result sheet", () => {
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
    fireEvent.click(screen.getByRole("button", { name: "增减" }));
    fireEvent.click(
      screen.getByRole("button", { name: "触发蒸汽进行曲" }),
    );

    expect(store.getState().directions.forward.overrides).toMatchObject({
      attackLevelStage: 9,
      attackerSpeedFlat: 60,
    });
    expect(screen.getByText("蒸汽进行曲状态已应用")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "伤害结果" }))
      .toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "撤销蒸汽进行曲" }),
    );
    expect(store.getState().directions.forward.overrides).toEqual({});
    expect(screen.getByRole("dialog", { name: "伤害结果" }))
      .toBeInTheDocument();
  });

  test("keeps ability stages inside the battle condition sheet", () => {
    const snapshot = snapshotFixture();
    const store = createCalculatorStore(snapshot);
    render(<BattleWorkspace snapshot={snapshot} store={store} />);

    expect(screen.queryByLabelText("当前计算能力等级")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "编辑战斗条件" }));
    expect(screen.queryByLabelText("能力等级")).not.toBeInTheDocument();
    expect(within(screen.getByRole("dialog", { name: "战斗条件" }))
      .getByLabelText("当前计算能力等级")).toBeInTheDocument();
  });

  test("edits the active calculation ability stages from the battle condition sheet", () => {
    const snapshot = snapshotFixture();
    const store = createCalculatorStore(snapshot);
    render(<BattleWorkspace snapshot={snapshot} store={store} />);

    fireEvent.click(screen.getByRole("button", { name: "编辑战斗条件" }));
    const editor = screen.getByLabelText("当前计算能力等级");
    fireEvent.click(within(editor).getByRole("button", {
      name: "当前攻击等级提高一级",
    }));
    fireEvent.click(within(editor).getByRole("button", {
      name: "当前防御等级降低一级",
    }));

    expect(store.getState().directions.forward.overrides).toMatchObject({
      attackLevelStage: 1,
      defenseLevelStage: -1,
    });
  });

  test("caps active calculation ability stages at positive and negative 99", () => {
    const snapshot = snapshotFixture();
    const store = createCalculatorStore(snapshot);
    render(<BattleWorkspace snapshot={snapshot} store={store} />);

    fireEvent.click(screen.getByRole("button", { name: "编辑战斗条件" }));
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
    expect(increase).toBeDisabled();
    expect(decrease).toBeDisabled();
  });
});
