import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import BattleWorkspace from "../src/components/BattleWorkspace.jsx";
import TraitConditionEditor from "../src/components/TraitConditionEditor.jsx";
import { createCalculatorStore } from "../src/state/calculator-store.js";
import { createDirectionTraitViews } from "../src/view-models/traits.js";

function fixtureFor(traitName) {
  return {
    onChange: vi.fn(),
    values: {},
    views: {
      attacker: {
        automaticStack: null,
        controls: [
          {
            canonicalKey: "trait.traitActivated.activation",
            defaultValue: false,
            id: "attackerTrait.traitActivated.activation",
            label: "满足触发条件",
            type: "boolean",
          },
        ],
        description: "测试特性说明",
        name: traitName,
        ownerSide: "attacker",
      },
      defender: null,
    },
  };
}

describe("TraitConditionEditor", () => {
  test.each([
    "极光千兽",
    "陨星虫",
    "张弛有度",
    "凡鹰",
    "胡桃王子",
  ])("renders typed controls for %s", (traitName) => {
    render(<TraitConditionEditor {...fixtureFor(traitName)} />);

    expect(screen.getByText(traitName)).toBeInTheDocument();
    expect(
      screen.queryAllByRole("button").length +
        screen.queryAllByRole("textbox").length,
    ).toBeGreaterThan(0);
  });

  test("edits the defensive trait on its owning side", () => {
    const onChange = vi.fn();
    render(
      <TraitConditionEditor
        onChange={onChange}
        values={{ defender: {} }}
        views={{
          attacker: null,
          defender: {
            automaticStack: {
              label: "自动增益层数",
              value: 2,
            },
            controls: [
              {
                canonicalKey: "trait.defenderTraitStacks.stack",
                defaultValue: 0,
                id: "defenderTrait.defenderTraitStacks.stack",
                label: "不同增益种类",
                min: 0,
                type: "number",
              },
            ],
            description: "每种不同增益提高物防。",
            name: "守护之心",
            ownerSide: "defender",
          },
        }}
      />,
    );

    expect(screen.getByText("防御特性")).toBeInTheDocument();
    expect(screen.getByText("自动增益层数：2")).toBeInTheDocument();
    fireEvent.input(screen.getByLabelText("不同增益种类"), {
      target: { value: "3" },
    });
    expect(onChange).toHaveBeenCalledWith(
      "defender",
      "trait.defenderTraitStacks.stack",
      3,
    );
  });

  test("dispatches a workspace edit to the side that owns the trait", () => {
    const stats = {
      hp: 120,
      magicalAttack: 100,
      magicalDefense: 100,
      physicalAttack: 100,
      physicalDefense: 100,
      speed: 100,
    };
    const snapshot = {
      learnsets: [],
      meta: { id: "data-v1", rulesVersion: "rules-v1" },
      skills: [
        {
          basePower: 60,
          category: "physical",
          id: "skill-a",
          name: "测试技能",
          type: "普通",
        },
      ],
      spirits: [
        {
          fullName: "测试攻击方",
          id: "spirit-a",
          raceStats: stats,
          types: ["普通"],
        },
        {
          fullName: "守护宠物",
          id: "spirit-b",
          raceStats: stats,
          traitIds: ["trait-guardian-heart"],
          types: ["普通"],
        },
      ],
      traits: [
        {
          description: "每种不同增益提高物防。",
          id: "trait-guardian-heart",
          name: "守护之心",
        },
      ],
      typeChart: { matrix: [[1]], types: ["普通"] },
    };
    const store = createCalculatorStore(snapshot);

    render(<BattleWorkspace snapshot={snapshot} store={store} />);

    fireEvent.click(screen.getByRole("button", { name: "编辑战斗条件" }));
    fireEvent.input(screen.getByLabelText("不同增益种类"), {
      target: { value: "3" },
    });
    expect(store.getState().sides.attacker.traitValues).toEqual({});
    expect(
      Object.values(store.getState().sides.defender.traitValues),
    ).toEqual([3]);
  });

  test("triggers and cancels a battle-scoped trait from the result sheet", () => {
    const stats = {
      hp: 120,
      magicalAttack: 100,
      magicalDefense: 100,
      physicalAttack: 100,
      physicalDefense: 100,
      speed: 100,
    };
    const snapshot = {
      learnsets: [
        { spiritId: "spirit-a", skillIds: ["skill-a"] },
        { spiritId: "spirit-b", skillIds: ["skill-a"] },
      ],
      meta: { id: "data-v1", rulesVersion: "rules-v1" },
      skills: [
        {
          basePower: 35,
          category: "physical",
          description: "造成1连击伤害。",
          id: "skill-a",
          name: "旋转突击",
          type: "普通",
        },
      ],
      spirits: [
        {
          fullName: "吸泥鸥",
          id: "spirit-a",
          raceStats: stats,
          traitIds: ["trait-filter"],
          types: ["普通"],
        },
        {
          fullName: "测试守方",
          id: "spirit-b",
          raceStats: stats,
          types: ["普通"],
        },
      ],
      traits: [
        {
          description: "在场时，所有精灵连击数固定为2。",
          id: "trait-filter",
          name: "无差别过滤",
        },
      ],
      typeChart: { matrix: [[1]], types: ["普通"] },
    };
    const store = createCalculatorStore(snapshot);

    render(<BattleWorkspace snapshot={snapshot} store={store} />);
    fireEvent.click(screen.getByRole("button", { name: "展开伤害结果" }));
    fireEvent.click(screen.getByRole("button", { name: "增减" }));
    fireEvent.click(screen.getByRole("button", { name: "触发无差别过滤" }));

    expect(store.getState().sides.attacker.traitValues).toEqual({});
    expect(
      Object.entries(store.getState().directions.forward.context),
    ).toEqual(expect.arrayContaining([
      [expect.stringMatching(/^attackerTrait\.indiscriminateFilterActivated\./u), true],
    ]));
    expect(
      Object.entries(store.getState().directions.reverse.context),
    ).toEqual(expect.arrayContaining([
      [expect.stringMatching(/^defenderTrait\.indiscriminateFilterActivated\./u), true],
    ]));
    expect(screen.getByRole("dialog", { name: "伤害结果" }))
      .toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "撤销无差别过滤" }));
    expect(store.getState().directions.forward.context).toEqual({});
    expect(store.getState().directions.reverse.context).toEqual({});
    expect(screen.getByRole("dialog", { name: "伤害结果" }))
      .toBeInTheDocument();

    const control = createDirectionTraitViews(
      snapshot,
      store.getState(),
      "forward",
    ).attacker.controls[0];
    act(() => {
      store.dispatch({
        direction: "forward",
        key: control.id,
        type: "battle/set-trait-control",
        value: true,
      });
    });
    fireEvent.click(screen.getByRole("button", { name: "撤销无差别过滤" }));
    expect(store.getState().directions.forward.context[control.id]).toBe(false);
    expect(screen.getByRole("button", { name: "触发无差别过滤" }))
      .toBeInTheDocument();
  });
});

