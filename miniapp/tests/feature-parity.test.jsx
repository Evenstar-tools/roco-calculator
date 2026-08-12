import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import BattleWorkspace from "../src/components/BattleWorkspace.jsx";
import SkillSlots from "../src/components/SkillSlots.jsx";
import { createCalculatorStore } from "../src/state/calculator-store.js";
import { selectDamageResult } from "../src/view-models/calculation.js";

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

  test("applies a status skill from the four-skill workflow", () => {
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
    fireEvent.click(
      screen.getByRole("button", { name: "应用当前技能状态" }),
    );

    expect(store.getState().directions.forward.overrides).toMatchObject({
      attackLevelStage: 9,
      attackerSpeedFlat: 60,
    });
    expect(screen.getByText("蒸汽进行曲状态已应用")).toBeInTheDocument();
  });

  test("edits both sides ability stages from the battle-state sheet", () => {
    const snapshot = snapshotFixture();
    const store = createCalculatorStore(snapshot);
    render(<BattleWorkspace snapshot={snapshot} store={store} />);

    fireEvent.click(screen.getByRole("button", { name: "编辑战斗条件" }));
    fireEvent.click(screen.getByRole("button", { name: "攻击方攻击提高一级" }));
    fireEvent.click(screen.getByRole("button", { name: "防守方防御降低一级" }));

    expect(store.getState().directions.forward.overrides).toMatchObject({
      attackLevelStage: 1,
      defenseLevelStage: -1,
    });
  });
});
