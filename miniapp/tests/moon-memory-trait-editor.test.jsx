import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import BattleWorkspace from "../src/components/BattleWorkspace.jsx";
import MoonMemoryTraitEditor from "../src/components/MoonMemoryTraitEditor.jsx";
import { createCalculatorStore } from "../src/state/calculator-store.js";

const RACE_STATS = {
  hp: 100,
  magicalAttack: 100,
  magicalDefense: 100,
  physicalAttack: 100,
  physicalDefense: 100,
  speed: 100,
};

function snapshotFixture() {
  return {
    learnsets: [],
    meta: { id: "test-data", rulesVersion: "test-rules" },
    skills: [
      {
        basePower: 40,
        category: "physical",
        id: "scratch",
        name: "抓挠",
        type: "普通",
      },
    ],
    spirits: [
      {
        dexNo: "077",
        fullName: "狼灵",
        id: "wolf-spirit",
        initials: "ll",
        pinyin: "langling",
        raceStats: RACE_STATS,
        traitIds: ["moon-memory"],
        types: ["普通"],
      },
      {
        dexNo: "321",
        fullName: "机械雪方方",
        id: "toy-spirit",
        initials: "jxff",
        pinyin: "jixiexuefangfang",
        raceStats: RACE_STATS,
        traitIds: ["old-toy"],
        types: ["普通"],
      },
      {
        dexNo: "654",
        fullName: "冷月兽",
        id: "cold-spirit",
        initials: "lys",
        pinyin: "lengyueshou",
        raceStats: RACE_STATS,
        traitIds: ["cold-light"],
        types: ["普通"],
      },
      {
        dexNo: "777",
        fullName: "刺甲兽",
        id: "spike-spirit",
        initials: "cjs",
        pinyin: "cijiashou",
        raceStats: RACE_STATS,
        traitIds: ["skin-spikes"],
        types: ["普通"],
      },
      {
        dexNo: "888",
        fullName: "占位兽",
        id: "placeholder-spirit",
        initials: "zws",
        pinyin: "zhanweishou",
        raceStats: RACE_STATS,
        traitIds: ["unverified-trait"],
        types: ["普通"],
      },
      {
        dexNo: "999",
        fullName: "新月鹿",
        id: "renewal-spirit",
        initials: "xyl",
        pinyin: "xinyuelu",
        raceStats: RACE_STATS,
        traitIds: ["renewal"],
        types: ["普通"],
      },
    ],
    traits: [
      { id: "moon-memory", name: "铭记于月亮" },
      { id: "old-toy", name: "旧玩具" },
      { id: "cold-light", name: "冷光源" },
      { id: "skin-spikes", name: "刺肤" },
      { id: "contract-shape", name: "契约的形状" },
      {
        description: "攻击时威力提升100%。",
        id: "unverified-trait",
        name: "未核实特性",
      },
      { id: "renewal", name: "复苏" },
    ],
    typeChart: { matrix: [[1]], types: ["普通"] },
  };
}

function renderEditor({ configuration, spiritId = "wolf-spirit" } = {}) {
  const snapshot = snapshotFixture();
  const props = {
    configuration: configuration ?? {
      acquiredTraitIds: [],
      acquiredTraitValues: {},
      spiritId,
    },
    onAdd: vi.fn(),
    onRemove: vi.fn(),
    onValueChange: vi.fn(),
    side: "attacker",
    snapshot,
    spirit: snapshot.spirits.find((spirit) => spirit.id === spiritId),
  };
  return {
    ...render(
    <MoonMemoryTraitEditor
      {...props}
    />,
    ),
    props,
    snapshot,
  };
}

