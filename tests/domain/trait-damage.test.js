import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import {
  findDirectTraitDamageRule,
  getDirectTraitDamageRule,
} from "../../src/domain/trait-damage.js";

describe("direct trait damage rules", () => {
  test("recognizes Skin Spikes without treating unrelated traits as damage", () => {
    expect(getDirectTraitDamageRule({ name: "刺肤" })).toMatchObject({
      basePower: 50,
      category: "physical",
      name: "刺肤",
      typeLabel: "无·特性",
    });
    expect(getDirectTraitDamageRule({ name: "专注力" })).toBeNull();
  });

  test("finds the first supported direct-damage trait from inherited traits", () => {
    expect(
      findDirectTraitDamageRule([
        { name: "坚韧" },
        { description: "每受到1次攻击伤害，对攻击自己的精灵造成50威力物理伤害。", name: "刺肤" },
      ]),
    ).toMatchObject({ name: "刺肤", basePower: 50 });
  });

  test("covers every Skin Spikes form in the current season snapshot", () => {
    const snapshot = JSON.parse(
      readFileSync("public/data/current.json", "utf8"),
    );
    const traitsById = new Map(
      snapshot.traits.map((trait) => [trait.id, trait]),
    );
    const supported = snapshot.spirits.filter((spirit) =>
      (spirit.traitIds ?? []).some((traitId) =>
        getDirectTraitDamageRule(traitsById.get(traitId)),
      ),
    );

    expect(supported.map((spirit) => spirit.fullName)).toEqual([
      "石肤蜥",
      "石肤蜥（球球尾巴的样子）",
      "石刺蜥",
      "石刺蜥（球球尾巴的样子）",
      "石冠王蜥",
      "石冠王蜥（球球尾巴的样子）",
    ]);
  });
});
