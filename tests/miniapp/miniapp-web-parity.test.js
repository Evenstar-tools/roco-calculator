import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

function readJson(relativePath) {
  return JSON.parse(
    fs.readFileSync(path.join(repositoryRoot, relativePath), "utf8"),
  );
}

describe("desktop core and miniapp parity", () => {
  test.each([
    "src/domain/negative-status.js",
    "src/domain/negative-status-rules.js",
    "miniapp/src/shared/domain/negative-status.js",
    "miniapp/src/shared/domain/negative-status-rules.js",
  ])("includes %s", (relativePath) => {
    expect(fs.existsSync(path.join(repositoryRoot, relativePath))).toBe(true);
  });

  test("defaults important new features to off", async () => {
    const { createInitialState } = await import("../../src/state/defaults.js");
    const state = createInitialState({ meta: {}, skills: [], spirits: [] });

    expect(state.calculationOptions.includeNegativeStatusSettlement).toBe(false);
  });

  test("desktop and miniapp defaults skip preview placeholders", async () => {
    const desktop = await import("../../src/state/defaults.js");
    const miniapp = await import(
      "../../miniapp/src/shared/state/defaults.js"
    );
    const raceStats = {
      hp: 100,
      speed: 100,
      physicalAttack: 100,
      magicalAttack: 100,
      physicalDefense: 100,
      magicalDefense: 100,
    };
    const snapshot = {
      meta: {},
      skills: [],
      spirits: [
        {
          calculationStatus: "pending-race-stats",
          id: "preview",
          raceStats: null,
        },
        { id: "first", raceStats },
        { id: "second", raceStats },
      ],
    };

    for (const createInitialState of [
      desktop.createInitialState,
      miniapp.createInitialState,
    ]) {
      expect(createInitialState(snapshot).sides).toMatchObject({
        attacker: { spiritId: "first" },
        defender: { spiritId: "second" },
      });
    }
  });

  test.each([
    ["吨位压制", 100, { targetWeightTier: "<4" }, 160],
    ["以重制重", 120, { targetWeightTier: "120+" }, 160],
    ["砂糖弹球", 80, { weightDifferenceTier: "101+" }, 120],
    ["啃咬", 40, { donationPowerCount: 3 }, 100],
    ["飞断", 20, { teamDonationCount: 3 }, 80],
  ])("keeps v1.6.3 skill rule %s in the miniapp core", async (
    name,
    basePower,
    context,
    value,
  ) => {
    const desktop = await import("../../src/domain/skill-rules.js");
    const miniapp = await import(
      "../../miniapp/src/shared/domain/skill-rules.js"
    );
    const skill = { basePower, description: "", name };

    expect(miniapp.resolveSkillPower(skill, context))
      .toEqual(desktop.resolveSkillPower(skill, context));
    expect(miniapp.resolveSkillPower(skill, context))
      .toMatchObject({ status: "exact", value });
  });

  test("keeps the v1.6.3 iron-caltrop final damage multiplier", async () => {
    const desktop = await import("../../src/domain/skill-rules.js");
    const miniapp = await import(
      "../../miniapp/src/shared/domain/skill-rules.js"
    );
    const skill = { basePower: 85, description: "", name: "铁蒺藜" };
    const context = { counterTriggered: true };

    expect(miniapp.resolveSkillPower(skill, context))
      .toEqual(desktop.resolveSkillPower(skill, context));
    expect(miniapp.resolveSkillPower(skill, context)).toMatchObject({
      finalDamageMultiplier: 2,
      value: 85,
    });
  });

  test("keeps the season burst costs in desktop and miniapp parity", async () => {
    const desktop = await import("../../src/domain/skill-rules.js");
    const miniapp = await import(
      "../../miniapp/src/shared/domain/skill-rules.js"
    );
    const superconduct = {
      basePower: 90,
      category: "magical",
      cost: 3,
      description: "造成魔伤，迸发：本次能耗-2。",
      name: "超导",
      type: "电",
    };
    const thunderstorm = {
      basePower: 55,
      category: "magical",
      cost: 1,
      description: "造成魔伤，迸发：每有1种来源，威力+10、能耗+1。",
      name: "雷暴",
      type: "电",
    };
    const thunderstormContext = {
      burstSourceDoublePulse: true,
      burstSourceSuperconduct: true,
    };

    expect(miniapp.resolveSkillPower(superconduct, {}))
      .toEqual(desktop.resolveSkillPower(superconduct, {}));
    expect(miniapp.resolveSkillPower(superconduct, {})).toMatchObject({
      resolvedCost: 1,
      value: 90,
    });
    expect(miniapp.resolveSkillPower(thunderstorm, thunderstormContext))
      .toEqual(desktop.resolveSkillPower(thunderstorm, thunderstormContext));
    expect(
      miniapp.resolveSkillPower(thunderstorm, thunderstormContext),
    ).toMatchObject({
      activeBurstKinds: 2,
      inheritedCostReduction: 2,
      resolvedCost: 1,
      value: 75,
    });
  });

  test("keeps all 14 corrected contract balls including combat ball", async () => {
    const desktop = await import("../../src/domain/contract-shape.js");
    const miniapp = await import(
      "../../miniapp/src/shared/domain/contract-shape.js"
    );

    expect(miniapp.CONTRACT_BALLS).toEqual(desktop.CONTRACT_BALLS);
    expect(miniapp.CONTRACT_BALLS).toHaveLength(14);
    expect(miniapp.CONTRACT_BALLS).toEqual(expect.arrayContaining([
      expect.objectContaining({ value: "combat" }),
    ]));
  });

  test("bundles the v1.6.3 213-entry PVP configuration library", () => {
    const library = readJson("miniapp/src/data/common-spirit-config.json");

    expect(library.entryCount).toBe(213);
    expect(library.entries).toHaveLength(213);
  });

  test("shares the desktop team defensive analysis domain with miniapp", async () => {
    const desktop = await import("../../src/domain/team-type-analysis.js");
    const miniapp = await import(
      "../../miniapp/src/shared/domain/team-type-analysis.js"
    );
    const input = {
      members: [{ spiritId: "grass" }],
      spirits: [{ id: "grass", name: "草系成员", types: ["草"] }],
    };

    expect(miniapp.analyzeTeamDefensiveTypes(input))
      .toEqual(desktop.analyzeTeamDefensiveTypes(input));
  });
});
