import { describe, expect, test } from "vitest";
import {
  getSkillStatusEffectInputs,
  resolveSkillStatusActivation,
} from "../../src/domain/skill-status-effects.js";

const skill = (name) => ({ name });

describe("skill status effects", () => {
  test.each([
    ["咆哮", { ownAttack: 0, ownDefense: 0, targetAttack: -6, targetDefense: 0 }],
    ["锐利眼神", { ownAttack: 0, ownDefense: 0, targetAttack: 0, targetDefense: -12 }],
    ["加固", { ownAttack: 0, ownDefense: 14, targetAttack: 0, targetDefense: 0 }],
    ["鼓劲", { ownAttack: 0, ownDefense: 17, targetAttack: 0, targetDefense: 0 }],
    ["三连破", { ownAttack: 3, ownDefense: 0, targetAttack: 0, targetDefense: 0 }],
    ["缓一缓", { ownAttack: 1, ownDefense: 1, targetAttack: 0, targetDefense: 0 }],
    ["氧输送", { ownAttack: 7, ownDefense: 0, targetAttack: 0, targetDefense: 0 }],
    ["丰饶", { ownAttack: 14, ownDefense: 0, targetAttack: 0, targetDefense: 0 }],
    ["花炮", { ownAttack: 12, ownDefense: 0, targetAttack: 0, targetDefense: 0 }],
    ["怒火", { ownAttack: 12, ownDefense: -4, targetAttack: 0, targetDefense: 0 }],
    ["润泽", { ownAttack: 19, ownDefense: 0, targetAttack: 0, targetDefense: 0 }],
    ["钧势", { ownAttack: 0, ownDefense: 14, targetAttack: 0, targetDefense: 0 }],
    ["沙石阵", { ownAttack: 0, ownDefense: 9, targetAttack: 0, targetDefense: 0 }],
    ["霜冻", { ownAttack: 0, ownDefense: 0, targetAttack: 0, targetDefense: -10 }],
    ["龙吟", { ownAttack: 15, ownDefense: 0, targetAttack: 0, targetDefense: 0 }],
    ["电离爆破", { ownAttack: 0, ownDefense: 0, targetAttack: -2, targetDefense: 0 }],
    ["破防", { ownAttack: 0, ownDefense: 0, targetAttack: 0, targetDefense: -7 }],
    ["气沉丹田", { ownAttack: 13, ownDefense: 0, targetAttack: 0, targetDefense: 0 }],
    ["耍赖", { ownAttack: 1, ownDefense: 0, targetAttack: 0, targetDefense: 0 }],
    ["嘲弄", { ownAttack: 9, ownDefense: 0, targetAttack: 0, targetDefense: 0 }],
    ["魔镜", { ownAttack: 0, ownDefense: 0, targetAttack: 0, targetDefense: -5 }],
  ])("%s maps single stats to the shared attack or defense stage", (name, expected) => {
    expect(resolveSkillStatusActivation(skill(name))).toMatchObject({
      applied: true,
      deltas: expected,
    });
  });

  test.each([
    ["防反", { ownAttack: 7, ownDefense: 0, targetAttack: 0, targetDefense: 0 }],
    ["纤维化", { ownAttack: 0, ownDefense: 7, targetAttack: 0, targetDefense: 0 }],
    ["刺盾", { ownAttack: 0, ownDefense: 0, targetAttack: -7, targetDefense: 0 }],
    ["不动如山", { ownAttack: 5, ownDefense: 0, targetAttack: 0, targetDefense: 0 }],
    ["虚化", { ownAttack: 0, ownDefense: 7, targetAttack: 0, targetDefense: 0 }],
  ])("%s only applies after a successful defense response", (name, expected) => {
    expect(resolveSkillStatusActivation(skill(name), {})).toMatchObject({
      applied: false,
    });
    expect(
      resolveSkillStatusActivation(skill(name), {
        defenseCounterSucceeded: true,
      }),
    ).toMatchObject({
      applied: true,
      deltas: expected,
    });
  });

  test("status counters expose a checkbox and only add the conditional deltas when checked", () => {
    expect(getSkillStatusEffectInputs(skill("破绽"))).toEqual([
      expect.objectContaining({
        key: "counterDefenseSucceeded",
        type: "boolean",
      }),
    ]);
    expect(resolveSkillStatusActivation(skill("破绽"), {})).toMatchObject({
      deltas: {
        ownAttack: 0,
        targetDefense: -7,
      },
    });
    expect(
      resolveSkillStatusActivation(skill("破绽"), {
        counterDefenseSucceeded: true,
      }),
    ).toMatchObject({
      deltas: {
        ownAttack: 7,
        targetDefense: -7,
      },
    });
    expect(
      resolveSkillStatusActivation(skill("麻痹"), {
        counterDefenseSucceeded: true,
      }),
    ).toMatchObject({
      deltas: {
        targetAttack: -7,
      },
    });
  });
});
