import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import BattleWorkspace from "../src/components/BattleWorkspace.jsx";
import CombatantCard from "../src/components/CombatantCard.jsx";
import DirectionSwitch from "../src/components/DirectionSwitch.jsx";
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

  test("shows pet and element icons in search results", () => {
    render(
      <SpiritPicker
        imageUrls={{
          "spirit-sonic-dog": "cloud://env/spirits/sonic.webp",
        }}
        side="attacker"
        spirits={spirits}
        value={null}
        onChange={() => {}}
      />,
    );

    fireEvent.input(screen.getByLabelText("搜索攻击方宠物"), {
      target: { value: "音速" },
    });

    const result = screen.getByRole("button", { name: "选择音速犬" });
    expect(within(result).getByAltText("音速犬头像")).toHaveAttribute(
      "src",
      "cloud://env/spirits/sonic.webp",
    );
    expect(within(result).getByAltText("火系图标")).toBeInTheDocument();
  });

  test("uses the spirit image fallback when no explicit image map entry exists", () => {
    const spiritsWithImages = spirits.map((spirit) => ({
      ...spirit,
      imageUrl: `https://images.example/${spirit.id}.png`,
    }));
    render(
      <SpiritPicker
        side="defender"
        spirits={spiritsWithImages}
        value={null}
        onChange={() => {}}
      />,
    );

    fireEvent.input(screen.getByLabelText("搜索防守方宠物"), {
      target: { value: "水灵" },
    });

    expect(screen.getByAltText("水灵头像")).toHaveAttribute(
      "src",
      "https://images.example/spirit-water.png",
    );
  });

  test("closes and clears the search after tapping outside the picker", () => {
    render(
      <SpiritPicker
        side="attacker"
        spirits={spirits}
        value={null}
        onChange={() => {}}
      />,
    );

    const search = screen.getByLabelText("搜索攻击方宠物");
    fireEvent.input(search, { target: { value: "音速" } });
    expect(screen.getByLabelText("攻击方宠物搜索结果"))
      .toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("关闭攻击方宠物搜索"));

    expect(search).toHaveValue("");
    expect(screen.queryByLabelText("攻击方宠物搜索结果"))
      .not.toBeInTheDocument();
  });
});

describe("DirectionSwitch", () => {
  test("uses a real exchange icon instead of wrapping text", () => {
    render(<DirectionSwitch onSwap={() => {}} />);

    const button = screen.getByRole("button", { name: "切换攻守配置" });
    expect(within(button).getByRole("img", { name: "交换攻守" }))
      .toBeInTheDocument();
    expect(button).not.toHaveTextContent("切换攻守");
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
    expect(screen.queryByRole("img", { name: "音速犬头像" }))
      .not.toBeInTheDocument();
    expect(screen.getByLabelText("攻击方配置")).toHaveTextContent("音速犬");
  });

  test("opens pet search from the whole combatant card without a redundant change button", () => {
    const onActivate = vi.fn();
    render(
      <CombatantCard
        identityOnly
        onActivate={onActivate}
        side="attacker"
        spirit={spirits[0]}
        spirits={spirits}
        onChange={() => {}}
      />,
    );

    expect(screen.queryByRole("button", {
      name: "更换攻击方宠物",
    })).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("攻击方宠物摘要"));
    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("搜索攻击方宠物").parentElement)
      .toHaveClass("spirit-picker--open");
  });
});

