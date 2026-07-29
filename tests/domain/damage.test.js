import { describe, expect, test } from "vitest";
import { calculateDamage } from "../../src/domain/damage.js";

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
  test("reproduces the 332 golden damage", () => {
    expect(calculateDamage(goldenInput()).total).toBe(332);
  });

  test("keeps the core arithmetic unrounded until the final floor", () => {
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

  test("applies hit count before the final floor", () => {
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
    expect(result.total).toBe(1);
  });

  test("floors the final multiplier after multiplying hit count", () => {
    const result = calculateDamage(
      goldenInput({ hitCount: 3, finalDamageMultiplier: 1.1 }),
    );

    expect(result.multiHit).toBeCloseTo(997.92, 2);
    expect(result.total).toBe(1097);
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
