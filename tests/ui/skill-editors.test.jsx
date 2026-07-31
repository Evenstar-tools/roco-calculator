import {
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { AdvancedOptions } from "../../src/components/AdvancedOptions.jsx";
import { CompactFourSkillEditor } from "../../src/components/CompactSkillEditor.jsx";
import { FourSkillEditor } from "../../src/components/FourSkillEditor.jsx";
import { SkillPicker } from "../../src/components/SkillPicker.jsx";
import {
  describeResolution,
  SingleSkillEditor,
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

test("skill picker keeps the complete skill library reachable", async () => {
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

  expect(screen.getAllByRole("option")).toHaveLength(completeLibrary.length);
  expect(screen.getByRole("option", { name: /技能553/ })).toBeVisible();
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
  expect(onTraitContextChange).toHaveBeenLastCalledWith("energy", 4);
  fireEvent.change(screen.getByRole("spinbutton", { name: "当前能量" }), {
    target: { value: "99" },
  });
  expect(onTraitContextChange).toHaveBeenLastCalledWith("energy", 10);
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
    "enemyUsedStatusSkill",
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
    "enemySwitchedThisTurn",
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
    "friendshipMode",
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
  expect(
    screen.queryByRole("spinbutton", { name: "此前使用次数" }),
  ).not.toBeInTheDocument();
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
    "flightMode",
    "hits",
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
    "enemyIsMixedBloodline",
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
    "energy",
    5,
  );
  fireEvent.change(
    screen.getByRole("spinbutton", { name: "攻击方技能1当前能量" }),
    { target: { value: "99" } },
  );
  expect(onSkillContextChange).toHaveBeenLastCalledWith(
    "attacker",
    0,
    "energy",
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
    "energy",
    11,
  );

  fireEvent.change(energy, { target: { value: "100" } });
  expect(onSkillContextChange).toHaveBeenLastCalledWith(
    "attacker",
    0,
    "energy",
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