describe("createDirectionTraitViews", () => {
  test("derives 冻土 automatic stacks from the owner's carried ice skills", () => {
    const snapshot = {
      skills: [
        { id: "ice-a", name: "冰一", type: "冰" },
        { id: "ice-b", name: "冰二", type: "冰" },
        { id: "ground-a", name: "地一", type: "地" },
      ],
      spirits: [
        { id: "spirit-a", traitIds: ["trait-tundra"] },
        { id: "spirit-b" },
      ],
      traits: [{ id: "trait-tundra", name: "冻土" }],
    };
    const state = {
      sides: {
        attacker: {
          skills: {
            four: ["ice-a", { skillId: "ice-b" }, "ground-a", null],
            single: "ground-a",
          },
          spiritId: "spirit-a",
        },
        defender: {
          skills: { four: [], single: null },
          spiritId: "spirit-b",
        },
      },
    };

    const view = createDirectionTraitViews(snapshot, state, "forward");

    expect(view.attacker.automaticStack).toEqual({
      label: "携带冰系技能数",
      skillTypes: ["冰"],
      value: 2,
    });
  });

  test("maps attacker and defender roles back to the owning sides", () => {
    const snapshot = {
      skills: [],
      spirits: [
        {
          id: "spirit-a",
          traitIds: ["trait-focus"],
        },
        {
          id: "spirit-b",
          traitIds: ["trait-polarization"],
        },
      ],
      traits: [
        { id: "trait-focus", name: "专注力" },
        { id: "trait-polarization", name: "偏振" },
      ],
    };
    const state = {
      sides: {
        attacker: { spiritId: "spirit-a" },
        defender: { spiritId: "spirit-b" },
      },
    };

    const forward = createDirectionTraitViews(
      snapshot,
      state,
      "forward",
    );
    const reverse = createDirectionTraitViews(
      snapshot,
      state,
      "reverse",
    );

    expect(forward.attacker).toMatchObject({
      name: "专注力",
      ownerSide: "attacker",
    });
    expect(forward.defender).toMatchObject({
      name: "偏振",
      ownerSide: "defender",
    });
    expect(forward.attacker.controls[0].canonicalKey).toMatch(
      /^trait\./u,
    );
    expect(reverse.attacker).toMatchObject({
      controls: [],
      name: "偏振",
      ownerSide: "defender",
    });
    expect(reverse.defender).toMatchObject({
      controls: [],
      name: "专注力",
      ownerSide: "attacker",
    });
  });
});
