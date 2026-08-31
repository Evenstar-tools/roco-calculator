import { describe, expect, test } from "vitest";
import reference from "../fixtures/reference-site-rounding-2026-09-01.json";
import {
  calculateDamage,
  floorEffectiveSkillPower,
  roundDisplayedPower,
} from "../../src/domain/damage.js";

describe("reference-site rounding comparison", () => {
  test("reproduces the public Roco Showdown 356 power / 332 damage example", () => {
    const example = reference.publishedExample;
    const displayedPower = roundDisplayedPower(
      example.rawEffectivePower *
        example.displayPowerExpression.stabMultiplier *
        example.displayPowerExpression.typeMultiplier,
    );
    const damage = calculateDamage({
      ...example.damageInput,
      displayedPower,
    });

    expect(displayedPower).toBe(example.expectedDisplayedPower);
    expect(damage.total).toBe(example.expectedDamage);
  });

  test("records the game-verified half-point override without changing later boundaries", () => {
    const boundary = reference.verifiedGameBoundary;
    const rawEffectivePower =
      boundary.basePower * (1 + boundary.percentageBonus);
    const effectivePower = floorEffectiveSkillPower(rawEffectivePower);
    const damage = calculateDamage({
      attackerStat: boundary.attackerStat,
      displayedPower: effectivePower,
      defenderDefense: boundary.defenderDefense,
      level: 60,
    });

    expect(rawEffectivePower).toBe(boundary.rawEffectivePower);
    expect(effectivePower).toBe(boundary.expectedEffectivePower);
    expect(damage.numerator).toBe(boundary.expectedDamageNumerator);
    expect(damage.total).toBe(boundary.expectedDamage);
  });
});
