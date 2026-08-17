import { describe, expect, test } from "vitest";
import { resolvePowerOverride } from "../../src/domain/power-override.js";

describe("resolvePowerOverride", () => {
  test("prefers a valid current override over every legacy field", () => {
    expect(resolvePowerOverride({
      current: { mode: "actual", value: 87.5 },
      legacyBasePower: 120,
      legacyDisplayedPower: 300,
      legacyPowerMode: "displayed",
    })).toEqual({
      mode: "actual",
      source: "manual-actual",
      value: 87.5,
    });
  });

  test("maps an old displayed override to panel power", () => {
    expect(resolvePowerOverride({
      legacyDisplayedPower: 281,
      legacyPowerMode: "displayed",
    })).toEqual({
      mode: "panel",
      source: "legacy-displayed",
      value: 281,
    });
  });

  test("keeps an old base override on the legacy calculation path", () => {
    expect(resolvePowerOverride({ legacyBasePower: 123 })).toEqual({
      mode: "legacy-base",
      source: "legacy-base",
      value: 123,
    });
  });

  test("rejects fractional panel power and out-of-range values", () => {
    expect(resolvePowerOverride({
      current: { mode: "panel", value: 87.5 },
    }).mode).toBe("automatic");
    expect(resolvePowerOverride({
      current: { mode: "actual", value: 10000 },
    }).mode).toBe("automatic");
  });
});
