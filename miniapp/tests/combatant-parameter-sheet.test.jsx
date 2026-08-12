import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import CombatantParameterSheet from "../src/components/CombatantParameterSheet.jsx";
import CombatantStatGrid from "../src/components/CombatantStatGrid.jsx";

const snapshot = {
  spirits: [
    {
      id: "spirit-fire",
      fullName: "烈焰兽",
      raceStats: {
        hp: 120,
        speed: 95,
        physicalAttack: 128,
        magicalAttack: 88,
        physicalDefense: 104,
        magicalDefense: 96,
      },
    },
  ],
};

const configuration = {
  spiritId: "spirit-fire",
  nature: "adamant",
  displayIvs: {
    hp: 60,
    speed: 60,
    physicalAttack: 60,
    magicalAttack: 60,
    physicalDefense: 60,
    magicalDefense: 60,
  },
};

describe("combatant parameter surfaces", () => {
  test("opens the full editor from any value in the six-stat grid", () => {
    const onOpen = vi.fn();
    render(
      <CombatantStatGrid
        configuration={configuration}
        onOpen={onOpen}
        side="attacker"
        snapshot={snapshot}
      />,
    );

    expect(screen.getByLabelText("攻击方六维参数")).toHaveTextContent("生命");
    expect(screen.getByLabelText("攻击方物攻 271")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("攻击方速度 198"));

    expect(onOpen).toHaveBeenCalledWith("attacker");
  });

  test("provides one dismissible parameter dialog for the selected side", () => {
    const onClose = vi.fn();
    render(
      <CombatantParameterSheet
        configuration={configuration}
        onClose={onClose}
        onIvChange={vi.fn()}
        onNatureChange={vi.fn()}
        open
        side="attacker"
        snapshot={snapshot}
      />,
    );

    expect(
      screen.getByRole("dialog", { name: "攻击方参数设置" }),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "完成攻击方参数设置" }),
    );

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
