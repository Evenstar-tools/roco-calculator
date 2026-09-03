import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import BattleWorkspace from "../src/components/BattleWorkspace.jsx";
import SkillConditionEditor from "../src/components/SkillConditionEditor.jsx";
import SkillPicker from "../src/components/SkillPicker.jsx";
import SkillSlots from "../src/components/SkillSlots.jsx";
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

test("switches between static and panel power overrides and restores automatic calculation", () => {
  const onDirectionChange = vi.fn();
  const { rerender } = render(
    <SkillConditionEditor
      context={{}}
      direction={{ overrides: {} }}
      onContextChange={vi.fn()}
      onDirectionChange={onDirectionChange}
      result={{ panelPower: 150, staticPower: 80 }}
      skill={{ basePower: 80, id: "skill-a", name: "烈焰冲击" }}
    />,
  );

  expect(screen.getByRole("button", { name: "静态威力" }))
    .toHaveAttribute("aria-pressed", "true");
  expect(screen.getByLabelText("静态威力")).toHaveValue(80);

  fireEvent.click(screen.getByRole("button", { name: "显示威力" }));
  expect(screen.getByLabelText("显示威力")).toHaveValue(150);
  expect(onDirectionChange).not.toHaveBeenCalled();
  fireEvent.input(screen.getByLabelText("显示威力"), {
    target: { value: "175" },
  });
  expect(onDirectionChange).toHaveBeenLastCalledWith({
    overrides: { powerOverride: { mode: "panel", value: 175 } },
  });

  rerender(
    <SkillConditionEditor
      context={{}}
      direction={{
        overrides: { powerOverride: { mode: "panel", value: 175 } },
      }}
      onContextChange={vi.fn()}
      onDirectionChange={onDirectionChange}
      result={{ panelPower: 175, staticPower: 80 }}
      skill={{ basePower: 80, id: "skill-a", name: "烈焰冲击" }}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "恢复自动威力" }));
  expect(onDirectionChange).toHaveBeenLastCalledWith({
    overrides: { basePower: undefined, powerOverride: null },
  });
});

test("shows burst skills enabled by default and lets the user turn them off", () => {
  const onContextChange = vi.fn();
  const { rerender } = render(
    <SkillConditionEditor
      context={{}}
      direction={{ overrides: {} }}
      onContextChange={onContextChange}
      onDirectionChange={vi.fn()}
      result={{ panelPower: 90, staticPower: 90 }}
      skill={{
        basePower: 60,
        category: "physical",
        id: "burst-skill",
        name: "天旋地转",
        type: "翼",
      }}
    />,
  );

  const burstToggle = screen.getByRole("button", { name: "触发迸发" });
  expect(burstToggle).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(burstToggle);
  expect(onContextChange).toHaveBeenLastCalledWith({ burstTriggered: false });

  rerender(
    <SkillConditionEditor
      context={{ burstTriggered: false }}
      direction={{ overrides: {} }}
      onContextChange={onContextChange}
      onDirectionChange={vi.fn()}
      result={{ panelPower: 60, staticPower: 60 }}
      skill={{
        basePower: 60,
        category: "physical",
        id: "burst-skill",
        name: "天旋地转",
        type: "翼",
      }}
    />,
  );
  expect(screen.getByRole("button", { name: "触发迸发" }))
    .toHaveAttribute("aria-pressed", "false");
});

test("shows the thunderstorm burst switch and kind counter together", () => {
  render(
    <SkillConditionEditor
      context={{}}
      direction={{ overrides: {} }}
      onContextChange={vi.fn()}
      onDirectionChange={vi.fn()}
      result={{ panelPower: 55, staticPower: 55 }}
      skill={{
        basePower: 55,
        category: "magical",
        id: "thunderstorm",
        name: "雷暴",
        type: "电",
      }}
    />,
  );

  expect(screen.getByRole("button", { name: "触发迸发" }))
    .toHaveAttribute("aria-pressed", "true");
  expect(screen.getByLabelText("迸发种类数")).toHaveValue(0);
});

