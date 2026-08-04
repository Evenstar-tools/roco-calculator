import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import {
  buildChoiceSkillSequence,
  getChoiceTraitInput,
  hasPersistentSkillProgression,
  isChoiceSkill,
  supportsChoiceTrait,
} from "../../src/domain/choice-skill-sequence.js";
import { getSkillEffectInputs } from "../../src/domain/skill-effects.js";

const friendship = {
  basePower: 70,
  category: "magical",
  description:
    "造成魔伤，选择：每次使用后威力永久+20或应对状态时本次技能威力+100%。",
  name: "友谊满溢",
};

describe("选择技能特性执行计划", () => {
  test("only treats formal choice branches as choice skills", () => {
    expect(isChoiceSkill(friendship)).toBe(true);
    expect(
      isChoiceSkill({
        description: "自己每使用过1次选择技能，获得永久增益。",
        name: "做好事",
      }),
    ).toBe(false);
    expect(isChoiceSkill({ description: "造成魔伤。", name: "乱打" })).toBe(
      false,
    );
  });

  test.each(["加灵", "加益", "加尔"])(
    "%s uses the other choice through 有求必应",
    () => {
      const sequence = buildChoiceSkillSequence({
        context: {
          choiceTraitTriggered: true,
          counterTriggered: true,
          friendshipMode: "counter",
          skillUseCount: 0,
        },
        skill: friendship,
        traitName: "有求必应",
      });

      expect(sequence.executions).toHaveLength(2);
      expect(sequence.executions[0].context).toMatchObject({
        counterTriggered: true,
        friendshipMode: "counter",
        skillUseCount: 0,
      });
      expect(sequence.executions[1].context).toMatchObject({
        counterTriggered: false,
        friendshipMode: "growth",
        skillUseCount: 0,
      });
    },
  );

  test("一意孤行 repeats the selected choice and disables response on pass two", () => {
    const sequence = buildChoiceSkillSequence({
      context: {
        choiceTraitTriggered: true,
        counterTriggered: true,
        friendshipMode: "counter",
      },
      skill: friendship,
      traitName: "一意孤行",
    });

    expect(sequence.executions.map((item) => item.context.friendshipMode)).toEqual([
      "counter",
      "counter",
    ]);
    expect(sequence.executions[1].context.counterTriggered).toBe(false);
  });

  test("disables the stable response control id on the second pass", () => {
    const counter = getSkillEffectInputs(friendship).find(
      (input) => input.contextKey === "counterTriggered",
    );
    const sequence = buildChoiceSkillSequence({
      context: {
        choiceTraitTriggered: true,
        friendshipMode: "counter",
        [counter.id]: true,
      },
      skill: friendship,
      traitName: "一意孤行",
    });

    expect(sequence.executions[0].responseTriggered).toBe(true);
    expect(sequence.executions[1].responseTriggered).toBe(false);
    expect(sequence.executions[1].context[counter.id]).toBe(false);
  });

  test("growth from the first pass is visible to the second pass", () => {
    const sequence = buildChoiceSkillSequence({
      context: {
        choiceTraitTriggered: true,
        friendshipMode: "growth",
        skillUseCount: 3,
      },
      skill: friendship,
      traitName: "一意孤行",
    });

    expect(sequence.executions[0].context.skillUseCount).toBe(3);
    expect(sequence.executions[1].context.skillUseCount).toBe(4);
    expect(sequence.nextContext.skillUseCount).toBe(5);
  });

  test("does not repeat when the explicit trait trigger is off", () => {
    const sequence = buildChoiceSkillSequence({
      context: { friendshipMode: "growth", skillUseCount: 2 },
      skill: friendship,
      traitName: "有求必应",
    });

    expect(sequence.executions).toHaveLength(1);
    expect(sequence.nextContext.skillUseCount).toBe(3);
  });

  test("click activation advances 撒娇萌化次数 exactly once", () => {
    const skill = {
      basePower: 30,
      category: "magical",
      description: "造成魔伤，3连击。自己获得萌化，威力永久+20。",
      name: "撒娇",
    };

    expect(hasPersistentSkillProgression(skill)).toBe(true);
    const sequence = buildChoiceSkillSequence({
      context: { moeGainCount: 2 },
      skill,
      traitName: null,
    });

    expect(sequence.executions).toHaveLength(1);
    expect(sequence.nextContext.moeGainCount).toBe(3);
  });

  test("passes the current sprout stacks into one-shot attack resolution without persisting it", () => {
    const sequence = buildChoiceSkillSequence({
      context: { attackerMoeActive: true },
      skill: {
        basePower: 60,
        category: "physical",
        description: "造成物伤，自己获得萌化：本次技能威力+60。",
        name: "超级糖果",
      },
      sproutStacks: 2,
      traitName: null,
    });

    expect(sequence.executions[0].context.sproutStacks).toBe(2);
    expect(sequence.nextContext).not.toHaveProperty("sproutStacks");
  });

  test("友谊满溢不获得萌芽加成，撒娇仍按萌芽追加固定威力", () => {
    const friendshipSequence = buildChoiceSkillSequence({
      context: {
        choiceTraitTriggered: true,
        friendshipMode: "growth",
        skillUseCount: 3,
      },
      skill: friendship,
      sproutStacks: 1,
      traitName: "一意孤行",
    });

    expect(friendshipSequence.executions[0].context.skillUseCount).toBe(3);
    expect(friendshipSequence.executions[1].context.skillUseCount).toBe(4);
    expect(friendshipSequence.executions[1].context.sproutFixedPowerBonus).toBeUndefined();
    expect(friendshipSequence.nextContext.skillUseCount).toBe(5);
    expect(friendshipSequence.nextContext.sproutFixedPowerBonus).toBeUndefined();

    const moeSequence = buildChoiceSkillSequence({
      context: { moeGainCount: 2 },
      skill: {
        category: "magical",
        description: "造成魔伤，3连击。自己获得萌化，威力永久+20。",
        name: "撒娇",
      },
      sproutStacks: 2,
      traitName: null,
    });
    expect(moeSequence.nextContext.moeGainCount).toBe(3);
    expect(moeSequence.nextContext.sproutFixedPowerBonus).toBe(20);
  });

  test("exposes one stable trigger control only for supported choice traits", () => {
    expect(supportsChoiceTrait("有求必应")).toBe(true);
    expect(supportsChoiceTrait("一意孤行")).toBe(true);
    expect(supportsChoiceTrait("其他特性")).toBe(false);
    expect(getChoiceTraitInput(friendship)).toMatchObject({
      defaultValue: false,
      key: "choiceTraitTriggered",
      label: "触发特性",
      type: "boolean",
    });
    expect(getChoiceTraitInput({ description: "造成魔伤。" })).toBeNull();
  });

  test("covers every current Jal-family choice skill with the explicit trait trigger", () => {
    const snapshot = JSON.parse(
      readFileSync("public/data/current.json", "utf8"),
    );
    const traitsById = new Map(
      snapshot.traits.map((trait) => [trait.id, trait]),
    );
    const spiritsById = new Map(
      snapshot.spirits.map((spirit) => [spirit.id, spirit]),
    );
    const skillsById = new Map(
      snapshot.skills.map((skill) => [skill.id, skill]),
    );
    const family = new Set(["加灵", "加益", "加尔", "黑化加尔"]);
    const choiceSkills = [];
    const familyTraits = new Map();

    for (const learnset of snapshot.learnsets ?? []) {
      const spirit = spiritsById.get(learnset.spiritId);
      if (!family.has(spirit?.fullName)) continue;
      familyTraits.set(
        spirit.fullName,
        (spirit.traitIds ?? []).map((id) => traitsById.get(id)?.name),
      );
      for (const skillId of learnset.skillIds ?? []) {
        const skill = skillsById.get(skillId);
        if (isChoiceSkill(skill)) choiceSkills.push([spirit.fullName, skill]);
      }
    }

    expect(Object.fromEntries(familyTraits)).toEqual({
      加灵: ["有求必应"],
      加益: ["有求必应"],
      加尔: ["有求必应"],
      黑化加尔: ["一意孤行"],
    });
    expect(choiceSkills.length).toBeGreaterThan(30);
    for (const [spiritName, skill] of choiceSkills) {
      expect(getChoiceTraitInput(skill), `${spiritName} / ${skill.name}`).toMatchObject({
        key: "choiceTraitTriggered",
        label: "触发特性",
      });
    }
  });
});
