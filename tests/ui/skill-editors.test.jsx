import {
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { AdvancedOptions } from "../../src/components/AdvancedOptions.jsx";
import {
  CompactFourSkillEditor,
  CompactSingleSkillEditor,
} from "../../src/components/CompactSkillEditor.jsx";
import { FourSkillEditor } from "../../src/components/FourSkillEditor.jsx";
import { SkillPicker } from "../../src/components/SkillPicker.jsx";
import {
  getTraitAutomaticStack,
  getTraitEffectInputs,
} from "../../src/domain/trait-effects.js";
import {
  describeResolution,
  SingleSkillEditor,
  TraitInputs,
} from "../../src/components/SingleSkillEditor.jsx";

const skills = [
  {
    basePower: 80,
    category: "physical",
    cost: 1,
    id: "wind-impact",
    name: "风力冲击",
    type: "翼",
  },
  {
    basePower: 60,
    category: "magical",
    cost: 1,
    id: "water-bomb",
    name: "水之波纹",
    searchText: "水之波纹|shuizhibowen|szbw",
    type: "水",
  },
];

test("特性选择只在满足条件时显示依赖字段", () => {
  const inputs = [
    {
      contextKey: "contractBallType",
      id: "trait.ball",
      label: "咕噜球",
      options: [{ value: "normal", label: "普通球" }, { value: "prism", label: "棱镜球" }],
      scope: "direction",
      type: "choice",
    },
    {
      contextKey: "contractPrismEffect",
      id: "trait.prism",
      label: "棱镜效果",
      options: [{ value: "normal", label: "普通球" }],
      scope: "direction",
      type: "choice",
      visibleWhen: { equals: "prism", id: "trait.ball" },
    },
  ];
  const { rerender } = render(
    <TraitInputs context={{ "trait.ball": "normal" }} inputs={inputs} />,
  );
  expect(screen.queryByRole("combobox", { name: "棱镜效果" })).not.toBeInTheDocument();

  rerender(<TraitInputs context={{ "trait.ball": "prism" }} inputs={inputs} />);
  expect(screen.getByRole("combobox", { name: "棱镜效果" })).toBeVisible();
});

test("explains automatic difference-based power with both panel values", () => {
  expect(
    describeResolution({
      formulaSteps: [
        {
          after: 60,
          before: -22,
          input: { attacker: 176, defender: 198 },
          label: "速度差威力",
          source: "reviewed-rule:speed-defense-difference-v1",
        },
      ],
    }),
  ).toBe("速度 176 − 198 = -22 → 威力 60");

  expect(
    describeResolution({
      formulaSteps: [
        {
          after: 140,
          before: 37,
          input: { attacker: 183, defender: 146 },
          label: "物防差威力",
          source: "reviewed-rule:speed-defense-difference-v1",
        },
      ],
    }),
  ).toBe("物防 183 − 146 = 37 → 威力 140");
});

test("single-skill difference rules keep table power separate from trait power", () => {
  const flashStrike = {
    ...skills[0],
    basePower: 60,
    id: "flash-strike-single",
    name: "闪击",
    ruleId: "speed_difference",
  };

  render(
    <SingleSkillEditor
      hitCount={1}
      manualPower={60}
      onHitCountChange={vi.fn()}
      onManualPowerChange={vi.fn()}
      onSkillSelect={vi.fn()}
      result={{
        resolvedPower: 190,
        skillPower: 285,
        status: "exact",
      }}
      selectedSkill={flashStrike}
      skills={[flashStrike]}
    />,
  );

  const powerSummary = screen.getByLabelText("技能威力");
  expect(within(powerSummary).getByText("190")).toBeVisible();
  expect(within(powerSummary).queryByText("285")).not.toBeInTheDocument();
});

test("other absolute dynamic rules also show their resolved power before traits", () => {
  const manaBurst = {
    ...skills[1],
    basePower: 45,
    id: "mana-burst-display",
    name: "魔能爆",
    ruleId: "mana_burst",
  };

  render(
    <SingleSkillEditor
      hitCount={1}
      manualPower={45}
      onHitCountChange={vi.fn()}
      onManualPowerChange={vi.fn()}
      onSkillSelect={vi.fn()}
      result={{
        resolvedPower: 135,
        skillPower: 203,
        status: "exact",
      }}
      selectedSkill={manaBurst}
      skills={[manaBurst]}
    />,
  );

  const powerSummary = screen.getByLabelText("技能威力");
  expect(within(powerSummary).getByText("135")).toBeVisible();
  expect(within(powerSummary).queryByText("203")).not.toBeInTheDocument();
});

test("single-skill editor keeps actual power directly editable", async () => {
  const user = userEvent.setup();
  const onManualPowerChange = vi.fn();

  render(
    <SingleSkillEditor
      hitCount={1}
      manualPower={80}
      onHitCountChange={vi.fn()}
      onManualPowerChange={onManualPowerChange}
      onSkillSelect={vi.fn()}
      selectedSkill={skills[0]}
      skills={skills}
    />,
  );

  expect(screen.getByRole("combobox", { name: "选择技能" })).toHaveValue("风力冲击");
  expect(screen.queryByText("从技能库选择技能")).not.toBeInTheDocument();
  expect(screen.getByText("物理")).toBeVisible();
  expect(screen.getByText("翼")).toBeVisible();
  expect(screen.queryByRole("tab", { name: /手动威力/ })).not.toBeInTheDocument();
  const manualPower = screen.getByRole("spinbutton", {
    name: "基础技能威力",
  });
  expect(manualPower).toBeVisible();
  await user.clear(manualPower);
  await user.type(manualPower, "92");
  expect(onManualPowerChange).toHaveBeenLastCalledWith(92);
});

test("single-skill editor displays the effective type returned by calculation", () => {
  const normalSkill = {
    ...skills[0],
    id: "normal-strike",
    name: "先发制人",
    type: "普通",
  };

  render(
    <SingleSkillEditor
      hitCount={1}
      manualPower={55}
      onHitCountChange={vi.fn()}
      onManualPowerChange={vi.fn()}
      onSkillSelect={vi.fn()}
      result={{ typeLabel: "翼" }}
      selectedSkill={normalSkill}
      skills={[...skills, normalSkill]}
    />,
  );

  const facts = screen.getByLabelText("技能属性");
  expect(within(facts).getByText("翼")).toBeVisible();
  expect(within(facts).queryByText("普通")).not.toBeInTheDocument();
});

test("single-skill editor switches to compact game-displayed power input", async () => {
  const user = userEvent.setup();
  const onPowerModeChange = vi.fn();

  const { rerender } = render(
    <SingleSkillEditor
      attackerTrait={{
        description: "入场首回合物攻提高。",
        name: "专注力",
      }}
      hitCount={1}
      manualPower={80}
      onHitCountChange={vi.fn()}
      onManualPowerChange={vi.fn()}
      onPowerModeChange={onPowerModeChange}
      onSkillSelect={vi.fn()}
      powerMode="base"
      selectedSkill={skills[0]}
      skills={skills}
    />,
  );

  await user.click(screen.getByText("手动调整"));
  await user.click(screen.getByRole("button", { name: "游戏内威力" }));
  expect(onPowerModeChange).toHaveBeenCalledWith("displayed");

  rerender(
    <SingleSkillEditor
      attackerTrait={{
        description: "入场首回合物攻提高。",
        name: "专注力",
      }}
      hitCount={1}
      manualPower={160}
      onHitCountChange={vi.fn()}
      onManualPowerChange={vi.fn()}
      onPowerModeChange={onPowerModeChange}
      onSkillSelect={vi.fn()}
      powerMode="displayed"
      selectedSkill={skills[0]}
      skills={skills}
    />,
  );

  expect(
    screen.getByRole("spinbutton", { name: "游戏内显示威力" }),
  ).toHaveValue(160);
  expect(screen.getByText("已含特性/克制/等级")).toBeVisible();
  expect(screen.queryByText("攻击特性")).not.toBeInTheDocument();
});

test("single-skill picker filters by typed pinyin and commits the matching skill", async () => {
  const user = userEvent.setup();
  const onSkillSelect = vi.fn();

  render(
    <SingleSkillEditor
      hitCount={1}
      manualPower={80}
      onHitCountChange={vi.fn()}
      onManualPowerChange={vi.fn()}
      onSkillSelect={onSkillSelect}
      selectedSkill={skills[0]}
      skills={skills}
    />,
  );

  const picker = screen.getByRole("combobox", { name: "选择技能" });
  await user.clear(picker);
  await user.type(picker, "shuizhi");
  await user.click(screen.getByRole("option", { name: /水之波纹/ }));

  expect(onSkillSelect).toHaveBeenCalledWith("water-bomb");
});

test("skill picker virtualizes the complete library without truncating search", async () => {
  const user = userEvent.setup();
  const completeLibrary = Array.from({ length: 553 }, (_, index) => ({
    basePower: 40 + index,
    category: "physical",
    cost: 1,
    id: `skill-${index + 1}`,
    name: `技能${index + 1}`,
    type: "普通",
  }));

  render(
    <SkillPicker
      ariaLabel="选择技能"
      onSelect={vi.fn()}
      selected={completeLibrary[0]}
      skills={completeLibrary}
    />,
  );

  await user.click(screen.getByRole("combobox", { name: "选择技能" }));

  expect(screen.getAllByRole("option").length).toBeLessThanOrEqual(24);
  expect(screen.queryByRole("option", { name: /技能553/ })).not.toBeInTheDocument();

  await user.clear(screen.getByRole("combobox", { name: "选择技能" }));
  await user.type(
    screen.getByRole("combobox", { name: "选择技能" }),
    "技能553",
  );
  expect(screen.getByRole("option", { name: /技能553/ })).toBeVisible();
});

test("skill picker keeps keyboard navigation synchronized with its virtual window", async () => {
  const user = userEvent.setup();
  const onSelect = vi.fn();
  const completeLibrary = Array.from({ length: 553 }, (_, index) => ({
    basePower: 40,
    category: "physical",
    cost: 1,
    id: `skill-${index + 1}`,
    name: `技能${index + 1}`,
    type: "普通",
  }));

  render(
    <SkillPicker
      ariaLabel="选择技能"
      onSelect={onSelect}
      selected={completeLibrary[0]}
      skills={completeLibrary}
    />,
  );

  const picker = screen.getByRole("combobox", { name: "选择技能" });
  await user.click(picker);
  for (let index = 0; index < 30; index += 1) {
    await user.keyboard("{ArrowDown}");
  }
  expect(screen.getAllByRole("option").length).toBeLessThanOrEqual(24);
  await user.keyboard("{Enter}");
  expect(onSelect).toHaveBeenCalledWith("skill-31");
});

test("skill picker keeps its active descendant mounted after manual scrolling", async () => {
  const user = userEvent.setup();
  const onSelect = vi.fn();
  const completeLibrary = Array.from({ length: 553 }, (_, index) => ({
    basePower: 40,
    category: "physical",
    cost: 1,
    id: `skill-${index + 1}`,
    name: `技能${index + 1}`,
    type: "普通",
  }));

  render(
    <SkillPicker
      ariaLabel="选择技能"
      onSelect={onSelect}
      selected={completeLibrary[0]}
      skills={completeLibrary}
    />,
  );

  const picker = screen.getByRole("combobox", { name: "选择技能" });
  await user.click(picker);
  const listbox = screen.getByRole("listbox");
  Object.defineProperty(listbox, "scrollTop", {
    configurable: true,
    value: 100,
    writable: true,
  });
  fireEvent.scroll(listbox);
  expect(listbox.scrollTop).toBe(100);

  Object.defineProperty(listbox, "scrollTop", {
    configurable: true,
    value: 553 * 42 - 360,
    writable: true,
  });
  fireEvent.scroll(listbox);

  const activeId = picker.getAttribute("aria-activedescendant");
  expect(activeId).toBeTruthy();
  expect(document.getElementById(activeId)).toBeInTheDocument();

  await user.keyboard("{ArrowDown}{Enter}");
  expect(onSelect).toHaveBeenCalledWith("skill-547");
});

test("skill picker prioritizes learnable skills without hiding the rest", async () => {
  const user = userEvent.setup();
  render(
    <SkillPicker
      ariaLabel="选择技能"
      onSelect={vi.fn()}
      selected={skills[1]}
      skills={[
        { ...skills[1], learnable: false },
        { ...skills[0], learnable: true },
      ]}
    />,
  );

  await user.click(screen.getByRole("combobox", { name: "选择技能" }));

  const options = screen.getAllByRole("option");
  expect(options).toHaveLength(2);
  expect(options[0]).toHaveTextContent("风力冲击");
  expect(options[1]).toHaveTextContent("水之波纹");
});

test("skill choices expose type category power cost and learnability", async () => {
  const user = userEvent.setup();
  render(
    <SingleSkillEditor
      hitCount={1}
      manualPower={80}
      onHitCountChange={vi.fn()}
      onManualPowerChange={vi.fn()}
      onSkillSelect={vi.fn()}
      selectedSkill={skills[0]}
      skills={[
        { ...skills[0], learnable: true },
        { ...skills[1], learnable: false },
      ]}
    />,
  );

  const picker = screen.getByRole("combobox", { name: "选择技能" });
  await user.clear(picker);
  await user.type(picker, "风力");
  const option = screen.getByRole("option", { name: /风力冲击/ });

  expect(within(option).getByText("物理")).toBeVisible();
  expect(within(option).getByText("威 80")).toBeVisible();
  expect(within(option).getByText("耗 1")).toBeVisible();
  expect(within(option).getByText("可学习")).toBeVisible();
  expect(within(option).getByRole("img")).toHaveAttribute(
    "src",
    "/assets/elements/wing.png",
  );
});

test("shows required trait conditions as explicit inputs", async () => {
  const user = userEvent.setup();
  const onTraitContextChange = vi.fn();
  render(
    <SingleSkillEditor
      attackerTrait={{
        conditionKey: "traitActivated",
        conditionLabel: "入场首回合",
        description: "入场首回合，获得物攻+100%。",
        name: "专注力",
      }}
      hitCount={1}
      manualPower={80}
      onHitCountChange={vi.fn()}
      onManualPowerChange={vi.fn()}
      onSkillSelect={vi.fn()}
      onTraitContextChange={onTraitContextChange}
      selectedSkill={skills[0]}
      skills={skills}
      traitContext={{ traitActivated: true }}
    />,
  );

  const condition = screen.getByRole("checkbox", { name: "入场首回合" });
  expect(condition).toBeChecked();
  await user.click(condition);
  expect(onTraitContextChange).toHaveBeenCalledWith("traitActivated", false);
});

test("Beast Flower trait renders all bloodlines and a separate entry trigger", async () => {
  const user = userEvent.setup();
  const onTraitContextChange = vi.fn();
  const trait = {
    description: "根据自己的血脉，入场时获得不同效果。",
    name: "稀兽花宝",
  };
  const inputs = getTraitEffectInputs(trait, "attacker");

  render(
    <SingleSkillEditor
      attackerTrait={{ ...trait, inputs }}
      hitCount={1}
      manualPower={80}
      onHitCountChange={vi.fn()}
      onManualPowerChange={vi.fn()}
      onSkillSelect={vi.fn()}
      onTraitContextChange={onTraitContextChange}
      selectedSkill={skills[0]}
      skills={skills}
      traitContext={{}}
    />,
  );

  const bloodline = screen.getByRole("combobox", { name: "血脉" });
  expect(within(bloodline).getAllByRole("option")).toHaveLength(19);
  expect(within(bloodline).getByRole("option", {
    name: "普通｜技能威力 +40",
  })).toBeVisible();
  expect(within(bloodline).getByRole("option", {
    name: "幻｜对方星陨 ×2",
  })).toBeVisible();

  await user.selectOptions(bloodline, "illusion");
  expect(onTraitContextChange).toHaveBeenCalledWith(
    expect.stringMatching(/^attackerTrait\.bloodlineType\.[a-f0-9]{8}$/),
    "illusion",
  );
  await user.click(screen.getByRole("checkbox", { name: "入场已触发" }));
  expect(onTraitContextChange).toHaveBeenCalledWith(
    expect.stringMatching(/^attackerTrait\.bloodlineActivated\.[a-f0-9]{8}$/),
    true,
  );
});

test("shows reviewed dynamic skill conditions as editable inputs", async () => {
  const user = userEvent.setup();
  const onTraitContextChange = vi.fn();
  render(
    <SingleSkillEditor
      hitCount={1}
      manualPower={0}
      onHitCountChange={vi.fn()}
      onManualPowerChange={vi.fn()}
      onSkillSelect={vi.fn()}
      onTraitContextChange={onTraitContextChange}
      selectedSkill={{
        ...skills[1],
        basePower: null,
        ruleId: "mana_burst",
      }}
      skills={skills}
      traitContext={{}}
    />,
  );

  await user.type(screen.getByRole("spinbutton", { name: "当前能量" }), "4");
  expect(onTraitContextChange).toHaveBeenLastCalledWith(
    expect.stringMatching(/^skill\.energy\.[a-f0-9]{8}$/),
    4,
  );
  fireEvent.change(screen.getByRole("spinbutton", { name: "当前能量" }), {
    target: { value: "99" },
  });
  expect(onTraitContextChange).toHaveBeenLastCalledWith(
    expect.stringMatching(/^skill\.energy\.[a-f0-9]{8}$/),
    10,
  );
});

test("shows the Wish Power target-status condition", async () => {
  const user = userEvent.setup();
  const onTraitContextChange = vi.fn();
  const wishPower = {
    basePower: 80,
    category: "dual",
    cost: 3,
    description: "目标使用状态技能时威力提升。",
    id: "wish-power-fire",
    name: "愿力冲击",
    type: "火",
  };

  render(
    <SingleSkillEditor
      hitCount={1}
      manualPower={80}
      onHitCountChange={vi.fn()}
      onManualPowerChange={vi.fn()}
      onSkillSelect={vi.fn()}
      onTraitContextChange={onTraitContextChange}
      selectedSkill={wishPower}
      skills={[wishPower]}
      traitContext={{}}
    />,
  );

  await user.click(
    screen.getByRole("checkbox", { name: "目标本回合使用状态技能" }),
  );
  expect(onTraitContextChange).toHaveBeenCalledWith(
    expect.stringMatching(/^skill\.enemyUsedStatusSkill\.[a-f0-9]{8}$/),
    true,
  );
});

test("shows every skill effect and calculates Head-on Blow from its condition", async () => {
  const user = userEvent.setup();
  const onTraitContextChange = vi.fn();
  const headOnBlow = {
    basePower: 80,
    category: "physical",
    cost: 3,
    description: "造成物伤，若敌方本回合更换精灵，本次技能威力+100。",
    id: "head-on-blow",
    name: "当头棒喝",
    ruleId: null,
    type: "普通",
  };

  render(
    <SingleSkillEditor
      hitCount={1}
      manualPower={80}
      onHitCountChange={vi.fn()}
      onManualPowerChange={vi.fn()}
      onSkillSelect={vi.fn()}
      onTraitContextChange={onTraitContextChange}
      result={{
        effectivePower: 180,
        formulaSteps: [
          {
            after: 180,
            before: 80,
            input: true,
            label: "敌方本回合换精灵",
            source: "reviewed-rule:boolean-power-add-v1",
          },
        ],
        status: "exact",
      }}
      selectedSkill={headOnBlow}
      skills={[headOnBlow]}
      traitContext={{ enemySwitchedThisTurn: true }}
    />,
  );

  expect(screen.getByText(headOnBlow.description)).toBeVisible();
  expect(
    screen.getByRole("spinbutton", { name: "基础技能威力" }),
  ).toHaveValue(80);
  const powerSummary = screen.getByLabelText("技能威力");
  expect(within(powerSummary).getByText("实际")).toBeVisible();
  expect(within(powerSummary).getByText("180")).toBeVisible();
  expect(screen.getByText("80 + 100 = 180")).toBeVisible();
  const condition = screen.getByRole("checkbox", {
    name: "敌方本回合换精灵",
  });
  expect(condition).toBeChecked();
  await user.click(condition);
  expect(onTraitContextChange).toHaveBeenCalledWith(
    expect.stringMatching(/^skill\.enemySwitchedThisTurn\.[a-f0-9]{8}$/),
    false,
  );
});

test("shows known skill power even when final damage still needs support", () => {
  render(
    <SingleSkillEditor
      hitCount={1}
      manualPower={80}
      onHitCountChange={vi.fn()}
      onManualPowerChange={vi.fn()}
      onSkillSelect={vi.fn()}
      result={{
        reason: "特性伤害规则尚未验证",
        skillPower: 80,
        status: "unsupported",
      }}
      selectedSkill={skills[0]}
      skills={skills}
    />,
  );

  const powerSummary = screen.getByLabelText("技能威力");
  expect(within(powerSummary).getByText("80")).toBeVisible();
  expect(within(powerSummary).queryByText("待输入")).not.toBeInTheDocument();
});

test("choice skills use a compact branch control and reveal only relevant conditions", async () => {
  const user = userEvent.setup();
  const onTraitContextChange = vi.fn();
  const friendship = {
    basePower: 70,
    category: "magical",
    cost: 2,
    description: "造成魔伤，选择：每次使用后威力永久+20或应对状态时本次技能威力+100%。",
    id: "friendship-overflow",
    name: "友谊满溢",
    type: "普通",
  };

  const { rerender } = render(
    <SingleSkillEditor
      hitCount={1}
      manualPower={70}
      onHitCountChange={vi.fn()}
      onManualPowerChange={vi.fn()}
      onSkillSelect={vi.fn()}
      onTraitContextChange={onTraitContextChange}
      selectedSkill={friendship}
      skills={[friendship]}
      traitContext={{ friendshipMode: "growth", skillUseCount: 2 }}
    />,
  );

  expect(screen.getByRole("group", { name: "选择效果" })).toBeVisible();
  expect(screen.getByRole("button", { name: "威力成长" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(screen.getByRole("spinbutton", { name: "此前使用次数" })).toBeVisible();
  expect(
    screen.queryByRole("checkbox", { name: "触发应对" }),
  ).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "应对翻倍" }));
  expect(onTraitContextChange).toHaveBeenCalledWith(
    expect.stringMatching(/^skill\.friendshipMode\.[a-f0-9]{8}$/),
    "counter",
  );

  rerender(
    <SingleSkillEditor
      hitCount={1}
      manualPower={70}
      onHitCountChange={vi.fn()}
      onManualPowerChange={vi.fn()}
      onSkillSelect={vi.fn()}
      onTraitContextChange={onTraitContextChange}
      selectedSkill={friendship}
      skills={[friendship]}
      traitContext={{ friendshipMode: "counter" }}
    />,
  );

  expect(screen.getByRole("checkbox", { name: "触发应对" })).toBeVisible();
  expect(screen.getByRole("spinbutton", { name: "此前使用次数" })).toBeVisible();
});

test("explains a selected non-damage branch instead of calling it untriggered", () => {
  const flower = {
    basePower: 95,
    category: "magical",
    cost: 2,
    description: "造成魔伤，选择生命加威或应对回血。",
    id: "flower",
    name: "撒花",
    type: "草",
  };

  render(
    <SingleSkillEditor
      hitCount={1}
      manualPower={95}
      onHitCountChange={vi.fn()}
      onManualPowerChange={vi.fn()}
      onSkillSelect={vi.fn()}
      onTraitContextChange={vi.fn()}
      result={{
        effectivePower: 95,
        formulaSteps: [
          {
            after: 95,
            before: 95,
            input: true,
            label: "应对回血分支（伤害不变）",
            source: "reviewed-rule:flower-choice-v1",
          },
          {
            after: 95,
            before: 95,
            label: "基础威力",
            source: "skill",
          },
        ],
        status: "exact",
      }}
      selectedSkill={flower}
      skills={[flower]}
      traitContext={{ counterTriggered: true, flowerMode: "heal" }}
    />,
  );

  expect(screen.getByText("应对回血分支（伤害不变）")).toBeVisible();
  expect(screen.queryByText("当前条件未触发加成")).not.toBeInTheDocument();
});

test("four-skill choice controls stay compact and update their own slot context", async () => {
  const user = userEvent.setup();
  const onSkillContextChange = vi.fn();
  const testFlight = {
    ...skills[0],
    basePower: 20,
    description: "造成物伤，2连击。选择：每次使用后本技能威力永久+10或连击数永久+1。",
    id: "test-flight",
    name: "试飞",
    slotContext: { flightMode: "power", skillUseCount: 2 },
  };

  render(
    <FourSkillEditor
      attackerName="音速犬"
      attackerSkills={[testFlight, null, null, null]}
      defenderName="水灵"
      defenderSkills={[skills[1], null, null, null]}
      onSkillContextChange={onSkillContextChange}
      onSkillSelect={vi.fn()}
      skills={[...skills, testFlight]}
    />,
  );

  const branch = screen.getByRole("combobox", {
    name: "攻击方技能1选择成长",
  });
  await user.selectOptions(branch, "hits");
  expect(onSkillContextChange).toHaveBeenCalledWith(
    "attacker",
    0,
    expect.stringMatching(/^skill\.flightMode\.[a-f0-9]{8}$/),
    "hits",
  );
});

test("展翅显示实际翼属性并让疾风涡轮选择同队前置翼技", async () => {
  const user = userEvent.setup();
  const onSkillContextChange = vi.fn();
  const normalAttack = {
    basePower: 55,
    category: "physical",
    cost: 2,
    id: "normal-strike",
    name: "先发制人",
    type: "普通",
  };
  const wingStatus = {
    basePower: 0,
    category: "status",
    cost: 2,
    id: "wing-status",
    name: "羽化加速",
    type: "翼",
  };
  const turbine = {
    basePower: 100,
    category: "physical",
    cost: 0,
    id: "gale-turbine",
    name: "疾风涡轮",
    slotContext: { galeTurbineCompanionSlot: "1" },
    type: "翼",
  };

  render(
    <FourSkillEditor
      attackerName="凡鹰"
      attackerResults={[
        { hpPercent: 10, totalDamage: 40, typeLabel: "翼" },
        { hpPercent: 10, totalDamage: 40, typeLabel: "水" },
        { reason: "非伤害技能不计算伤害", typeLabel: "翼" },
        { hpPercent: 30, totalDamage: 120, typeLabel: "翼" },
      ]}
      attackerSkills={[normalAttack, skills[1], wingStatus, turbine]}
      attackerTrait={{ description: "普通转翼。", inputs: [], name: "展翅" }}
      defenderName="水灵"
      defenderSkills={[skills[1], null, null, null]}
      onSkillContextChange={onSkillContextChange}
      onSkillSelect={vi.fn()}
      skills={[...skills, normalAttack, wingStatus, turbine]}
    />,
  );

  expect(
    within(
      screen.getByRole("group", { name: "攻击方技能1，当前选中" }),
    ).getByText("翼·物"),
  ).toBeVisible();
  const companion = screen.getByRole("combobox", {
    name: "攻击方技能4前置翼技",
  });
  expect(within(companion).getByRole("option", { name: "1 · 先发制人" })).toBeVisible();
  expect(within(companion).getByRole("option", { name: "3 · 羽化加速" })).toBeVisible();
  expect(within(companion).queryByRole("option", { name: /水之波纹/ })).not.toBeInTheDocument();

  await user.selectOptions(companion, "3");
  expect(onSkillContextChange).toHaveBeenCalledWith(
    "attacker",
    3,
    "galeTurbineCompanionSlot",
    "3",
  );
});

test("Tundra displays an automatic carried-ice count instead of an editable stack", () => {
  const tundra = {
    description: "每携带1个冰系技能进入战斗，地系技能威力+10%。",
    name: "冻土",
  };
  const iceSkill = {
    ...skills[0],
    id: "ice-skill",
    name: "冰冻打击",
    type: "冰",
  };

  render(
    <FourSkillEditor
      attackerName="獾牙猪"
      attackerSkills={[iceSkill, skills[1], iceSkill, null]}
      attackerTrait={{
        automaticStack: getTraitAutomaticStack(tundra, "attacker"),
        description: tundra.description,
        inputs: getTraitEffectInputs(tundra, "attacker"),
        name: tundra.name,
      }}
      defenderName="水灵"
      defenderSkills={[skills[1], null, null, null]}
      onSkillSelect={vi.fn()}
      skills={[...skills, iceSkill]}
    />,
  );

  expect(screen.getByLabelText("携带冰系技能数（自动读取）")).toHaveTextContent("2");
  expect(
    screen.queryByRole("spinbutton", { name: "携带冰系技能数" }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("spinbutton", { name: "每层威力" })).toBeVisible();
});

test("supported Jal-family traits expose an explicit trigger only on choice skills", async () => {
  const user = userEvent.setup();
  const onSkillContextChange = vi.fn();
  const friendship = {
    basePower: 70,
    category: "magical",
    cost: 2,
    description:
      "造成魔伤，选择：每次使用后威力永久+20或应对状态时本次技能威力+100%。",
    id: "friendship-overflow",
    name: "友谊满溢",
    slotContext: { choiceTraitTriggered: false },
    type: "普通",
  };

  render(
    <FourSkillEditor
      attackerName="加益"
      attackerSkills={[friendship, skills[0], null, null]}
      attackerTrait={{ description: "额外执行另一选择。", name: "有求必应" }}
      defenderName="水灵"
      defenderSkills={[skills[1], null, null, null]}
      onSkillContextChange={onSkillContextChange}
      onSkillSelect={vi.fn()}
      skills={[...skills, friendship]}
    />,
  );

  const trigger = screen.getByRole("checkbox", {
    name: "攻击方技能1触发特性",
  });
  expect(trigger).toBeVisible();
  expect(
    screen.queryByRole("checkbox", { name: "攻击方技能2触发特性" }),
  ).not.toBeInTheDocument();

  await user.click(trigger);
  expect(onSkillContextChange).toHaveBeenCalledWith(
    "attacker",
    0,
    "choiceTraitTriggered",
    true,
  );
});

test("four-skill rows expose one visible selection and select from the whole row", async () => {
  const user = userEvent.setup();
  const onSkillActivate = vi.fn();
  const onSkillFocus = vi.fn();

  render(
    <FourSkillEditor
      activeSide="attacker"
      activeSkillIndex={1}
      attackerName="音速犬"
      attackerSkills={[skills[0], skills[1], null, null]}
      defenderName="水灵"
      defenderSkills={[skills[1], null, null, null]}
      onSkillActivate={onSkillActivate}
      onSkillFocus={onSkillFocus}
      onSkillSelect={vi.fn()}
      skills={skills}
    />,
  );

  const selectedRow = screen.getByRole("group", {
    name: "攻击方技能2，当前选中",
  });
  expect(selectedRow).toHaveClass("is-selected");
  expect(
    screen.getByRole("group", { name: "防御方技能1" }),
  ).not.toHaveClass("is-selected");

  await user.click(selectedRow);
  expect(onSkillFocus).toHaveBeenLastCalledWith("attacker", 1);
  expect(onSkillActivate).toHaveBeenLastCalledWith("attacker", 1);

  await user.click(
    screen.getByRole("combobox", { name: "攻击方技能2" }),
  );
  expect(onSkillActivate).toHaveBeenCalledTimes(1);

  await user.click(screen.getByRole("group", { name: "防御方技能1" }));
  expect(onSkillFocus).toHaveBeenLastCalledWith("defender", 0);
  expect(onSkillActivate).toHaveBeenLastCalledWith("defender", 0);
});

test("compact four-skill rows use the same mutually exclusive selection state", async () => {
  const user = userEvent.setup();
  const onSkillFocus = vi.fn();

  render(
    <CompactFourSkillEditor
      activeSide="defender"
      activeSkillIndex={0}
      attackerName="音速犬"
      attackerResults={[]}
      attackerSkillChoices={skills}
      attackerSkills={[skills[0], null, null, null]}
      defenderName="水灵"
      defenderResults={[]}
      defenderSkillChoices={skills}
      defenderSkills={[skills[1], null, null, null]}
      onSkillFocus={onSkillFocus}
      onSkillSelect={vi.fn()}
    />,
  );

  expect(
    screen.getByRole("group", { name: "防御方技能1，当前选中" }),
  ).toHaveClass("is-selected");
  expect(
    screen.getByRole("group", { name: "攻击方技能1" }),
  ).not.toHaveClass("is-selected");

  await user.click(screen.getByRole("group", { name: "攻击方技能1" }));
  expect(onSkillFocus).toHaveBeenLastCalledWith("attacker", 0);
});

test("compact four-skill editor displays the effective type returned by calculation", () => {
  const normalSkill = {
    ...skills[0],
    id: "normal-skill",
    name: "先发制人",
    type: "普通",
  };

  render(
    <CompactFourSkillEditor
      attackerName="凡鹰"
      attackerResults={[{
        hpPercent: 20,
        status: "exact",
        totalDamage: 80,
        typeLabel: "翼",
      }]}
      attackerSkillChoices={[normalSkill]}
      attackerSkills={[normalSkill, null, null, null]}
      defenderName="水灵"
      defenderResults={[]}
      defenderSkillChoices={skills}
      defenderSkills={[skills[1], null, null, null]}
      onSkillFocus={vi.fn()}
      onSkillSelect={vi.fn()}
    />,
  );

  const row = screen.getByRole("group", { name: "攻击方技能1，当前选中" });
  expect(within(row).getByTitle("翼")).toBeVisible();
  expect(within(row).queryByTitle("普通")).not.toBeInTheDocument();
});

test("compact single-skill editor displays the effective type returned by calculation", () => {
  const normalSkill = {
    ...skills[0],
    id: "normal-skill",
    name: "先发制人",
    type: "普通",
  };

  render(
    <CompactSingleSkillEditor
      attackName="凡鹰"
      defenseName="水灵"
      onSkillSelect={vi.fn()}
      result={{
        hpPercent: 20,
        status: "exact",
        totalDamage: 80,
        typeLabel: "翼",
      }}
      selectedSkill={normalSkill}
      skills={[normalSkill]}
    />,
  );

  expect(screen.getByTitle("翼")).toBeVisible();
  expect(screen.queryByTitle("普通")).not.toBeInTheDocument();
});

test("compact editors show the same dynamic power note", () => {
  const flashStrike = {
    ...skills[0],
    id: "compact-flash-strike",
    name: "闪击",
    ruleId: "speed_difference",
  };
  const result = {
    formulaSteps: [
      {
        after: 190,
        before: 111,
        input: { attacker: 254, defender: 143 },
        label: "速度差威力",
        source: "reviewed-rule:speed-defense-difference-v1",
      },
    ],
    hpPercent: 20,
    resolvedPower: 190,
    status: "exact",
    totalDamage: 80,
  };

  render(
    <>
      <CompactFourSkillEditor
        attackerName="岚鸟"
        attackerResults={[result]}
        attackerSkillChoices={[flashStrike]}
        attackerSkills={[flashStrike, null, null, null]}
        defenderName="炮米花"
        defenderResults={[]}
        defenderSkillChoices={skills}
        defenderSkills={[skills[1], null, null, null]}
        onSkillFocus={vi.fn()}
        onSkillSelect={vi.fn()}
      />
      <CompactSingleSkillEditor
        attackName="岚鸟"
        defenseName="炮米花"
        onSkillSelect={vi.fn()}
        result={result}
        selectedSkill={flashStrike}
        skills={[flashStrike]}
      />
    </>,
  );

  expect(
    screen.getAllByText("速度 254 − 143 = 111 → 威力 190"),
  ).toHaveLength(2);
});

test("four-skill editor shows selectable direct trait damage above skill one", async () => {
  const user = userEvent.setup();
  const onTraitDamageFocus = vi.fn();
  const onTraitDamageHitCountChange = vi.fn();

  render(
    <FourSkillEditor
      activeDamageSource="trait"
      activeSide="attacker"
      attackerName="石冠王蜥"
      attackerSkillChoices={skills}
      attackerSkills={[skills[0], null, null, null]}
      attackerTraitDamage={{
        basePower: 50,
        hitCount: 1,
        name: "刺肤",
        result: { hpPercent: 12.5, status: "exact", totalDamage: 60 },
        typeLabel: "无·特性",
      }}
      defenderName="水灵"
      defenderSkillChoices={skills}
      defenderSkills={[skills[1], null, null, null]}
      onSkillSelect={vi.fn()}
      onTraitDamageFocus={onTraitDamageFocus}
      onTraitDamageHitCountChange={onTraitDamageHitCountChange}
    />,
  );

  const traitRow = screen.getByRole("group", {
    name: "攻击方特性伤害刺肤，当前选中",
  });
  expect(traitRow).toHaveClass("is-selected");
  expect(within(traitRow).getByText("无·特性")).toBeVisible();
  expect(within(traitRow).getByText("50")).toBeVisible();
  expect(
    screen.getByRole("group", { name: "攻击方技能1" }),
  ).not.toHaveClass("is-selected");

  await user.click(traitRow);
  expect(onTraitDamageFocus).toHaveBeenCalledWith("attacker");
  fireEvent.change(
    within(traitRow).getByRole("spinbutton", { name: "攻击方刺肤连击次数" }),
    { target: { value: "3" } },
  );
  expect(onTraitDamageHitCountChange).toHaveBeenCalledWith("attacker", 3);
});

test("compact editor shows direct trait damage on either side without adding a skill slot", () => {
  render(
    <CompactFourSkillEditor
      activeDamageSource="trait"
      activeSide="defender"
      attackerName="音速犬"
      attackerResults={[]}
      attackerSkillChoices={skills}
      attackerSkills={[skills[0], null, null, null]}
      defenderName="石刺蜥"
      defenderResults={[]}
      defenderSkillChoices={skills}
      defenderSkills={[skills[1], null, null, null]}
      defenderTraitDamage={{
        basePower: 50,
        hitCount: 2,
        name: "刺肤",
        result: { hpPercent: 20, status: "exact", totalDamage: 90 },
        typeLabel: "无·特性",
      }}
      onSkillFocus={vi.fn()}
      onSkillSelect={vi.fn()}
      onTraitDamageFocus={vi.fn()}
    />,
  );

  expect(
    screen.getByRole("group", { name: "防御方特性伤害刺肤，当前选中" }),
  ).toBeVisible();
  expect(screen.getAllByRole("combobox")).toHaveLength(8);
});

test("four-skill HP rules use a draft-safe percent or current-HP control", async () => {
  const user = userEvent.setup();
  const onHealthChange = vi.fn();
  const comet = {
    ...skills[1],
    basePower: 240,
    cost: 0,
    description:
      "造成魔伤，每失去5%生命，本次技能威力-10，使用后消耗全部生命。",
    id: "comet",
    name: "彗星",
    slotContext: { attackerHpPercent: 0 },
    type: "普通",
  };

  render(
    <FourSkillEditor
      attackerHealth={{ currentHp: 315, maxHp: 315 }}
      attackerName="黑猫密探"
      attackerSkills={[comet, null, null, null]}
      defenderHealth={{ currentHp: 428, maxHp: 428 }}
      defenderName="圣光迪莫"
      defenderSkills={[skills[1], null, null, null]}
      onHealthChange={onHealthChange}
      onSkillSelect={vi.fn()}
      skills={[...skills, comet]}
    />,
  );

  expect(
    screen.queryByRole("spinbutton", {
      name: "攻击方技能1自身生命百分比",
    }),
  ).not.toBeInTheDocument();

  const percent = screen.getByRole("spinbutton", {
    name: "攻击方生命百分比",
  });
  expect(percent).toHaveValue(100);
  await user.clear(percent);
  expect(onHealthChange).not.toHaveBeenCalled();
  await user.type(percent, "50");
  expect(onHealthChange).toHaveBeenLastCalledWith("attacker", 158);

  await user.click(screen.getByRole("button", { name: "按当前值输入" }));
  const currentHp = screen.getByRole("spinbutton", {
    name: "攻击方当前生命",
  });
  expect(currentHp).toHaveValue(315);
  expect(screen.getByText("/ 315")).toBeVisible();
  await user.clear(currentHp);
  await user.type(currentHp, "200");
  expect(onHealthChange).toHaveBeenLastCalledWith("attacker", 200);
});

test("four-skill editor exposes erosion stacks and trigger above the slots", () => {
  const trait = {
    description: "敌方每有1层中毒效果，自己获得连击数+1。",
    name: "侵蚀",
  };
  render(
    <FourSkillEditor
      attackerName="厉毒修萝"
      attackerSkills={[{ ...skills[0], description: "造成物伤，3连击。" }, null, null, null]}
      attackerTrait={{
        ...trait,
        inputs: getTraitEffectInputs(trait, "attacker"),
      }}
      defenderName="水灵"
      defenderSkills={[skills[1], null, null, null]}
      onSkillSelect={vi.fn()}
      skills={skills}
    />,
  );

  expect(screen.getByRole("spinbutton", { name: "敌方中毒层数" })).toBeVisible();
  expect(screen.getByRole("checkbox", { name: "触发侵蚀" })).toBeVisible();
});

test("four-skill editor reuses the HP switch for blame shift", () => {
  const trait = {
    description: "自己每失去25%生命，连击数+2。",
    name: "嫁祸",
  };
  render(
    <FourSkillEditor
      attackerHealth={{ currentHp: 300, maxHp: 400, percent: 75 }}
      attackerName="朔夜伊芙"
      attackerSkills={[{ ...skills[0], description: "造成物伤，3连击。" }, null, null, null]}
      attackerTrait={{
        ...trait,
        inputs: getTraitEffectInputs(trait, "attacker"),
      }}
      defenderName="水灵"
      defenderSkills={[skills[1], null, null, null]}
      onSkillSelect={vi.fn()}
      skills={skills}
    />,
  );

  expect(screen.getByRole("spinbutton", { name: "攻击方生命百分比" })).toHaveValue(75);
  expect(screen.getByRole("checkbox", { name: "触发嫁祸" })).toBeVisible();
  expect(screen.queryByRole("spinbutton", { name: "自身生命百分比" })).not.toBeInTheDocument();
});

test("four-skill slots expose an attacker trait condition without blocking damage", async () => {
  const user = userEvent.setup();
  const onSkillContextChange = vi.fn();

  render(
    <FourSkillEditor
      attackerName="霜翼领主"
      attackerSkills={[skills[0], null, null, null]}
      attackerTrait={{
        conditionKey: "actedBeforeEnemy",
        conditionLabel: "先于敌方攻击",
        description: "若先于敌方攻击，本次技能威力+75%。",
        name: "破空",
      }}
      defenderName="风暴酷拉"
      defenderSkills={[skills[1], null, null, null]}
      onSkillContextChange={onSkillContextChange}
      onSkillSelect={vi.fn()}
      skills={skills}
    />,
  );

  const condition = screen.getByRole("checkbox", {
    name: "攻击方技能1先于敌方攻击",
  });
  expect(condition).not.toBeChecked();
  await user.click(condition);
  expect(onSkillContextChange).toHaveBeenCalledWith(
    "attacker",
    0,
    "actedBeforeEnemy",
    true,
  );
});

test("four-skill Color Dispersion exposes the mixed-blood target switch", async () => {
  const user = userEvent.setup();
  const onSkillContextChange = vi.fn();
  const colorDispersion = {
    ...skills[1],
    basePower: 80,
    description: "造成魔伤，对混血精灵造成伤害+50%。",
    id: "color-dispersion",
    name: "色散",
    type: "光",
  };

  render(
    <FourSkillEditor
      attackerName="绒光优优"
      attackerSkills={[colorDispersion, null, null, null]}
      defenderName="恶魔狼王"
      defenderSkills={[skills[1], null, null, null]}
      onSkillContextChange={onSkillContextChange}
      onSkillSelect={vi.fn()}
      skills={[...skills, colorDispersion]}
    />,
  );

  const condition = screen.getByRole("checkbox", {
    name: "攻击方技能1目标为混血精灵",
  });
  expect(condition).not.toBeChecked();
  await user.click(condition);
  expect(onSkillContextChange).toHaveBeenCalledWith(
    "attacker",
    0,
    expect.stringMatching(/^skill\.enemyIsMixedBloodline\.[a-f0-9]{8}$/),
    true,
  );
});

test("single-skill trait card exposes editable stacks and per-stack effect", async () => {
  const user = userEvent.setup();
  const onTraitContextChange = vi.fn();

  render(
    <SingleSkillEditor
      attackerTrait={{
        description:
          "己方精灵每完整使用1次选择技能，自己入场时获得物攻+40%。",
        inputs: [
          {
            defaultValue: 0,
            key: "attackerTraitStacks",
            label: "完整选择次数",
            max: 10,
            min: 0,
            scope: "direction",
            type: "number",
          },
          {
            defaultValue: 40,
            key: "attackerTraitEffect",
            label: "每层物攻",
            max: 500,
            min: 0,
            scope: "direction",
            suffix: "%",
            type: "number",
          },
        ],
        name: "猫精灵的礼物",
      }}
      hitCount={1}
      manualPower={80}
      onHitCountChange={vi.fn()}
      onManualPowerChange={vi.fn()}
      onSkillSelect={vi.fn()}
      onTraitContextChange={onTraitContextChange}
      selectedSkill={skills[0]}
      skills={skills}
      traitContext={{}}
    />,
  );

  await user.clear(
    screen.getByRole("spinbutton", { name: "完整选择次数" }),
  );
  await user.type(
    screen.getByRole("spinbutton", { name: "完整选择次数" }),
    "2",
  );
  expect(onTraitContextChange).toHaveBeenLastCalledWith(
    "attackerTraitStacks",
    2,
  );

  await user.clear(
    screen.getByRole("spinbutton", { name: "每层物攻" }),
  );
  await user.type(
    screen.getByRole("spinbutton", { name: "每层物攻" }),
    "50",
  );
  expect(onTraitContextChange).toHaveBeenLastCalledWith(
    "attackerTraitEffect",
    50,
  );
});

test("four-skill rows keep each skill power directly editable", async () => {
  const user = userEvent.setup();
  const onSkillPowerChange = vi.fn();

  render(
    <FourSkillEditor
      attackerName="音速犬"
      attackerResults={[
        { hitCount: 1, skillPower: 80, status: "exact", totalDamage: 100 },
      ]}
      attackerSkills={[skills[0], null, null, null]}
      defenderName="水灵"
      defenderSkills={[skills[1], null, null, null]}
      onSkillPowerChange={onSkillPowerChange}
      onSkillSelect={vi.fn()}
      skills={skills}
    />,
  );

  const power = screen.getByRole("spinbutton", {
    name: "攻击方技能1威力",
  });
  await user.clear(power);
  await user.type(power, "123");
  expect(onSkillPowerChange).toHaveBeenLastCalledWith(
    "attacker",
    0,
    123,
  );
});

test("difference-table skills show the resolved table power before trait multipliers", () => {
  const flashStrike = {
    ...skills[0],
    basePower: 60,
    id: "flash-strike",
    name: "闪击",
    ruleId: "speed_difference",
  };

  render(
    <FourSkillEditor
      attackerName="岚鸟"
      attackerResults={[
        {
          formulaSteps: [
            {
              after: 190,
              before: 111,
              input: { attacker: 254, defender: 143 },
              label: "速度差威力",
              source: "reviewed-rule:speed-defense-difference-v1",
            },
          ],
          hitCount: 1,
          resolvedPower: 190,
          skillPower: 285,
          status: "exact",
          totalDamage: 722,
        },
      ]}
      attackerSkills={[flashStrike, null, null, null]}
      defenderName="炮米花"
      defenderSkills={[skills[1], null, null, null]}
      onSkillSelect={vi.fn()}
      skills={[...skills, flashStrike]}
    />,
  );

  expect(
    screen.getByRole("spinbutton", { name: "攻击方技能1威力" }),
  ).toHaveValue(190);
  expect(
    screen.getByText("速度 254 − 143 = 111 → 威力 190"),
  ).toBeVisible();
});

test("听桥技能行标明反弹来源技能和继承的面板威力", () => {
  const listenBridge = {
    basePower: 0,
    category: "defense",
    cost: 4,
    description:
      "减伤60%，应对攻击：对敌方造成武系物理伤害，威力与被应对技能相等。",
    id: "listen-bridge",
    name: "听桥",
    type: "武",
  };

  render(
    <FourSkillEditor
      attackerName="音速犬"
      attackerResults={[]}
      attackerSkills={[skills[0], null, null, null]}
      defenderName="水灵"
      defenderResults={[
        {
          hitCount: 1,
          hpPercent: 25,
          reflectedPower: 150,
          reflectedSourceSkillName: "风力冲击",
          skillPower: 150,
          status: "exact",
          totalDamage: 100,
        },
      ]}
      defenderSkills={[listenBridge, null, null, null]}
      onSkillSelect={vi.fn()}
      skills={[...skills, listenBridge]}
    />,
  );

  expect(screen.getByText("反弹「风力冲击」· 威力 150")).toBeVisible();
  expect(
    screen.getByRole("spinbutton", { name: "防御方技能1威力" }),
  ).toHaveValue(150);
});

test("four-skill editor exposes four independent slots on both sides", async () => {
  const user = userEvent.setup();
  const onSkillFocus = vi.fn();
  const onSkillHitCountChange = vi.fn();
  const onSkillSelect = vi.fn();

  render(
    <FourSkillEditor
      attackerName="音速犬"
      attackerResults={[
        { effectivePower: 120, hitCount: 2, totalDamage: 345 },
      ]}
      attackerSkills={[skills[0], null, null, null]}
      defenderName="水灵"
      defenderSkills={[skills[1], null, null, null]}
      onSkillFocus={onSkillFocus}
      onSkillHitCountChange={onSkillHitCountChange}
      onSkillSelect={onSkillSelect}
      skills={skills}
    />,
  );

  expect(screen.getAllByRole("combobox")).toHaveLength(8);
  expect(screen.getByText("音速犬")).toBeVisible();
  expect(screen.getByText("水灵")).toBeVisible();
  expect(screen.getByText("345伤害")).toBeVisible();
  expect(
    screen.getByRole("spinbutton", { name: "攻击方技能1连击次数" }),
  ).toHaveValue(2);

  await user.type(
    screen.getByRole("combobox", { name: "攻击方技能2" }),
    "水之",
  );
  await user.click(screen.getByRole("option", { name: /水之波纹/ }));
  expect(onSkillFocus).toHaveBeenCalledWith("attacker", 1);
  expect(onSkillSelect).toHaveBeenCalledWith("attacker", 1, "water-bomb");
  fireEvent.change(
    screen.getByRole("spinbutton", { name: "攻击方技能1连击次数" }),
    { target: { value: "3" } },
  );
  expect(onSkillHitCountChange).toHaveBeenLastCalledWith("attacker", 0, 3);
  fireEvent.focus(
    screen.getByRole("spinbutton", { name: "攻击方技能1连击次数" }),
  );
  expect(onSkillFocus).toHaveBeenCalledWith("attacker", 0);
});

test("four-skill editor previews each side's damage and target HP share", () => {
  render(
    <FourSkillEditor
      attackerName="音速犬"
      attackerResults={[
        {
          hpPercent: 55.3,
          status: "exact",
          totalDamage: 240,
        },
      ]}
      attackerSkills={[skills[0], null, null, null]}
      defenderName="水灵"
      defenderResults={[
        {
          hpPercent: 28.6,
          status: "exact",
          totalDamage: 90,
        },
      ]}
      defenderSkills={[skills[1], null, null, null]}
      onSkillSelect={vi.fn()}
      skills={skills}
    />,
  );

  expect(
    screen.getByLabelText("攻击方风力冲击攻击水灵：240伤害，55.3% HP"),
  ).toHaveTextContent("55.3%240伤害");
  expect(
    screen.getByLabelText("攻击方风力冲击攻击水灵：240伤害，55.3% HP"),
  ).toHaveAttribute("data-tone", "danger");
  expect(
    screen.getByLabelText("防御方水之波纹攻击音速犬：90伤害，28.6% HP"),
  ).toHaveTextContent("28.6%90伤害");
  expect(
    screen.getByLabelText("防御方水之波纹攻击音速犬：90伤害，28.6% HP"),
  ).toHaveAttribute("data-tone", "warning");
  expect(screen.getAllByText("伤害占比")).toHaveLength(2);
});

test("mobile four-skill editor switches between four attack and defense slots", async () => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({
      addEventListener: vi.fn(),
      addListener: vi.fn(),
      dispatchEvent: vi.fn(),
      matches: true,
      media: "(max-width: 620px)",
      onchange: null,
      removeEventListener: vi.fn(),
      removeListener: vi.fn(),
    }),
  );
  const user = userEvent.setup();
  const onSkillFocus = vi.fn();

  render(
    <FourSkillEditor
      attackerName="音速犬"
      attackerSkills={[skills[0], null, null, null]}
      defenderName="水灵"
      defenderSkills={[skills[1], null, null, null]}
      onSkillFocus={onSkillFocus}
      onSkillSelect={vi.fn()}
      skills={skills}
    />,
  );

  expect(screen.getAllByRole("combobox")).toHaveLength(4);
  expect(screen.getByRole("button", { name: "攻击" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(screen.getByRole("combobox", { name: "攻击方技能1" })).toHaveValue(
    "风力冲击",
  );

  await user.click(screen.getByRole("button", { name: "防御" }));
  expect(screen.getAllByRole("combobox")).toHaveLength(4);
  expect(screen.getByRole("combobox", { name: "防御方技能1" })).toHaveValue(
    "水之波纹",
  );
  expect(
    screen.queryByRole("combobox", { name: "攻击方技能1" }),
  ).not.toBeInTheDocument();
  expect(onSkillFocus).toHaveBeenCalledWith("defender", 0);

  vi.unstubAllGlobals();
});

test("dazzling loadouts render seven slots and a two-line Refraction preview", () => {
  const refraction = {
    basePower: 50,
    category: "magical",
    cost: 4,
    description: "造成魔伤，携带其他系别技能会给本技能带来不同效果。",
    id: "refraction",
    name: "折射",
    type: "光",
  };
  const normal = { ...skills[0], id: "normal", name: "追打", type: "普通" };
  const wing = { ...skills[0], id: "wing", name: "回旋风暴", type: "翼" };
  const seven = [refraction, normal, wing, null, null, null, null];

  render(
    <FourSkillEditor
      attackerName="彩虹独角兽"
      attackerSkills={seven}
      defenderName="水灵"
      defenderSkills={[skills[1], null, null, null]}
      onSkillSelect={vi.fn()}
      skills={[...skills, refraction, normal, wing]}
    />,
  );

  expect(screen.getByRole("combobox", { name: "攻击方技能7" })).toBeVisible();
  expect(screen.getByTitle(/^本次可得：/))
    .toHaveTextContent("普·威力+10 翼·连击+1");
});

test("compact dazzling loadouts keep seven rows and the Refraction preview", () => {
  const refraction = {
    basePower: 50,
    category: "magical",
    cost: 4,
    description: "造成魔伤，携带其他系别技能会给本技能带来不同效果。",
    id: "refraction",
    name: "折射",
    type: "光",
  };
  const normal = { ...skills[0], id: "normal", name: "追打", type: "普通" };
  const seven = [refraction, normal, null, null, null, null, null];

  render(
    <CompactFourSkillEditor
      attackerName="彩虹独角兽"
      attackerResults={[]}
      attackerSkillChoices={[...skills, refraction, normal]}
      attackerSkills={seven}
      defenderName="水灵"
      defenderResults={[]}
      defenderSkillChoices={skills}
      defenderSkills={[skills[1], null, null, null]}
      onSkillFocus={vi.fn()}
      onSkillSelect={vi.fn()}
    />,
  );

  expect(screen.getByRole("combobox", { name: "攻击方技能7" })).toBeVisible();
  expect(screen.getByTitle("本次可得：普·威力+10"))
    .toHaveClass("compact-skill__effect-hint");
});

test("four-skill slots expose their own dynamic rule context", async () => {
  const user = userEvent.setup();
  const onSkillContextChange = vi.fn();
  const manaBurst = {
    ...skills[1],
    basePower: null,
    id: "mana-burst",
    name: "魔能爆",
    ruleId: "mana_burst",
    slotContext: {},
  };

  render(
    <FourSkillEditor
      attackerName="音速犬"
      attackerSkills={[manaBurst, null, null, null]}
      defenderName="水灵"
      defenderSkills={[skills[1], null, null, null]}
      onSkillContextChange={onSkillContextChange}
      onSkillSelect={vi.fn()}
      skills={[...skills, manaBurst]}
    />,
  );

  expect(
    screen.getByRole("spinbutton", { name: "攻击方技能1当前能量" }),
  ).toHaveValue(0);
  await user.type(
    screen.getByRole("spinbutton", { name: "攻击方技能1当前能量" }),
    "5",
  );
  expect(onSkillContextChange).toHaveBeenLastCalledWith(
    "attacker",
    0,
    expect.stringMatching(/^skill\.energy\.[a-f0-9]{8}$/),
    5,
  );
  fireEvent.change(
    screen.getByRole("spinbutton", { name: "攻击方技能1当前能量" }),
    { target: { value: "99" } },
  );
  expect(onSkillContextChange).toHaveBeenLastCalledWith(
    "attacker",
    0,
    expect.stringMatching(/^skill\.energy\.[a-f0-9]{8}$/),
    10,
  );
});

test("Sweet Trap accepts current energy above ten and caps it at ninety-nine", () => {
  const onSkillContextChange = vi.fn();
  const sweetTrap = {
    basePower: 50,
    category: "magical",
    cost: 4,
    description: "造成魔伤，自己每有1能量，本次技能威力+10。",
    id: "sweet-trap",
    name: "甜蜜陷阱",
    slotContext: { energy: 10 },
    type: "草",
  };

  render(
    <FourSkillEditor
      attackerName="音速犬"
      attackerSkills={[sweetTrap, null, null, null]}
      defenderName="水灵"
      defenderSkills={[skills[1], null, null, null]}
      onSkillContextChange={onSkillContextChange}
      onSkillSelect={vi.fn()}
      skills={[...skills, sweetTrap]}
    />,
  );

  const energy = screen.getByRole("spinbutton", {
    name: "攻击方技能1当前能量",
  });
  expect(energy).toHaveAttribute("max", "99");

  fireEvent.change(energy, { target: { value: "11" } });
  expect(onSkillContextChange).toHaveBeenLastCalledWith(
    "attacker",
    0,
    expect.stringMatching(/^skill\.energy\.[a-f0-9]{8}$/),
    11,
  );

  fireEvent.change(energy, { target: { value: "100" } });
  expect(onSkillContextChange).toHaveBeenLastCalledWith(
    "attacker",
    0,
    expect.stringMatching(/^skill\.energy\.[a-f0-9]{8}$/),
    99,
  );
});

test("four-skill slots keep each selected skill effect visible", () => {
  const headOnBlow = {
    ...skills[0],
    description: "造成物伤，若敌方本回合更换精灵，本次技能威力+100。",
    id: "head-on-blow",
    name: "当头棒喝",
  };

  render(
    <FourSkillEditor
      attackerName="音速犬"
      attackerSkills={[headOnBlow, null, null, null]}
      defenderName="水灵"
      defenderSkills={[skills[1], null, null, null]}
      onSkillSelect={vi.fn()}
      skills={[...skills, headOnBlow]}
    />,
  );

  expect(screen.getByText(headOnBlow.description)).toBeVisible();
});

test("four-skill sides use their own learnability labels", async () => {
  const user = userEvent.setup();

  render(
    <FourSkillEditor
      attackerName="音速犬"
      attackerSkillChoices={[
        { ...skills[0], learnable: true },
        { ...skills[1], learnable: false },
      ]}
      attackerSkills={[skills[0], null, null, null]}
      defenderName="水灵"
      defenderSkillChoices={[
        { ...skills[0], learnable: false },
        { ...skills[1], learnable: true },
      ]}
      defenderSkills={[skills[1], null, null, null]}
      onSkillSelect={vi.fn()}
      skills={skills}
    />,
  );

  const attackerPicker = screen.getByRole("combobox", {
    name: "攻击方技能1",
  });
  await user.clear(attackerPicker);
  await user.type(attackerPicker, "水之");
  expect(
    within(screen.getByRole("option", { name: /水之波纹/ })).getByText(
      "不可学习",
    ),
  ).toBeVisible();

  await user.keyboard("{Escape}");
  const defenderPicker = screen.getByRole("combobox", {
    name: "防御方技能1",
  });
  await user.clear(defenderPicker);
  await user.type(defenderPicker, "水之");
  expect(
    within(screen.getByRole("option", { name: /水之波纹/ })).getByText(
      "可学习",
    ),
  ).toBeVisible();
});

test("advanced settings stay collapsed until requested", async () => {
  const user = userEvent.setup();
  const onMarkChange = vi.fn();
  const onRainTurnsChange = vi.fn();

  render(
    <AdvancedOptions
      finalMultiplier={1}
      onFinalMultiplierChange={vi.fn()}
      onRainTurnsChange={onRainTurnsChange}
      onReductionChange={vi.fn()}
      onMarkChange={onMarkChange}
      rainTurns={0}
      reductionPercent={0}
      result={{
        additionalDamage: 0,
        effectivePower: 38,
        formulaSteps: [
          {
            after: 37.5,
            before: 30,
            input: 1.25,
            label: "本系",
          },
          {
            after: 65.625,
            before: 37.5,
            input: {
              multiplier: 1.75,
              remainingTurns: 8,
              weather: "雨天",
            },
            label: "天气",
          },
          {
            after: 38,
            before: 37.5,
            input: { method: "round" },
            label: "显示威力",
          },
          {
            after: 47,
            before: 8264.63,
            input: {
              attackerStat: 246,
              calculationPower: 37.5,
              coefficient: 37 / 41,
              defenderDefense: 175,
              displayedPower: 38,
              roundedNumerator: 8265,
              unroundedNumerator: 8264.63,
              unroundedOneHit: 47.228,
            },
            label: "等级系数与攻防比",
          },
          {
            after: 141,
            before: 47,
            input: {
              damageReductionMultiplier: 1,
              finalDamageMultiplier: 1,
              hitCount: 3,
              oneHitAfterFinal: 47,
            },
            label: "减伤、连击与最终倍率",
          },
        ],
        hitCount: 3,
        mainDamage: 141,
        skillName: "光之矛",
        status: "exact",
        totalDamage: 141,
      }}
      marks={{
        attacker: {
          negative: { id: null, stacks: 0 },
          positive: { id: "tailwind", stacks: 2 },
        },
        defender: {
          negative: { id: "starfall", stacks: 3 },
          positive: { id: null, stacks: 0 },
        },
      }}
    />,
  );

  expect(
    screen.queryByRole("spinbutton", { name: "防御方当前生命" }),
  ).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "高级选项" }));
  expect(
    screen.queryByRole("spinbutton", { name: "防御方当前生命" }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("spinbutton", { name: "最终伤害倍率" })).toHaveValue(1);
  expect(screen.getByText("伤害计算过程")).toBeVisible();
  expect(screen.getByText("技能威力")).toBeVisible();
  expect(screen.getByText("显示威力")).toBeVisible();
  expect(screen.getByText("每段伤害")).toBeVisible();
  expect(screen.getByText("总伤害")).toBeVisible();
  expect(screen.getAllByText("四舍五入")).toHaveLength(2);
  expect(screen.getByText("向下取整")).toBeVisible();
  expect(screen.getByText("8265")).toBeVisible();
  expect(screen.getAllByText("47")).toHaveLength(2);
  expect(screen.getByText("141")).toBeVisible();
  expect(screen.queryByText(/先算技能威力/)).not.toBeInTheDocument();
  expect(screen.queryByText(/读取攻击数值/)).not.toBeInTheDocument();
  expect(screen.queryByText(/round\(/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/floor\(/i)).not.toBeInTheDocument();
  expect(screen.queryByText("×1")).not.toBeInTheDocument();
  expect(document.querySelectorAll(".formula-audit__row")).toHaveLength(4);
  const rain = screen.getByRole("checkbox", {
    name: "雨天",
  });
  expect(rain).not.toBeChecked();
  expect(
    screen.queryByRole("spinbutton", { name: "雨天剩余回合" }),
  ).not.toBeInTheDocument();
  expect(screen.queryByText(/雨天剩余.*回合/)).not.toBeInTheDocument();
  await user.click(rain);
  expect(onRainTurnsChange).toHaveBeenLastCalledWith(8);
  const attackerMarks = screen.getByRole("group", { name: "进攻方印记" });
  const defenderMarks = screen.getByRole("group", { name: "防御方印记" });
  expect(
    within(attackerMarks).getByRole("combobox", { name: "进攻方正面印记" }),
  ).toHaveValue("tailwind");
  expect(
    within(defenderMarks).getByRole("combobox", { name: "防御方负面印记" }),
  ).toHaveValue("starfall");
  const starfall = within(defenderMarks).getByRole("spinbutton", {
    name: "防御方星陨层数",
  });
  fireEvent.change(starfall, { target: { value: "4" } });
  expect(onMarkChange).toHaveBeenLastCalledWith(
    "defender",
    "negative",
    { id: "starfall", stacks: 4 },
  );
});

test("formula audit places defense-skill reduction after defense division", async () => {
  const user = userEvent.setup();

  render(
    <AdvancedOptions
      finalMultiplier={1}
      onFinalMultiplierChange={vi.fn()}
      onMarkChange={vi.fn()}
      onRainTurnsChange={vi.fn()}
      onReductionChange={vi.fn()}
      rainTurns={0}
      reductionPercent={50}
      result={{
        additionalDamage: 0,
        effectivePower: 110,
        formulaSteps: [
          {
            after: 18,
            before: 7941.463414634146,
            input: {
              attackerStat: 80,
              calculationPower: 110,
              coefficient: 37 / 41,
              damageReductionMultiplier: 0.5,
              defenderDefense: 209,
              displayedPower: 110,
              roundedNumerator: 7941,
              unroundedNumerator: 7941.463414634146,
              unroundedOneHit: 18.997607655502392,
            },
            label: "等级系数与攻防比",
          },
          {
            after: 18,
            before: 18,
            input: {
              damageReductionMultiplier: 0.5,
              finalDamageMultiplier: 1,
              hitCount: 1,
              oneHitAfterFinal: 18,
            },
            label: "减伤、连击与最终倍率",
          },
        ],
        hitCount: 1,
        mainDamage: 18,
        skillName: "测试技能",
        status: "exact",
        totalDamage: 18,
      }}
    />,
  );

  await user.click(screen.getByRole("button", { name: "高级选项" }));
  const row = screen.getByText("每段伤害").closest(".formula-audit__row");

  expect(row.textContent).toMatch(
    /伤害分子7941÷物防209×伤害保留0\.5→向下取整/,
  );
});
