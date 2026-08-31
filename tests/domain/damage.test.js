import { describe, expect, test } from "vitest";
import {
  calculateDamage,
  DAMAGE_ROUNDING_POLICY,
  floorEffectiveSkillPower,
  floorOneHitDamage,
  normalizeDamageHitCount,
  roundDamageNumerator,
  roundDisplayedPower,
} from "../../src/domain/damage.js";

function goldenInput(overrides = {}) {
  return {
    attackerStat: 234,
    displayedPower: 356,
    defenderDefense: 226,
    damageReductionMultiplier: 1,
    hitCount: 1,
    finalDamageMultiplier: 1,
    level: 60,
    ...overrides,
  };
}

describe("calculateDamage", () => {
  test("exposes one shared rounding policy for every damage boundary", () => {
    expect(DAMAGE_ROUNDING_POLICY).toEqual({
      damageNumerator: "round-half-up",
      displayedPower: "round-half-up",
      effectiveSkillPower: "floor",
      finalOneHitDamage: "floor",
      hitCount: "floor-then-multiply",
      oneHitDamage: "floor",
    });
    expect(floorEffectiveSkillPower(82.5)).toBe(82);
    expect(roundDisplayedPower(356.25)).toBe(356);
    expect(roundDisplayedPower(356.5)).toBe(357);
    expect(roundDamageNumerator(20053.5)).toBe(20054);
    expect(floorOneHitDamage(117.99)).toBe(117);
    expect(normalizeDamageHitCount(3.99)).toBe(3);
  });

  test("reproduces the 332 golden damage", () => {
    expect(calculateDamage(goldenInput()).total).toBe(332);
  });

  test("rounds the damage numerator before dividing by defense and applying reduction", () => {
    expect(
      calculateDamage({
        attackerStat: 1,
        displayedPower: 8,
        defenderDefense: 2,
        damageReductionMultiplier: 0.5,
        hitCount: 1,
        finalDamageMultiplier: 1,
        level: 60,
      }).total,
    ).toBe(1);
  });

  test("applies defense-skill reduction after dividing the rounded numerator by defense", () => {
    const result = calculateDamage({
      attackerStat: 80,
      displayedPower: 110,
      defenderDefense: 209,
      damageReductionMultiplier: 0.5,
      hitCount: 1,
      finalDamageMultiplier: 1,
      level: 60,
    });

    expect(result.numerator).toBe(7941);
    expect(result.total).toBe(18);
  });

  test("floors one hit before multiplying by the hit count", () => {
    const result = calculateDamage({
      attackerStat: 1,
      displayedPower: 1,
      defenderDefense: 2,
      damageReductionMultiplier: 1,
      hitCount: 3,
      finalDamageMultiplier: 1,
      level: 60,
    });

    expect(result.oneHit).toBe(0);
    expect(result.multiHit).toBe(0);
    expect(result.total).toBe(0);
  });

  test("floors one-hit damage after the final multiplier before multiplying hit count", () => {
    const result = calculateDamage(
      goldenInput({ hitCount: 3, finalDamageMultiplier: 1.05 }),
    );

    expect(result.oneHit).toBe(332);
    expect(result.finalOneHit).toBe(348);
    expect(result.multiHit).toBe(996);
    expect(result.total).toBe(1044);
    expect(result.total % 3).toBe(0);
  });

  test("makes an unmodified multi-hit total divisible by its hit count", () => {
    const result = calculateDamage(goldenInput({ hitCount: 5 }));

    expect(result.oneHit).toBe(332);
    expect(result.multiHit).toBe(1660);
    expect(result.total).toBe(1660);
    expect(result.total % 5).toBe(0);
  });

  test("treats null optional multipliers as absent defaults", () => {
    expect(
      calculateDamage(
        goldenInput({
          damageReductionMultiplier: null,
          finalDamageMultiplier: null,
        }),
      ).total,
    ).toBe(332);
  });

  test("returns deterministic arithmetic without random fields", () => {
    const result = calculateDamage(goldenInput());

    expect(result).toEqual(
      expect.objectContaining({
        coefficient: expect.any(Number),
        numerator: expect.any(Number),
        oneHit: expect.any(Number),
        multiHit: expect.any(Number),
        total: expect.any(Number),
      }),
    );
    expect(Object.keys(result)).not.toEqual(
      expect.arrayContaining(["random", "seed", "minimum", "maximum", "range"]),
    );
  });
});
