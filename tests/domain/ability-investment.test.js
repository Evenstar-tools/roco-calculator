import { describe, expect, test } from "vitest";
import {
  BINARY_60_MAX3_RULESET_ID,
  transitionAbilityInvestment,
  validateAbilityInvestment,
} from "../../src/features/team-ability/domain/ability-investment.js";

describe("validateAbilityInvestment", () => {
  test("accepts at most three binary investments and reports remaining slots", () => {
    expect(
      validateAbilityInvestment({
        rulesetId: BINARY_60_MAX3_RULESET_ID,
        values: {
          physicalAttack: 60,
          magicalAttack: 0,
          speed: 60,
          hp: 60,
          physicalDefense: 0,
          magicalDefense: 0,
        },
      }),
    ).toEqual({
      rulesetId: "binary-60-max3-v1",
      valid: true,
      activeStats: ["physicalAttack", "speed", "hp"],
      activeCount: 3,
      remainingSlots: 0,
      maxActiveStats: 3,
      violations: [],
    });
  });

  test("diagnoses a historical intermediate value without normalizing it", () => {
    expect(
      validateAbilityInvestment({
        values: {
          physicalAttack: 0,
          magicalAttack: 0,
          speed: 0,
          hp: 54,
          physicalDefense: 60,
          magicalDefense: 60,
        },
      }),
    ).toEqual({
      rulesetId: BINARY_60_MAX3_RULESET_ID,
      valid: false,
      activeStats: ["hp", "physicalDefense", "magicalDefense"],
      activeCount: 3,
      remainingSlots: 0,
      maxActiveStats: 3,
      violations: [
        {
          code: "UNSUPPORTED_INVESTMENT_VALUE",
          stat: "hp",
          value: 54,
        },
      ],
    });
  });

  test("diagnoses historical over-allocation while preserving all active dimensions", () => {
    const values = Object.fromEntries([
      "physicalAttack",
      "magicalAttack",
      "speed",
      "hp",
      "physicalDefense",
      "magicalDefense",
    ].map((stat) => [stat, 60]));

    expect(validateAbilityInvestment({ values })).toMatchObject({
      valid: false,
      activeCount: 6,
      remainingSlots: 0,
      violations: [
        {
          code: "OVER_INVESTED_DIMENSIONS",
          maxActiveStats: 3,
          activeStats: [
            "physicalAttack",
            "magicalAttack",
            "speed",
            "hp",
            "physicalDefense",
            "magicalDefense",
          ],
        },
      ],
    });
    expect(values).toEqual(Object.fromEntries([
      "physicalAttack",
      "magicalAttack",
      "speed",
      "hp",
      "physicalDefense",
      "magicalDefense",
    ].map((stat) => [stat, 60])));
  });

  test.each([
    ["below zero", -1],
    ["above sixty", 61],
    ["not finite", Number.NaN],
  ])("diagnoses %s as OUT_OF_RANGE", (_label, value) => {
    const result = validateAbilityInvestment({
      values: {
        physicalAttack: value,
        magicalAttack: 0,
        speed: 0,
        hp: 0,
        physicalDefense: 0,
        magicalDefense: 0,
      },
    });

    expect(result.valid).toBe(false);
    expect(result.violations).toContainEqual({
      code: "OUT_OF_RANGE",
      stat: "physicalAttack",
      value,
    });
  });
});

describe("transitionAbilityInvestment", () => {
  test("does not select a fourth dimension", () => {
    const values = {
      physicalAttack: 60,
      magicalAttack: 0,
      speed: 60,
      hp: 60,
      physicalDefense: 0,
      magicalDefense: 0,
    };

    expect(
      transitionAbilityInvestment({
        values,
        stat: "physicalDefense",
        selected: true,
      }),
    ).toMatchObject({
      changed: false,
      reason: "OVER_INVESTED_DIMENSIONS",
      values,
      validation: { valid: true, activeCount: 3 },
    });
    expect(values.physicalDefense).toBe(0);
  });

  test("always allows an active dimension to be removed from an over-allocated legacy value", () => {
    const values = {
      physicalAttack: 60,
      magicalAttack: 60,
      speed: 60,
      hp: 60,
      physicalDefense: 0,
      magicalDefense: 0,
    };

    const result = transitionAbilityInvestment({
      values,
      stat: "speed",
      selected: false,
    });

    expect(result).toMatchObject({
      changed: true,
      reason: null,
      values: { speed: 0 },
      validation: { valid: true, activeCount: 3, remainingSlots: 0 },
    });
    expect(values.speed).toBe(60);
  });
});