describe("BattleWorkspace combatants", () => {
  test("closes an open pet search when another workspace control is used", () => {
    const snapshot = {
      meta: { id: "data-v1", rulesVersion: "rules-v1" },
      spirits,
      skills: [],
      learnsets: [],
    };
    const store = createCalculatorStore(snapshot);
    render(<BattleWorkspace snapshot={snapshot} store={store} />);

    const attacker = screen.getByLabelText("攻击方配置");
    fireEvent.click(within(attacker).getByLabelText("攻击方宠物摘要"));
    fireEvent.input(within(attacker).getByLabelText("搜索攻击方宠物"), {
      target: { value: "水灵" },
    });
    expect(within(attacker).getByLabelText("攻击方宠物搜索结果"))
      .toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "编辑战斗条件" }));

    expect(within(attacker).queryByLabelText("攻击方宠物搜索结果"))
      .not.toBeInTheDocument();
  });

  test("keeps one active overlay when switching from pet search to parameters", () => {
    const snapshot = {
      meta: { id: "data-v1", rulesVersion: "rules-v1" },
      spirits,
      skills: [],
      learnsets: [],
    };
    const store = createCalculatorStore(snapshot);
    render(<BattleWorkspace snapshot={snapshot} store={store} />);

    fireEvent.click(screen.getByLabelText("攻击方宠物摘要"));
    expect(screen.getByLabelText("搜索攻击方宠物")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", {
      name: "打开防守方详细参数",
    }));

    expect(screen.getByLabelText("搜索攻击方宠物").parentElement)
      .not.toHaveClass("spirit-picker--open");
    expect(
      screen.getByRole("dialog", { name: "防守方参数设置" }),
    ).toBeInTheDocument();
  });

  test("moves the active combatant styling with the selected side", () => {
    const snapshot = {
      meta: { id: "data-v1", rulesVersion: "rules-v1" },
      spirits,
      skills: [],
      learnsets: [],
    };
    const store = createCalculatorStore(snapshot);
    render(<BattleWorkspace snapshot={snapshot} store={store} />);

    const attacker = screen.getByLabelText("攻击方配置");
    const defender = screen.getByLabelText("防守方配置");
    expect(attacker).toHaveClass("combatant-card--active");
    expect(defender).not.toHaveClass("combatant-card--active");

    fireEvent.click(screen.getByLabelText("防守方宠物摘要"));
    expect(attacker).not.toHaveClass("combatant-card--active");
    expect(defender).toHaveClass("combatant-card--active");
  });

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
    render(<BattleWorkspace snapshot={snapshot} store={store} />);

    const attacker = screen.getByLabelText("攻击方配置");
    fireEvent.input(within(attacker).getByLabelText("搜索攻击方宠物"), {
      target: { value: "水灵" },
    });
    fireEvent.click(
      within(attacker).getByRole("button", { name: "选择水灵" }),
    );

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

  test("switching spirits clears transient calculation state", () => {
    const snapshot = {
      meta: { id: "data-v1", rulesVersion: "rules-v1" },
      spirits,
      skills: [
        { id: "skill-wind" },
        { id: "skill-water" },
      ],
      learnsets: [
        { spiritId: "spirit-sonic-dog", skillIds: ["skill-wind"] },
        { spiritId: "spirit-water", skillIds: ["skill-water"] },
      ],
    };
    const store = createCalculatorStore(snapshot);
    store.dispatch({
      direction: "forward",
      type: "direction/update",
      value: {
        context: { balanceTriggered: true },
        currentHp: 1,
        hitCount: 9,
        overrides: {
          attackLevelStage: 8,
          basePower: 999,
          defenseLevelStage: -6,
        },
      },
    });
    store.dispatch({
      direction: "reverse",
      type: "direction/update",
      value: {
        context: { rainTurns: 8 },
        currentHp: 2,
        overrides: { attackLevelStage: 5 },
      },
    });
    render(<BattleWorkspace snapshot={snapshot} store={store} />);

    const attacker = screen.getByLabelText("攻击方配置");
    fireEvent.input(within(attacker).getByLabelText("搜索攻击方宠物"), {
      target: { value: "水灵" },
    });
    fireEvent.click(
      within(attacker).getByRole("button", { name: "选择水灵" }),
    );

    expect(store.getState().directions.forward).toMatchObject({
      context: {},
      currentHp: null,
      hitCount: 1,
      overrides: {},
    });
    expect(store.getState().directions.reverse).toMatchObject({
      context: {},
      currentHp: null,
      hitCount: 1,
      overrides: {},
    });
  });

  test("applies an imported common preset when its spirit is selected", () => {
    const snapshot = {
      meta: { id: "data-v1", rulesVersion: "rules-v1" },
      spirits,
      skills: [
        { id: "skill-wind" },
        { id: "skill-water" },
      ],
      learnsets: [],
    };
    const store = createCalculatorStore(snapshot);
    render(
      <BattleWorkspace
        configPresetsBySpirit={{
          "spirit-water": {
            displayIvs: {
              hp: 60,
              magicalAttack: 60,
              magicalDefense: 60,
              physicalAttack: 0,
              physicalDefense: 60,
              speed: 60,
            },
            natureId: "timid",
            skills: {
              four: ["skill-water", null, null, null],
              single: "skill-water",
            },
            spiritId: "spirit-water",
            traitValues: {},
          },
        }}
        snapshot={snapshot}
        store={store}
      />,
    );

    const attacker = screen.getByLabelText("攻击方配置");
    fireEvent.input(within(attacker).getByLabelText("搜索攻击方宠物"), {
      target: { value: "水灵" },
    });
    fireEvent.click(
      within(attacker).getByRole("button", { name: "选择水灵" }),
    );

    expect(store.getState().sides.attacker).toMatchObject({
      displayIvs: { physicalAttack: 0, speed: 60 },
      nature: "timid",
      spiritId: "spirit-water",
    });
  });

  test("swaps configurations while attack remains red and defense remains blue", () => {
    const snapshot = {
      meta: { id: "data-v1", rulesVersion: "rules-v1" },
      spirits,
      skills: [],
      learnsets: [],
    };
    const store = createCalculatorStore(snapshot);
    store.dispatch({
      direction: "forward",
      type: "direction/update",
      value: {
        currentHp: 1,
        hitCount: 9,
        overrides: { attackLevelStage: 8, basePower: 999 },
      },
    });
    render(<BattleWorkspace snapshot={snapshot} store={store} />);

    fireEvent.click(screen.getByRole("button", { name: "切换攻守配置" }));

    const attacker = screen.getByLabelText("攻击方配置");
    const defender = screen.getByLabelText("防守方配置");
    expect(attacker).toHaveClass("combatant-card--attacker");
    expect(attacker).toHaveTextContent("水灵");
    expect(defender).toHaveClass("combatant-card--defender");
    expect(defender).toHaveTextContent("音速犬");
    expect(store.getState().directions.forward).toMatchObject({
      currentHp: null,
      hitCount: 1,
      overrides: {},
    });
  });
});