test("edits weight tiers and pressure valve uses with shared-core controls", () => {
  const onWeightChange = vi.fn();
  const onPressureChange = vi.fn();
  render(
    <>
      <SkillConditionEditor
        context={{}}
        direction={{ overrides: {} }}
        onContextChange={onWeightChange}
        onDirectionChange={vi.fn()}
        result={{ panelPower: 100, staticPower: 100 }}
        skill={{
          basePower: 100,
          category: "physical",
          id: "weight-pressure",
          name: "吨位压制",
          type: "普通",
        }}
      />
      <SkillConditionEditor
        context={{}}
        direction={{ overrides: {} }}
        onContextChange={onPressureChange}
        onDirectionChange={vi.fn()}
        result={{ panelPower: 0, staticPower: 0 }}
        skill={{
          basePower: 0,
          category: "status",
          id: "pressure-valve",
          name: "减压阀",
          type: "机械",
        }}
      />
    </>,
  );

  expect(screen.getByText("敌方体重挡位")).toBeVisible();
  expect(screen.getByRole("button", { name: "30~59" }))
    .toHaveAttribute("aria-pressed", "true");
  fireEvent.click(screen.getByRole("button", { name: "120+" }));
  expect(onWeightChange).toHaveBeenLastCalledWith({
    targetWeightTier: "120+",
  });

  expect(screen.getByLabelText("已使用次数")).toHaveValue(0);
  fireEvent.input(screen.getByLabelText("已使用次数"), {
    target: { value: "3" },
  });
  expect(onPressureChange).toHaveBeenLastCalledWith({
    pressureValveUseCount: 3,
  });
});

test("groups thunderstorm burst sources behind a stable summary", () => {
  const onContextChange = vi.fn();
  render(
    <SkillConditionEditor
      context={{
        burstSourceChargeMark: true,
        burstSourceCurrentStimulus: true,
      }}
      direction={{ overrides: {} }}
      onContextChange={onContextChange}
      onDirectionChange={vi.fn()}
      result={{ panelPower: 55, staticPower: 55 }}
      skill={{
        basePower: 55,
        category: "magical",
        id: "thunderstorm",
        name: "雷暴",
        type: "电",
      }}
    />,
  );

  const summary = screen.getByRole("button", { name: "选择迸发来源" });
  expect(summary).toHaveTextContent("已选 2/10");
  expect(screen.queryByLabelText("迸发来源")).not.toBeInTheDocument();

  fireEvent.click(summary);
  const selector = screen.getByLabelText("迸发来源");
  expect(within(selector).getByRole("button", { name: "查看特性迸发来源" }))
    .toHaveAttribute("aria-pressed", "true");
  expect(within(selector).getByRole("button", { name: "电流刺激" }))
    .toHaveAttribute("aria-pressed", "true");
  expect(within(selector).queryByRole("button", { name: "电弧" }))
    .not.toBeInTheDocument();

  fireEvent.click(within(selector).getByRole("button", {
    name: "查看技能迸发来源",
  }));
  fireEvent.click(within(selector).getByRole("button", { name: "电弧" }));
  expect(onContextChange).toHaveBeenLastCalledWith({
    burstSourceArc: true,
    burstSourceChargeMark: true,
    burstSourceCurrentStimulus: true,
  });
});

