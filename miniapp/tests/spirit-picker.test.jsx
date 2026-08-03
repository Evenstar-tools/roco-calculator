import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import BattleWorkspace from "../src/components/BattleWorkspace.jsx";
import CombatantCard from "../src/components/CombatantCard.jsx";
import SpiritPicker from "../src/components/SpiritPicker.jsx";
import { createCalculatorStore } from "../src/state/calculator-store.js";

const spirits = [
  {
    id: "spirit-sonic-dog",
    fullName: "音速犬",
    pinyin: "yinsuquan",
    initials: "ysq",
    raceStats: {
      hp: 120,
      magicalAttack: 95,
      magicalDefense: 100,
      physicalAttack: 125,
      physicalDefense: 105,
      speed: 110,
    },
    types: ["风", "火"],
  },
  {
    id: "spirit-water",
    fullName: "水灵",
    pinyin: "shuiling",
    initials: "sl",
    raceStats: {
      hp: 130,
      magicalAttack: 120,
      magicalDefense: 110,
      physicalAttack: 90,
      physicalDefense: 115,
      speed: 95,
    },
    types: ["水"],
  },
];

describe("SpiritPicker", () => {
  test("filters the requested side and returns the selected spirit id", () => {
    const onChange = vi.fn();
    render(
      <SpiritPicker
        side="attacker"
        spirits={spirits}
        value={null}
        onChange={onChange}
      />,
    );

    fireEvent.input(screen.getByLabelText("搜索攻击方宠物"), {
      target: { value: "音速" },
    });
    fireEvent.click(screen.getByRole("button", { name: "选择音速犬" }));

    expect(onChange).toHaveBeenCalledWith("spirit-sonic-dog");
    expect(screen.queryByText("水灵")).not.toBeInTheDocument();
  });

  test("labels the defender search independently", () => {
    render(
      <SpiritPicker
        side="defender"
        spirits={spirits}
        value="spirit-water"
        onChange={() => {}}
      />,
    );

    expect(screen.getByLabelText("搜索防守方宠物")).toBeInTheDocument();
  });
});

describe("CombatantCard", () => {
  test("renders a real supplied image URL and stays intact without one", () => {
    const { rerender } = render(
      <CombatantCard
        side="attacker"
        spirit={spirits[0]}
        imageUrl="cloud://env/spirits/sonic.webp"
        spirits={spirits}
        onChange={() => {}}
      />,
    );

    expect(screen.getByRole("img", { name: "音速犬头像" })).toHaveAttribute(
      "src",
      "cloud://env/spirits/sonic.webp",
    );
    expect(screen.getByLabelText("攻击方配置")).toHaveTextContent("风 · 火");

    rerender(
      <CombatantCard
        side="attacker"
        spirit={spirits[0]}
        spirits={spirits}
        onChange={() => {}}
      />,
    );
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByLabelText("攻击方配置")).toHaveTextContent("音速犬");
  });
});

describe("BattleWorkspace combatants", () => {
  test("dispatches the selected spirit with its legal skills", () => {
    const snapshot = {
      meta: { id: "data-v1", rulesVersion: "rules-v1" },
      spirits,
      skills: [
        { id: "skill-wind" },
        { id: "skill-water" },
      ],
      learnsets: [
        {
          spiritId: "spirit-sonic-dog",
          skillIds: ["skill-wind"],
        },
        {
          spiritId: "spirit-water",
          skillIds: ["skill-water"],
        },
      ],
    };
    const store = createCalculatorStore(snapshot);
    const dispatch = vi.spyOn(store, "dispatch");
    render(<BattleWorkspace snapshot={snapshot} store={store} />);

    const attacker = screen.getByLabelText("攻击方配置");
    fireEvent.input(within(attacker).getByLabelText("搜索攻击方宠物"), {
      target: { value: "水灵" },
    });
    fireEvent.click(
      within(attacker).getByRole("button", { name: "选择水灵" }),
    );

    expect(dispatch).toHaveBeenCalledWith({
      type: "side/set-spirit",
      side: "attacker",
      value: "spirit-water",
      legalSkillIds: ["skill-water"],
    });
    expect(store.getState().sides.attacker).toMatchObject({
      spiritId: "spirit-water",
      skills: {
        single: "skill-water",
      },
    });
    expect(
      store.getState().sides.attacker.skills.four.filter(Boolean),
    ).toEqual(["skill-water"]);
  });

  test("swaps configurations while attack remains red and defense remains blue", () => {
    const snapshot = {
      meta: { id: "data-v1", rulesVersion: "rules-v1" },
      spirits,
      skills: [],
      learnsets: [],
    };
    const store = createCalculatorStore(snapshot);
    render(<BattleWorkspace snapshot={snapshot} store={store} />);

    fireEvent.click(screen.getByRole("button", { name: "切换攻守配置" }));

    const attacker = screen.getByLabelText("攻击方配置");
    const defender = screen.getByLabelText("防守方配置");
    expect(attacker).toHaveClass("combatant-card--attacker");
    expect(attacker).toHaveTextContent("水灵");
    expect(defender).toHaveClass("combatant-card--defender");
    expect(defender).toHaveTextContent("音速犬");
  });
});
