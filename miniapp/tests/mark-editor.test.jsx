import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import BattleWorkspace from "../src/components/BattleWorkspace.jsx";
import { createCalculatorStore } from "../src/state/calculator-store.js";

function createSnapshot() {
  const raceStats = {
    hp: 100,
    magicalAttack: 100,
    magicalDefense: 100,
    physicalAttack: 100,
    physicalDefense: 100,
    speed: 100,
  };
  return {
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
        fullName: "攻击方",
        id: "spirit-a",
        raceStats,
        types: ["普通"],
      },
      {
        fullName: "防守方",
        id: "spirit-b",
        raceStats,
        types: ["普通"],
      },
    ],
    traits: [],
    typeChart: { matrix: [[1]], types: ["普通"] },
  };
}

describe("MarkEditor", () => {
  test("keeps mark stack inputs mounted while their marks are unselected", () => {
    const snapshot = createSnapshot();
    const store = createCalculatorStore(snapshot);
    const { container } = render(
      <BattleWorkspace snapshot={snapshot} store={store} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "编辑战斗条件" }));

    const hiddenField = container.querySelector(
      ".mark-editor__stacks--hidden",
    );
    const inputBeforeSelection = hiddenField.querySelector("input");
    expect(inputBeforeSelection).toBeDisabled();

    fireEvent.click(
      screen.getByRole("button", { name: "攻击方正面印记萌芽" }),
    );

    const inputAfterSelection = screen.getByLabelText("攻击方萌芽层数");
    expect(inputAfterSelection).toBe(inputBeforeSelection);
    expect(inputAfterSelection).toBeEnabled();
    expect(inputAfterSelection.closest(".mark-editor__stacks")).not.toHaveClass(
      "mark-editor__stacks--hidden",
    );
  });

  test("edits sprout marks for the owning side", () => {
    const snapshot = createSnapshot();
    const store = createCalculatorStore(snapshot);
    render(<BattleWorkspace snapshot={snapshot} store={store} />);
    fireEvent.click(screen.getByRole("button", { name: "编辑战斗条件" }));

    fireEvent.click(
      screen.getByRole("button", { name: "攻击方正面印记萌芽" }),
    );
    fireEvent.input(screen.getByLabelText("攻击方萌芽层数"), {
      target: { value: "3" },
    });

    expect(store.getState().marks.attacker.positive).toEqual({
      id: "sprout",
      stacks: 3,
    });
    expect(store.getState().marks.defender.positive).toEqual({
      id: null,
      stacks: 0,
    });
  });

  test("selecting no mark clears its stacks", () => {
    const snapshot = createSnapshot();
    const store = createCalculatorStore(snapshot);
    store.dispatch({
      polarity: "negative",
      side: "defender",
      type: "mark/update",
      value: { id: "starfall", stacks: 4 },
    });
    render(<BattleWorkspace snapshot={snapshot} store={store} />);
    fireEvent.click(screen.getByRole("button", { name: "编辑战斗条件" }));

    fireEvent.click(
      screen.getByRole("button", { name: "防守方负面印记无" }),
    );

    expect(store.getState().marks.defender.negative).toEqual({
      id: null,
      stacks: 0,
    });
  });
});
