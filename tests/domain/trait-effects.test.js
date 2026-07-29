import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
  getTraitEffectRule,
  getTraitEffectInputs,
  TRAIT_EFFECT_RULE_NAMES,
} from "../../src/domain/trait-effects.js";

const snapshotPath = join(process.cwd(), "public", "data", "current.json");
const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8"));

describe("trait effect coverage", () => {
  test("keeps a maintained catalog for reviewed recurring trait shapes", () => {
    expect(TRAIT_EFFECT_RULE_NAMES.length).toBeGreaterThanOrEqual(40);
  });

  test("never exposes a zero-value inferred damage control", () => {
    const zeroValueRules = snapshot.traits.flatMap((trait) =>
      ["attacker", "defender"].flatMap((role) => {
        const rule = getTraitEffectRule(trait, role);
        return rule && Number(rule.effect) <= 0
          ? [{ name: trait.name, role }]
          : [];
      }),
    );

    expect(zeroValueRules).toEqual([]);
  });

  test("keeps every current direct-damage control in a reviewed rule", () => {
    const reviewedNames = new Set(TRAIT_EFFECT_RULE_NAMES);
    const legacyEditableNames = new Set(["偏振", "完全偏振", "绝对秩序"]);
    const unreviewed = snapshot.traits
      .filter((trait) =>
        ["attacker", "defender"].some((role) =>
          getTraitEffectRule(trait, role),
        ),
      )
      .filter(
        (trait) =>
          !reviewedNames.has(trait.name) &&
          !legacyEditableNames.has(trait.name),
      )
      .map((trait) => trait.name);

    expect(unreviewed).toEqual([]);
  });

  test.each([
    "刺肤",
    "化茧",
    "耐活王",
    "仁心",
    "坚韧铠甲",
    "换碟",
    "不死鸟",
  ])("%s does not expose a fake direct-damage control", (name) => {
    const trait = snapshot.traits.find((candidate) => candidate.name === name);
    expect(getTraitEffectInputs(trait, "attacker")).toEqual([]);
    expect(getTraitEffectInputs(trait, "defender")).toEqual([]);
  });

  test.each([
    ["猫精灵的礼物", "完整选择次数", "每层物攻"],
    ["蒸汽膨胀", "己方火系技能次数", "每层威力"],
    ["图书守卫者", "入场时魔力为1", "双攻加成"],
    ["破空", "先于敌方攻击", "触发加成"],
    ["贪得无厌", "每5%过量回复", "每层物攻"],
    ["草木苏醒时", "本次攻击前回复能量", "每点双攻"],
    ["合拍", "累计相同项数", "每项物攻"],
    ["和弦共振", "场上印记种类", "每种魔攻"],
  ])("%s exposes its condition and editable effect", (name, condition, effect) => {
    const trait = snapshot.traits.find((candidate) => candidate.name === name);
    const labels = getTraitEffectInputs(trait, "attacker").map(
      (input) => input.label,
    );

    expect(labels).toContain(condition);
    expect(labels).toContain(effect);
  });

  test.each([
    ["偏振", "减伤比例"],
    ["绝对秩序", "减伤比例"],
  ])("%s exposes only its editable reduction value", (name, effect) => {
    const trait = snapshot.traits.find((candidate) => candidate.name === name);
    const inputs = getTraitEffectInputs(trait, "defender");

    expect(inputs.map((input) => input.label)).toEqual([effect]);
    expect(inputs.every((input) => input.type === "number")).toBe(true);
  });
});
