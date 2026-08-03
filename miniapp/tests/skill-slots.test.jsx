import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import BattleWorkspace from "../src/components/BattleWorkspace.jsx";
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
        basePower: 40,
        category: "physical",
        id: "skill-b",
        name: "闪燃",
        type: "火",
      },
      {
        basePower: 60,
        category: "physical",
        id: "skill-c",
        name: "试飞",
        type: "火",
      },
      {
        basePower: 70,
        category: "magical",
        id: "skill-d",
        name: "潮汐冲击",
        type: "水",
      },
      {
        basePower: 999,
        category: "physical",
        id: "skill-illegal",
        name: "不可学习",
        type: "火",
      },
    ],
    learnsets: [
      {
        spiritId: "spirit-a",
        skillIds: ["skill-a", "skill-b", "skill-c"],
      },
      {
        spiritId: "spirit-b",
        skillIds: ["skill-d"],
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

describe("mini program skill workflow", () => {
  test("switches to four-skill mode and dispatches legal slot changes", () => {
    const snapshot = createSnapshot();
    const store = createCalculatorStore(snapshot);
    store.dispatch({
      legalSkillIds: ["skill-a", "skill-b", "skill-c"],
      side: "attacker",
      type: "side/set-spirit",
      value: "spirit-a",
    });
    render(<BattleWorkspace snapshot={snapshot} store={store} />);

    fireEvent.click(
      screen.getByRole("button", { name: "四技能模式" }),
    );
    expect(store.getState().mode).toBe("four");

    fireEvent.click(
      screen.getByRole("button", { name: "选择攻击方技能 2" }),
    );
    const picker = screen.getByLabelText("攻击方技能 2选项");
    expect(
      within(picker).queryByRole("button", { name: /不可学习/ }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      within(picker).getByRole("button", { name: /闪燃/ }),
    );

    fireEvent.click(screen.getByRole("button", { name: "触发应对" }));
    fireEvent.input(screen.getByLabelText("手动威力"), {
      target: { value: "95" },
    });
    fireEvent.input(screen.getByLabelText("连击数"), {
      target: { value: "3" },
    });

    expect(store.getState().sides.attacker.skills.four[1]).toEqual({
      context: { counterTriggered: true },
      hitCount: 3,
      overrides: { basePower: 95 },
      skillId: "skill-b",
    });
    expect(
      store.getState().directions.forward.selectedSkillIndex,
    ).toBe(1);
    expect(store.getState().directions.forward.context).toEqual({});
  });

  test("edits boolean, number, enum, manual power, and hit count inputs", () => {
    const snapshot = createSnapshot();
    const store = createCalculatorStore(snapshot);
    store.dispatch({
      side: "attacker",
      type: "side/set-single-skill",
      value: "skill-c",
    });
    render(<BattleWorkspace snapshot={snapshot} store={store} />);

    fireEvent.click(screen.getByRole("button", { name: "连击成长" }));
    expect(
      store.getState().directions.forward.context.flightMode,
    ).toBe("hits");

    const useCount = screen.getByLabelText("此前使用次数");
    fireEvent.input(useCount, { target: { value: "3" } });
    expect(
      store.getState().directions.forward.context.skillUseCount,
    ).toBe(3);

    fireEvent.click(
      screen.getByRole("button", { name: "选择攻击方单技能" }),
    );
    fireEvent.click(
      within(screen.getByLabelText("攻击方单技能选项")).getByRole(
        "button",
        { name: /闪燃/ },
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "触发应对" }));
    expect(
      store.getState().directions.forward.context.counterTriggered,
    ).toBe(true);

    fireEvent.input(screen.getByLabelText("手动威力"), {
      target: { value: "95" },
    });
    fireEvent.input(screen.getByLabelText("连击数"), {
      target: { value: "3" },
    });
    expect(store.getState().directions.forward).toMatchObject({
      hitCount: 3,
      overrides: { basePower: 95 },
    });
  });

  test("calculates reverse direction from the defender skill without swapping configurations", () => {
    const snapshot = createSnapshot();
    const store = createCalculatorStore(snapshot);
    store.dispatch({
      legalSkillIds: ["skill-d"],
      side: "defender",
      type: "side/set-spirit",
      value: "spirit-b",
    });
    const before = store.getState().sides;
    render(<BattleWorkspace snapshot={snapshot} store={store} />);

    fireEvent.click(
      screen.getByRole("button", { name: "查看防守方攻击结果" }),
    );

    expect(store.getState().sides).toBe(before);
    expect(
      screen.getAllByText("防守方 → 攻击方"),
    ).not.toHaveLength(0);
    expect(screen.getAllByText("潮汐冲击")).not.toHaveLength(0);
    expect(screen.getByLabelText("确定性伤害")).not.toBeEmptyDOMElement();
  });
});
