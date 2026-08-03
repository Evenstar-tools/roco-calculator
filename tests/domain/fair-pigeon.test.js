import { describe, expect, test } from "vitest";
import {
  copyPositiveAbilityStages,
  hasFairPigeonBalance,
} from "../../src/domain/fair-pigeon.js";

describe("公平鸽衡量", () => {
  test("只识别携带衡量特性的公平鸽", () => {
    expect(hasFairPigeonBalance({ fullName: "公平鸽", traitName: "衡量" }))
      .toBe(true);
    expect(hasFairPigeonBalance({ fullName: "公平鸽", traitName: "其他" }))
      .toBe(false);
    expect(hasFairPigeonBalance({ fullName: "其他精灵", traitName: "衡量" }))
      .toBe(false);
  });

  test("复制对方正面攻防等级并保留负面目标等级", () => {
    expect(copyPositiveAbilityStages({ attack: 7, defense: -3 }, {
      attack: 2,
      defense: -4,
    })).toEqual({ attack: 9, defense: -4 });
  });

  test("复制结果仍限制在正负五十层", () => {
    expect(copyPositiveAbilityStages({ attack: 8, defense: 12 }, {
      attack: 47,
      defense: 45,
    })).toEqual({ attack: 50, defense: 50 });
  });
});