describe("mini program skill workflow", () => {
  test("filters the skill sheet by category and search with reversible state", () => {
    const onChange = vi.fn();
    const choices = [
      {
        basePower: 60,
        category: "magical",
        cost: 1,
        id: "flash",
        name: "闪光",
        searchText: "闪光|光|shanguang|sg",
        type: "光",
      },
      {
        basePower: 65,
        category: "physical",
        cost: 1,
        id: "slam",
        name: "猛烈撞击",
        type: "普通",
      },
      {
        basePower: 80,
        category: "physical",
        cost: 2,
        id: "fire-arrow",
        name: "火焰箭",
        type: "火",
      },
      {
        basePower: 0,
        category: "status",
        cost: 0,
        id: "boost",
        name: "魔法增效",
        type: "普通",
      },
      {
        basePower: 0,
        category: "defense",
        cost: 1,
        id: "guard",
        name: "防御",
        type: "普通",
      },
    ];

    const { rerender } = render(
      <SkillPicker
        choices={choices}
        label="攻击方技能 1"
        onChange={onChange}
        value="flash"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "选择攻击方技能 1" }));
    let dialog = screen.getByRole("dialog", { name: "攻击方技能 1选项" });
    const search = within(dialog).getByLabelText("搜索攻击方技能 1");
    expect(search).not.toHaveAttribute("autofocus");
    expect(search).toHaveAttribute("data-adjust-position", "false");
    expect(search).toHaveAttribute("data-keyboard-height-handler", "true");
    expect(within(dialog).getByAltText("搜索")).toHaveAttribute(
      "src",
      expect.stringContaining("search.png"),
    );
    expect(within(dialog).getByRole("button", {
      name: "筛选全部技能，共 5 项",
    })).toHaveAttribute("aria-pressed", "true");
    expect(within(dialog).getByRole("button", {
      name: "筛选物理技能，共 2 项",
    })).toHaveAttribute("aria-pressed", "false");
    expect(within(dialog).getByAltText("当前已选技能")).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", {
      name: "筛选物理技能，共 2 项",
    }));
    expect(within(dialog).getByText("物理 2 项")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: /猛烈撞击/u })).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: /闪光/u })).not.toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", {
      name: "筛选物理技能，共 2 项",
    }));
    expect(within(dialog).getByText("共 5 项")).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", {
      name: "筛选魔法技能，共 1 项",
    }));
    fireEvent.input(search, { target: { value: "sg" } });
    expect(within(dialog).getByText("魔法 1 项")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: /闪光/u })).toBeInTheDocument();

    fireEvent.input(search, { target: { value: "不存在" } });
    expect(within(dialog).getByText("当前筛选无结果")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "清除筛选" }));
    expect(search).toHaveValue("");
    expect(within(dialog).getByText("共 5 项")).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: /猛烈撞击/u }));
    expect(onChange).toHaveBeenCalledWith("slam");
    expect(screen.queryByRole("dialog", { name: "攻击方技能 1选项" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "选择攻击方技能 1" }));
    dialog = screen.getByRole("dialog", { name: "攻击方技能 1选项" });
    expect(within(dialog).getByText("共 5 项")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", {
      name: "筛选物理技能，共 2 项",
    }));

    rerender(
      <SkillPicker
        choices={choices.filter((skill) => skill.category !== "physical")}
        label="攻击方技能 1"
        onChange={onChange}
        value="flash"
      />,
    );
    dialog = screen.getByRole("dialog", { name: "攻击方技能 1选项" });
    expect(within(dialog).queryByRole("button", {
      name: /筛选物理技能/u,
    })).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", {
      name: "筛选全部技能，共 3 项",
    })).toHaveAttribute("aria-pressed", "true");
  });

  test("filters skills in a searchable dialog and makes the selected choice explicit", () => {
    const onChange = vi.fn();
    const choices = [
      {
        basePower: 80,
        category: "physical",
        id: "skill-a",
        name: "烈焰冲击",
        type: "火",
      },
      {
        basePower: 70,
        category: "magical",
        id: "skill-b",
        name: "潮汐冲击",
        type: "水",
      },
    ];

    render(
      <SkillPicker
        choices={choices}
        label="攻击方技能 1"
        onChange={onChange}
        value="skill-a"
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "选择攻击方技能 1" }),
    );
    const dialog = screen.getByRole("dialog", {
      name: "攻击方技能 1选项",
    });
    expect(screen.getByLabelText("搜索攻击方技能 1")).toBeInTheDocument();
    const selectedOption = within(dialog).getByRole("button", {
      name: /烈焰冲击/,
    });
    expect(selectedOption).toHaveAttribute("aria-pressed", "true");
    expect(selectedOption).not.toHaveTextContent(/选择|已选/u);

    fireEvent.input(screen.getByLabelText("搜索攻击方技能 1"), {
      target: { value: "魔法" },
    });

    expect(
      within(dialog).queryByRole("button", { name: /烈焰冲击/ }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      within(dialog).getByRole("button", { name: /潮汐冲击/ }),
    );

    expect(onChange).toHaveBeenCalledWith("skill-b");
    expect(
      screen.queryByRole("dialog", { name: "攻击方技能 1选项" }),
    ).not.toBeInTheDocument();
  });

  test("does not count search-only calculator skills until the user searches", () => {
    const choices = [
      {
        category: "physical",
        id: "skill-a",
        name: "抓挠",
        type: "普通",
      },
      {
        category: "dual",
        id: "calculator_wish_power_light",
        name: "愿力冲击",
        pickerVisibility: "search-only",
        searchText: "愿力冲击|yuanlichongji|ylcj",
        type: "光",
      },
    ];

    render(
      <SkillPicker
        choices={choices}
        label="攻击方技能 1"
        onChange={() => {}}
        value="skill-a"
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "选择攻击方技能 1" }),
    );
    expect(screen.getByText("共 1 项", { exact: true })).toBeInTheDocument();
    expect(screen.queryByText("愿力冲击")).not.toBeInTheDocument();

    fireEvent.input(screen.getByLabelText("搜索攻击方技能 1"), {
      target: { value: "愿力冲击" },
    });
    expect(screen.getByText("1 项匹配", { exact: true })).toBeInTheDocument();
    expect(screen.getByText("愿力冲击", { exact: true })).toBeInTheDocument();
  });

  test("lets an empty skill prompt use the full trigger width", () => {
    render(
      <SkillPicker
        choices={[]}
        label="攻击方单技能"
        onChange={() => {}}
        value={null}
      />,
    );

    expect(
      screen.getByRole("button", { name: "选择攻击方单技能" }),
    ).toHaveClass("skill-picker__trigger--empty");
  });

  test("shows an S4 preview skill as selected while its parameters are pending", () => {
    const pendingSkill = {
      basePower: null,
      calculationStatus: "pending-skill-data",
      category: null,
      cost: null,
      id: "preview-broadcast",
      name: "广播",
      type: null,
    };
    render(
      <SkillPicker
        choices={[pendingSkill]}
        label="攻击方技能 1"
        onChange={() => {}}
        value={pendingSkill.id}
      />,
    );

    const trigger = screen.getByRole("button", { name: "选择攻击方技能 1" });
    expect(trigger).toHaveTextContent("广播");
    expect(trigger).toHaveTextContent("参数待确认");
    expect(trigger).not.toHaveClass("skill-picker__trigger--empty");
  });

  test("shows the calculated skill when it is absent from the learnset choices", () => {
    const snapshot = createSnapshot();
    const initialState = createCalculatorStore(snapshot).getState();
    snapshot.learnsets = snapshot.learnsets.map((entry) =>
      entry.spiritId === "spirit-a"
        ? { ...entry, skillIds: [] }
        : entry
    );
    const store = createCalculatorStore(snapshot, initialState);

    render(<BattleWorkspace snapshot={snapshot} store={store} />);

    const trigger = screen.getByRole("button", {
      name: "选择攻击方单技能",
    });
    expect(trigger).toHaveTextContent("烈焰冲击");
    expect(trigger).toHaveTextContent("物理");
    expect(trigger).toHaveTextContent("威力 80");
    expect(within(trigger).getByAltText("火系图标")).toBeInTheDocument();
    expect(screen.queryByText("请选择技能")).not.toBeInTheDocument();
  });

  test("keeps calculated skill names visible when a bundled choice is unavailable", () => {
    render(
      <SkillSlots
        choices={[]}
        fallbackSkills={[
          {
            basePower: 35,
            category: "physical",
            cost: 0,
            name: "抓挠",
            type: "火",
          },
        ]}
        label="攻击方"
        onChange={() => {}}
        onSelect={() => {}}
        rows={[
          {
            hpPercent: 6.3,
            skillName: "抓挠",
            status: "exact",
            totalDamage: 27,
          },
        ]}
        selectedIndex={0}
        values={["skill-grab"]}
      />,
    );

    expect(screen.getByText("抓挠")).toBeInTheDocument();
    expect(screen.getByText("物理")).toBeInTheDocument();
    expect(screen.getByText("威力 35")).toBeInTheDocument();
    expect(screen.getByText("能量 0")).toBeInTheDocument();
    expect(screen.getByAltText("火系图标")).toBeInTheDocument();
  });

  test("writes a status skill input to the context", () => {
    const onContextChange = vi.fn();

    render(
      <SkillConditionEditor
        context={{}}
        direction={{ hitCount: 1, overrides: {} }}
        onContextChange={onContextChange}
        onDirectionChange={() => {}}
        skill={{ name: "放晴" }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "应对防御成功" }));

    expect(onContextChange).toHaveBeenCalledWith({
      counterDefenseSucceeded: true,
    });
  });

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
    const attackerSkills = screen.getByLabelText("攻击方技能面板");
    expect(
      within(attackerSkills).getByRole("button", {
        name: /查看烈焰冲击伤害 96 20\.2% HP/u,
      }),
    ).toHaveClass("skill-result-row__result--selected");

    const secondSkillTrigger = screen.getByRole("button", {
      name: "选择攻击方技能 2",
    });
    expect(secondSkillTrigger).not.toHaveClass(
      "skill-picker__trigger--expanded",
    );
    fireEvent.click(secondSkillTrigger);
    expect(secondSkillTrigger).toHaveClass("skill-picker__trigger--expanded");
    const picker = screen.getByLabelText("攻击方技能 2选项");
    expect(
      within(picker).queryByRole("button", { name: /不可学习/ }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      within(picker).getByRole("button", { name: /闪燃/ }),
    );

    fireEvent.click(
      within(attackerSkills).getByRole("button", {
        name: /查看闪燃伤害/u,
      }),
    );
    expect(screen.getByRole("button", { name: "技能参数" }))
      .toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "触发应对" }));
    fireEvent.input(screen.getByLabelText("静态威力"), {
      target: { value: "95" },
    });
    fireEvent.input(screen.getByLabelText("连击数"), {
      target: { value: "3" },
    });

    expect(store.getState().sides.attacker.skills.four[1]).toEqual({
      context: { counterTriggered: true },
      hitCount: 3,
      overrides: {
        basePower: undefined,
        powerOverride: { mode: "static", value: 95 },
      },
      skillId: "skill-b",
    });
    expect(
      store.getState().directions.forward.selectedSkillIndex,
    ).toBe(1);
    expect(store.getState().directions.forward.context).toEqual({});
  });

  test("edits the selected four-skill slot from the always-visible result parameter tab", () => {
    const snapshot = createSnapshot();
    const store = createCalculatorStore(snapshot);
    render(<BattleWorkspace snapshot={snapshot} store={store} />);

    fireEvent.click(screen.getByRole("button", { name: "四技能模式" }));
    fireEvent.click(screen.getAllByRole("button", {
      name: /查看烈焰冲击伤害/u,
    })[0]);

    expect(screen.getByRole("button", { name: "技能参数" }))
      .toHaveAttribute("aria-pressed", "true");
    fireEvent.input(screen.getByLabelText("静态威力"), {
      target: { value: "92" },
    });

    expect(store.getState().sides.attacker.skills.four[0]).toMatchObject({
      overrides: { powerOverride: { mode: "static", value: 92 } },
      skillId: "skill-a",
    });
    expect(screen.getByRole("dialog", { name: "伤害结果" }))
      .toBeInTheDocument();
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

    fireEvent.input(screen.getByLabelText("静态威力"), {
      target: { value: "95" },
    });
    fireEvent.input(screen.getByLabelText("连击数"), {
      target: { value: "3" },
    });
    expect(store.getState().directions.forward).toMatchObject({
      hitCount: 3,
      overrides: {
        basePower: undefined,
        powerOverride: { mode: "static", value: 95 },
      },
    });
    const manualFields = screen.getByLabelText("威力与连击参数");
    expect(within(manualFields).getByLabelText("静态威力"))
      .toBeInTheDocument();
    expect(within(manualFields).getByLabelText("连击数"))
      .toBeInTheDocument();
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
      screen.getByRole("button", { name: "切换计算方向" }),
    );

    expect(store.getState().sides).toBe(before);
    expect(screen.getByLabelText("防守方宠物摘要"))
      .toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByText("潮汐冲击")).not.toHaveLength(0);
    expect(screen.getByLabelText("确定性伤害")).not.toBeEmptyDOMElement();
  });
});
