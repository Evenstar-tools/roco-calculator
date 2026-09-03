import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import BattleWorkspace from "../src/components/BattleWorkspace.jsx";
import CombatantParameterSheet from
  "../src/components/CombatantParameterSheet.jsx";
import CombatantStatGrid from "../src/components/CombatantStatGrid.jsx";
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

describe("combatant parameter surfaces", () => {
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

    expect(screen.getByRole("dialog", { name: "攻击方参数设置" }))
      .toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "完成攻击方参数设置" }),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("combatant details", () => {
  test("keeps nature and IV controls in the same six-stat order", () => {
    const store = createCalculatorStore(snapshot);
    render(<BattleWorkspace snapshot={snapshot} store={store} />);

    fireEvent.click(screen.getByRole("button", {
      name: "打开攻击方详细参数",
    }));
    const attacker = screen.getByRole("dialog", {
      name: "攻击方参数设置",
    });
    const natureRow = within(attacker).getByLabelText("攻击方性格六维");
    const ivRow = within(attacker).getByLabelText("攻击方个体六维");

    expect(within(natureRow).getAllByRole("button").map(
      (button) => button.getAttribute("aria-label"),
    )).toEqual([
      "攻击方生命正面性格",
      "攻击方物攻正面性格",
      "攻击方魔攻正面性格",
      "攻击方速度正面性格",
      "攻击方物防正面性格",
      "攻击方魔防正面性格",
    ]);
    expect(within(ivRow).getAllByRole("button").map(
      (button) => button.getAttribute("aria-label"),
    )).toEqual([
      "攻击方生命个体加点",
      "攻击方物攻个体加点",
      "攻击方魔攻个体加点",
      "攻击方速度个体加点",
      "攻击方物防个体加点",
      "攻击方魔防个体加点",
    ]);
  });

  test("returns to neutral when the selected positive nature is tapped again", () => {
    const store = createCalculatorStore(snapshot);
    render(<BattleWorkspace snapshot={snapshot} store={store} />);

    fireEvent.click(screen.getByRole("button", {
      name: "打开攻击方详细参数",
    }));
    const attacker = screen.getByRole("dialog", {
      name: "攻击方参数设置",
    });
    const quickControls = within(attacker).getByLabelText("攻击方快速属性配置");
    const natureRow = within(attacker).getByLabelText("攻击方性格六维");
    const speedNature = within(attacker).getByRole("button", {
      name: "攻击方速度正面性格",
    });

    fireEvent.click(speedNature);
    expect(store.getState().sides.attacker.nature).toBe("rash");
    expect(speedNature).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(speedNature);
    expect(store.getState().sides.attacker.nature).toBe("neutral");
    expect(speedNature).toHaveAttribute("aria-pressed", "false");
    expect(within(natureRow).getByText("性格")).toBeInTheDocument();
    expect(within(attacker).queryByRole("button", {
      name: "攻击方普通性格",
    })).not.toBeInTheDocument();
    expect(within(quickControls).queryByText(/^普通(?:\s|·|$)/u))
      .not.toBeInTheDocument();
  });

  test("offers desktop-style quick nature and IV controls before detailed fields", () => {
    const store = createCalculatorStore(snapshot);
    for (const stat of [
      "physicalAttack",
      "physicalDefense",
      "magicalDefense",
    ]) {
      store.dispatch({
        side: "attacker",
        stat,
        type: "side/set-iv",
        value: 0,
      });
    }
    render(<BattleWorkspace snapshot={snapshot} store={store} />);

    fireEvent.click(screen.getByRole("button", {
      name: "打开攻击方详细参数",
    }));
    const attacker = screen.getByRole("dialog", {
      name: "攻击方参数设置",
    });
    const speedNature = within(attacker).getByRole("button", {
      name: "攻击方速度正面性格",
    });
    const hpIv = within(attacker).getByRole("button", {
      name: "攻击方生命个体加点",
    });
    const physicalDefenseIv = within(attacker).getByRole("button", {
      name: "攻击方物防个体加点",
    });

    expect(speedNature).toHaveAttribute("aria-pressed", "false");
    expect(speedNature).not.toHaveClass("quick-controls__option--selected");
    expect(hpIv).toHaveAttribute("aria-pressed", "true");
    expect(hpIv).toHaveClass("quick-controls__option--selected");
    expect(physicalDefenseIv).toHaveAttribute("aria-pressed", "false");
    expect(physicalDefenseIv).not.toHaveClass(
      "quick-controls__option--selected",
    );

    fireEvent.click(speedNature);
    fireEvent.click(hpIv);
    fireEvent.click(physicalDefenseIv);

    expect(store.getState().sides.attacker.nature).toBe("timid");
    expect(store.getState().sides.attacker.displayIvs.hp).toBe(0);
    expect(
      store.getState().sides.attacker.displayIvs.physicalDefense,
    ).toBe(60);
    expect(speedNature).toHaveClass("quick-controls__option--selected");
    expect(hpIv).not.toHaveClass("quick-controls__option--selected");
    expect(physicalDefenseIv).toHaveClass(
      "quick-controls__option--selected",
    );
    expect(within(attacker).getAllByText(/胆小/u).length).toBeGreaterThan(0);
    expect(within(attacker).getByText(/个体魔攻 · 速度 · 物防/u))
      .toBeInTheDocument();
  });

  test("keeps nature and IV editors in a dismissible parameter sheet", () => {
    const store = createCalculatorStore(snapshot);
    render(<BattleWorkspace snapshot={snapshot} store={store} />);

    expect(screen.queryByRole("dialog", { name: "攻击方参数设置" }))
      .not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", {
      name: "打开攻击方详细参数",
    }));

    const attacker = screen.getByRole("dialog", {
      name: "攻击方参数设置",
    });
    expect(within(attacker).getByLabelText("攻击方性格")).toBeInTheDocument();
    expect(
      within(attacker).getByLabelText("攻击方物攻个体值"),
    ).toBeInTheDocument();

    fireEvent.click(within(attacker).getByRole("button", {
      name: "完成攻击方参数设置",
    }));
    expect(screen.queryByRole("dialog", { name: "攻击方参数设置" }))
      .not.toBeInTheDocument();
  });

  test("updates nature and clamped IV through the synchronous calculator store", () => {
    const store = createCalculatorStore(snapshot);
    render(<BattleWorkspace snapshot={snapshot} store={store} />);

    fireEvent.click(screen.getByRole("button", {
      name: "打开攻击方详细参数",
    }));
    const attacker = screen.getByRole("dialog", {
      name: "攻击方参数设置",
    });
    fireEvent.click(within(attacker).getByLabelText("攻击方性格"));
    const natureMenu = within(attacker).getByLabelText("攻击方性格选项");
    expect(within(natureMenu).getByRole("button", {
      name: /普通\s*无修正/u,
    })).toHaveClass("nature-picker__option--selected");
    fireEvent.click(
      within(natureMenu).getByRole("button", {
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

  test("filters the long nature list from a dedicated search field", () => {
    const store = createCalculatorStore(snapshot);
    render(<BattleWorkspace snapshot={snapshot} store={store} />);

    fireEvent.click(screen.getByRole("button", {
      name: "打开攻击方详细参数",
    }));
    const attacker = screen.getByRole("dialog", {
      name: "攻击方参数设置",
    });
    fireEvent.click(within(attacker).getByLabelText("攻击方性格"));

    const natureMenu = within(attacker).getByLabelText("攻击方性格选项");
    fireEvent.input(within(natureMenu).getByRole("searchbox", {
      name: "搜索攻击方性格",
    }), {
      target: { value: "速度" },
    });

    expect(within(natureMenu).getByRole("button", {
      name: "胆小 提升速度 降低物攻",
    })).toBeInTheDocument();
    expect(within(natureMenu).queryByRole("button", {
      name: "沉默 提升生命 降低物攻",
    })).not.toBeInTheDocument();
  });

  test("prioritizes the matching raised stat before natures that lower it", () => {
    const store = createCalculatorStore(snapshot);
    render(<BattleWorkspace snapshot={snapshot} store={store} />);

    fireEvent.click(screen.getByRole("button", {
      name: "打开攻击方详细参数",
    }));
    const attacker = screen.getByRole("dialog", {
      name: "攻击方参数设置",
    });
    fireEvent.click(within(attacker).getByLabelText("攻击方性格"));
    const natureMenu = within(attacker).getByLabelText("攻击方性格选项");
    fireEvent.input(within(natureMenu).getByRole("searchbox", {
      name: "搜索攻击方性格",
    }), {
      target: { value: "速度" },
    });

    expect(natureMenu.textContent.indexOf("胆小"))
      .toBeLessThan(natureMenu.textContent.indexOf("踏实"));
  });
});