describe("MoonMemoryTraitEditor", () => {
  test("only exposes the editor to a spirit that natively owns 铭记于月亮", () => {
    const { rerender } = renderEditor();

    expect(screen.getByLabelText("攻击方搜索可吞噬特性"))
      .toBeInTheDocument();

    const snapshot = snapshotFixture();
    rerender(
      <MoonMemoryTraitEditor
        configuration={{
          acquiredTraitIds: ["old-toy"],
          acquiredTraitValues: {},
          spiritId: "toy-spirit",
        }}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
        onValueChange={vi.fn()}
        side="attacker"
        snapshot={snapshot}
        spirit={snapshot.spirits[1]}
      />,
    );

    expect(screen.queryByLabelText("攻击方搜索可吞噬特性"))
      .not.toBeInTheDocument();
  });

  test.each([
    "机械雪方方",
    "321",
    "jixiexuefangfang",
    "jxff",
    "旧玩具",
  ])("finds a candidate by spirit identity or trait name: %s", (query) => {
    renderEditor();

    fireEvent.input(screen.getByLabelText("攻击方搜索可吞噬特性"), {
      target: { value: query },
    });

    expect(screen.getByText("机械雪方方 · 旧玩具")).toBeInTheDocument();
    expect(screen.getByText("可计算")).toBeInTheDocument();
  });

  test("adds multiple traits, prevents duplicate selection, and removes one", () => {
    const { props, rerender } = renderEditor();
    const search = screen.getByLabelText("攻击方搜索可吞噬特性");

    fireEvent.input(search, { target: { value: "旧玩具" } });
    fireEvent.click(screen.getByRole("button", {
      name: "吞噬 机械雪方方 · 旧玩具",
    }));
    fireEvent.input(search, { target: { value: "冷光源" } });
    fireEvent.click(screen.getByRole("button", {
      name: "吞噬 冷月兽 · 冷光源",
    }));

    expect(props.onAdd.mock.calls).toEqual([
      ["old-toy"],
      ["cold-light"],
    ]);

    const configuration = {
      acquiredTraitIds: ["old-toy", "cold-light"],
      acquiredTraitValues: {},
      spiritId: "wolf-spirit",
    };
    rerender(
      <MoonMemoryTraitEditor {...props} configuration={configuration} />,
    );
    fireEvent.input(search, { target: { value: "旧玩具" } });

    expect(screen.getByRole("button", {
      name: "已吞噬 机械雪方方 · 旧玩具",
    })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "移除 旧玩具" }));
    expect(props.onRemove).toHaveBeenCalledWith("old-toy");
    expect(screen.getByRole("button", { name: "移除 冷光源" }))
      .toBeInTheDocument();
  });

  test("caps acquisition at five traits and reopens a slot after removal", () => {
    const configuration = {
      acquiredTraitIds: [
        "old-toy",
        "cold-light",
        "skin-spikes",
        "contract-shape",
        "unverified-trait",
      ],
      acquiredTraitValues: {},
      spiritId: "wolf-spirit",
    };
    const { props, rerender } = renderEditor({ configuration });
    const search = screen.getByLabelText("攻击方搜索可吞噬特性");

    expect(screen.getByText(/已吞噬 5\/5.*已达上限/)).toBeInTheDocument();
    fireEvent.input(search, { target: { value: "复苏" } });

    const candidateAtLimit = screen.getByRole("button", {
      name: "吞噬 新月鹿 · 复苏",
    });
    expect(candidateAtLimit).toBeDisabled();
    fireEvent.click(candidateAtLimit);
    expect(props.onAdd).not.toHaveBeenCalled();

    const removeButton = screen.getByRole("button", { name: "移除 旧玩具" });
    expect(removeButton).toBeEnabled();
    fireEvent.click(removeButton);
    expect(props.onRemove).toHaveBeenCalledWith("old-toy");

    rerender(
      <MoonMemoryTraitEditor
        {...props}
        configuration={{
          ...configuration,
          acquiredTraitIds: configuration.acquiredTraitIds.slice(1),
        }}
      />,
    );

    expect(screen.getByText("已吞噬 4/5")).toBeInTheDocument();
    const reopenedCandidate = screen.getByRole("button", {
      name: "吞噬 新月鹿 · 复苏",
    });
    expect(reopenedCandidate).toBeEnabled();
    fireEvent.click(reopenedCandidate);
    expect(props.onAdd).toHaveBeenCalledWith("renewal");
  });

  test("reports explicit adapters as calculable without inferring support from prose", () => {
    renderEditor();
    const search = screen.getByLabelText("攻击方搜索可吞噬特性");

    fireEvent.input(search, { target: { value: "刺肤" } });
    expect(screen.getByText("可计算")).toBeInTheDocument();

    fireEvent.input(search, { target: { value: "未核实特性" } });
    expect(screen.getByText("仅展示")).toBeInTheDocument();
    expect(screen.queryByText("可计算")).not.toBeInTheDocument();
  });

  test("renders acquired trait controls and writes their canonical value key", () => {
    const canonicalKey = "trait.traitStacks.2d041ca6";
    const { props } = renderEditor({
      configuration: {
        acquiredTraitIds: ["old-toy"],
        acquiredTraitValues: {
          "old-toy": { [canonicalKey]: 2 },
        },
        spiritId: "wolf-spirit",
      },
    });

    const input = screen.getByLabelText("己方已使用不同技能系列数");
    expect(input).toHaveValue(2);
    fireEvent.input(input, { target: { value: "4" } });

    expect(props.onValueChange).toHaveBeenCalledWith(
      "old-toy",
      canonicalKey,
      4,
    );
  });

  test("shows dependent controls only when their canonical prerequisite matches", () => {
    const configuration = {
      acquiredTraitIds: ["contract-shape"],
      acquiredTraitValues: {},
      spiritId: "wolf-spirit",
    };
    const { props, rerender } = renderEditor({ configuration });

    expect(screen.getByText("咕噜球")).toBeInTheDocument();
    expect(screen.queryByText("棱镜效果")).not.toBeInTheDocument();

    rerender(
      <MoonMemoryTraitEditor
        {...props}
        configuration={{
          ...configuration,
          acquiredTraitValues: {
            "contract-shape": {
              "trait.contractBallType.743e090b": "prism",
            },
          },
        }}
      />,
    );

    expect(screen.getByText("棱镜效果")).toBeInTheDocument();
  });

  test("dispatches the acquired trait reducer action from the battle workspace", () => {
    const snapshot = snapshotFixture();
    const store = createCalculatorStore(snapshot);
    const dispatch = vi.spyOn(store, "dispatch");

    render(<BattleWorkspace snapshot={snapshot} store={store} />);
    fireEvent.input(screen.getByLabelText("攻击方搜索可吞噬特性"), {
      target: { value: "旧玩具" },
    });
    fireEvent.click(screen.getByRole("button", {
      name: "吞噬 机械雪方方 · 旧玩具",
    }));

    expect(dispatch).toHaveBeenCalledWith({
      side: "attacker",
      traitId: "old-toy",
      type: "side/add-acquired-trait",
    });
    expect(store.getState().sides.attacker.acquiredTraitIds)
      .toEqual(["old-toy"]);
  });

  test("dispatches canonical value and removal actions from the battle workspace", () => {
    const snapshot = snapshotFixture();
    const baseState = createCalculatorStore(snapshot).getState();
    const canonicalKey = "trait.traitStacks.2d041ca6";
    const store = createCalculatorStore(snapshot, {
      ...baseState,
      sides: {
        ...baseState.sides,
        attacker: {
          ...baseState.sides.attacker,
          acquiredTraitIds: ["old-toy"],
          acquiredTraitValues: {
            "old-toy": { [canonicalKey]: 2 },
          },
        },
      },
    });
    const dispatch = vi.spyOn(store, "dispatch");

    render(<BattleWorkspace snapshot={snapshot} store={store} />);
    fireEvent.input(screen.getByLabelText("己方已使用不同技能系列数"), {
      target: { value: "4" },
    });

    expect(dispatch).toHaveBeenCalledWith({
      key: canonicalKey,
      side: "attacker",
      traitId: "old-toy",
      type: "side/set-acquired-trait-value",
      value: 4,
    });
    expect(store.getState().sides.attacker.acquiredTraitValues)
      .toEqual({ "old-toy": { [canonicalKey]: 4 } });

    fireEvent.click(screen.getByRole("button", { name: "移除 旧玩具" }));

    expect(dispatch).toHaveBeenCalledWith({
      side: "attacker",
      traitId: "old-toy",
      type: "side/remove-acquired-trait",
    });
    expect(store.getState().sides.attacker.acquiredTraitIds).toEqual([]);
    expect(store.getState().sides.attacker.acquiredTraitValues).toEqual({});
  });

  test("keeps rapid additions of different traits as separate undo steps", () => {
    const snapshot = snapshotFixture();
    const store = createCalculatorStore(snapshot);

    render(
      <BattleWorkspace quickUndoEnabled snapshot={snapshot} store={store} />,
    );
    const search = screen.getByLabelText("攻击方搜索可吞噬特性");
    fireEvent.input(search, { target: { value: "旧玩具" } });
    fireEvent.click(screen.getByRole("button", {
      name: "吞噬 机械雪方方 · 旧玩具",
    }));
    fireEvent.input(search, { target: { value: "冷光源" } });
    fireEvent.click(screen.getByRole("button", {
      name: "吞噬 冷月兽 · 冷光源",
    }));

    expect(store.getState().sides.attacker.acquiredTraitIds)
      .toEqual(["old-toy", "cold-light"]);
    fireEvent.click(screen.getByRole("button", { name: "撤回上一步" }));
    expect(store.getState().sides.attacker.acquiredTraitIds)
      .toEqual(["old-toy"]);
  });
});
