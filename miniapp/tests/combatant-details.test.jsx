import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import BattleWorkspace from "../src/components/BattleWorkspace.jsx";
import { createCalculatorStore } from "../src/state/calculator-store.js";
import {
  clampDisplayIv,
  createCombatantView,
} from "../src/view-models/combatant.js";

const spirit = {
  id: "spirit-fire",
  fullName: "烈焰兽",
  types: ["火"],
  raceStats: {
    hp: 120,
    speed: 95,
    physicalAttack: 128,
    magicalAttack: 88,
    physicalDefense: 104,
    magicalDefense: 96,
  },
};

const snapshot = {
  meta: { id: "data-v1", rulesVersion: "rules-v1" },
  spirits: [spirit],
  skills: [],
  learnsets: [{ spiritId: spirit.id, skillIds: [] }],
};

describe("createCombatantView", () => {
  test("derives panel, race, and display IV as separate stat values", () => {
    const view = createCombatantView(snapshot, {
      spiritId: spirit.id,
      nature: "adamant",
      displayIvs: {
        hp: 60,
        speed: 60,
        physicalAttack: 60,
        magicalAttack: 60,
        physicalDefense: 60,
        magicalDefense: 60,
      },
    });

    expect(
      view.stats.find((stat) => stat.key === "physicalAttack"),
    ).toEqual({
      displayIv: 60,
      key: "physicalAttack",
      label: "物攻",
      panel: 271,
      race: 128,
    });
  });

  test.each([
    ["-8", 0],
    ["59.6", 60],
    [61, 60],
    ["not-a-number", 0],
  ])("clamps display IV %s to %i", (value, expected) => {
    expect(clampDisplayIv(value)).toBe(expected);
  });

  test("keeps a combatant selectable while compact data lacks race stats", () => {
    const view = createCombatantView(
      {
        spirits: [{ id: "spirit-compact", fullName: "精简精灵" }],
      },
      {
        spiritId: "spirit-compact",
        nature: "neutral",
        displayIvs: {},
      },
    );

    expect(view.spirit.fullName).toBe("精简精灵");
    expect(view.stats).toEqual([]);
  });
});

describe("combatant details", () => {
  test("keeps nature and IV editors collapsed until a native details control opens them", () => {
    const store = createCalculatorStore(snapshot);
    render(<BattleWorkspace snapshot={snapshot} store={store} />);

    const attacker = screen.getByLabelText("攻击方配置");
    expect(
      within(attacker).queryByLabelText("攻击方性格"),
    ).not.toBeInTheDocument();

    const expand = within(attacker).getByRole("button", {
      name: "展开攻击方属性配置",
    });
    expect(expand.tagName).toBe("BUTTON");
    expect(expand).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(expand);

    expect(within(attacker).getByLabelText("攻击方性格")).toBeInTheDocument();
    expect(
      within(attacker).getByLabelText("攻击方物攻个体值"),
    ).toBeInTheDocument();
    expect(expand).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(expand);
    expect(
      within(attacker).queryByLabelText("攻击方性格"),
    ).not.toBeInTheDocument();
  });

  test("updates nature and clamped IV through the synchronous calculator store", () => {
    const store = createCalculatorStore(snapshot);
    render(<BattleWorkspace snapshot={snapshot} store={store} />);

    const attacker = screen.getByLabelText("攻击方配置");
    fireEvent.click(
      within(attacker).getByRole("button", {
        name: "展开攻击方属性配置",
      }),
    );
    fireEvent.click(within(attacker).getByLabelText("攻击方性格"));
    fireEvent.click(
      within(attacker).getByRole("button", {
        name: "固执 提升物攻 降低魔攻",
      }),
    );

    expect(store.getState().sides.attacker.nature).toBe("adamant");
    expect(within(attacker).getByText("+20% 物攻")).toBeInTheDocument();
    expect(within(attacker).getByText("-10% 魔攻")).toBeInTheDocument();

    const ivInput = within(attacker).getByLabelText("攻击方物攻个体值");
    fireEvent.input(ivInput, { target: { value: "-8" } });
    fireEvent.blur(ivInput);

    expect(ivInput).toHaveValue(0);
    expect(store.getState().sides.attacker.displayIvs.physicalAttack).toBe(0);

    const physicalAttack = within(attacker).getByLabelText(
      "攻击方物攻能力",
    );
    expect(physicalAttack).toHaveTextContent("面板 231");
    expect(physicalAttack).toHaveTextContent("种族 128");
    expect(physicalAttack).toHaveTextContent("个体");
  });
});
