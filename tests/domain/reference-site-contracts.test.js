import { describe, expect, test } from "vitest";

import snapshot from "../../data/snapshots/current.json";
import {
  calculateDamage,
  floorEffectiveSkillPower,
  roundDisplayedPower,
} from "../../src/domain/damage.js";
import {
  getDefaultHitCount,
  getSkillEffectRule,
} from "../../src/domain/skill-effects.js";
import { getSkillStatusEffectInputs } from
  "../../src/domain/skill-status-effects.js";
import referenceAdapters from
  "../fixtures/reference-site-skill-adapters-2026-08-26.json";
import referenceRounding from
  "../fixtures/reference-site-rounding-2026-09-01.json";

function damageNames() {
  return Object.values(referenceAdapters.damageSignatures).flat();
}

describe("reference-site skill adapter snapshot", () => {
  test("classifies every captured damage adapter against the shared core", () => {
    const names = damageNames();
    const skillByName = new Map(snapshot.skills.map((skill) => [skill.name, skill]));
    const specialCore = new Set(referenceAdapters.coverage.specialCore);

    expect(names).toHaveLength(referenceAdapters.meta.damageRuleCount);
    expect(new Set(names).size).toBe(names.length);
    expect(referenceAdapters.coverage.unsupported).toEqual([]);

    for (const name of names) {
      const skill = skillByName.get(name);
      expect(skill, `${name} 必须存在于本地技能快照`).toBeTruthy();
      if (!specialCore.has(name)) {
        expect(getSkillEffectRule(skill), `${name} 必须有共享威力规则`).toBeTruthy();
      }
    }

    expect(getSkillStatusEffectInputs(skillByName.get("减压阀"))).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ contextKey: "pressureValveUseCount" }),
      ]),
    );
  });

  test("keeps all captured hit-count defaults aligned", () => {
    const skillByName = new Map(snapshot.skills.map((skill) => [skill.name, skill]));
    const entries = referenceAdapters.hitCountSignatures;

    expect(entries).toHaveLength(referenceAdapters.meta.hitCountRuleCount);
    expect(new Set(entries.map(({ name }) => name)).size).toBe(entries.length);
    for (const { baseHitCount, defaultHitCount, mode, name } of entries) {
      expect(skillByName.get(name), `${name} 必须存在于本地技能快照`).toBeTruthy();
      expect(getDefaultHitCount(skillByName.get(name)), name).toBe(
        referenceAdapters.officialOverrides[name]?.defaultHitCount ??
          (mode === "bonus-layer" ? baseHitCount : defaultHitCount),
      );
    }
  });

  test("records official values that must outrank stale reference-site values", () => {
    const skillByName = new Map(snapshot.skills.map((skill) => [skill.name, skill]));

    expect(referenceAdapters.officialOverrides).toEqual({
      孢子: { pvpParasitismStacks: 3 },
      孢子爆散: { defaultHitCount: 2, referenceDefaultHitCount: 1 },
      撒娇: { allSkillsPowerPerUse: 10, referencePowerPerUse: 20 },
      示弱: { cost: 2, speedFlat: 130 },
      触底强击: { powerAdd: 120, referencePowerAdd: 110 },
    });
    expect(skillByName.get("孢子").description).toContain("3层寄生");
    expect(skillByName.get("示弱")).toMatchObject({ cost: 2 });
    expect(skillByName.get("示弱").description).toContain("+130");
    expect(skillByName.get("触底强击").description).toContain("+120");
    expect(skillByName.get("撒娇").description).toContain("+10");
  });
});

describe("reference-site rounding comparison", () => {
  test("reproduces the public Roco Showdown 356 power / 332 damage example", () => {
    const example = referenceRounding.publishedExample;
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

  test("records the game-verified half-point override", () => {
    const boundary = referenceRounding.verifiedGameBoundary;
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
