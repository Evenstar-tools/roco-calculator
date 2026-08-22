import { describe, expect, test } from "vitest";
import {
  calculateNegativeStatusSettlement,
  createNegativeStatusState,
  projectNegativeStatusTurns,
} from "../../src/domain/negative-status.js";

describe("negative status settlement", () => {
  test("defaults to five empty status groups for both sides", () => {
    expect(createNegativeStatusState()).toEqual({
      attacker: { burn: 0, electrified: 0, freeze: 0, parasitism: 0, poison: 0 },
      defender: { burn: 0, electrified: 0, freeze: 0, parasitism: 0, poison: 0 },
    });
  });

  test("雷鸣在回合末增加一层引电，达到两层后按电系克制结算并清零", () => {
    const result = calculateNegativeStatusSettlement({
      defender: { currentHp: 1000, maxHp: 1000, types: ["水"] },
      directDamage: 100,
      enabled: true,
      statuses: { electrified: 1 },
      thunderWeather: true,
      typeChart: {
        matrix: [
          [0.5, 2],
          [0.5, 0.5],
        ],
        types: ["电", "水"],
      },
    });

    expect(result.breakdown.find((item) => item.id === "electrified"))
      .toMatchObject({ damage: 500, multiplier: 2, stacks: 2, triggered: true });
    expect(result.nextStacks.electrified).toBe(0);
    expect(result.directDamage).toBe(100);
    expect(result.combinedHpLoss).toBe(600);
  });

  test("电系精灵免疫引电伤害", () => {
    const result = calculateNegativeStatusSettlement({
      defender: { currentHp: 1000, maxHp: 1000, types: ["电"] },
      directDamage: 0,
      enabled: true,
      statuses: { electrified: 2 },
    });

    expect(result.breakdown.find((item) => item.id === "electrified"))
      .toMatchObject({ damage: 0, immune: true, triggered: false });
  });

  test("keeps direct damage separate and floors every status source before summing", () => {
    const result = calculateNegativeStatusSettlement({
      applications: { burn: 1, parasitism: 1, poison: 1 },
      defender: {
        currentHp: 900,
        maxHp: 1000,
        types: ["普通"],
      },
      directDamage: 101,
      enabled: true,
      statuses: { burn: 2, freeze: 0, parasitism: 2, poison: 2 },
    });

    expect(result).toMatchObject({
      directDamage: 101,
      statusDamage: 210,
      combinedHpLoss: 311,
      remainingHp: 589,
      lethal: false,
    });
    expect(result.breakdown.map(({ id, damage }) => [id, damage])).toEqual([
      ["burn", 60],
      ["poison", 90],
      ["parasitism", 60],
    ]);
  });

  test("applies type multipliers and immunity rules", () => {
    const fire = calculateNegativeStatusSettlement({
      applications: {},
      defender: { currentHp: 1000, maxHp: 1000, types: ["火"] },
      directDamage: 0,
      enabled: true,
      statuses: { burn: 10, freeze: 10, parasitism: 10, poison: 10 },
    });
    expect(fire.breakdown.find((item) => item.id === "burn")).toMatchObject({
      damage: 0,
      immune: true,
    });

    const mechanicalPoison = calculateNegativeStatusSettlement({
      applications: {},
      defender: { currentHp: 1000, maxHp: 1000, types: ["机械"] },
      directDamage: 0,
      enabled: true,
      statuses: { burn: 0, freeze: 0, parasitism: 0, poison: 10 },
    });
    expect(mechanicalPoison.breakdown.find((item) => item.id === "poison"))
      .toMatchObject({ damage: 0, immune: true });
  });

  test("freeze is a lock threshold rather than extra damage", () => {
    const result = calculateNegativeStatusSettlement({
      applications: { freeze: 2 },
      defender: { currentHp: 80, maxHp: 1000, types: ["普通"] },
      directDamage: 0,
      enabled: true,
      statuses: { burn: 0, freeze: 0, parasitism: 0, poison: 0 },
    });
    expect(result.statusDamage).toBe(0);
    expect(result.freeze).toMatchObject({
      stacks: 2,
      thresholdHp: 100,
      thresholdPercent: 10,
    });
    expect(result.lethal).toBe(true);
    expect(result.outcome).toBe("冻结斩杀");
  });

  test("freeze threshold HP floors the percentage boundary and never becomes damage", () => {
    const result = calculateNegativeStatusSettlement({
      applications: { freeze: 1 },
      defender: { currentHp: 19, maxHp: 372, types: ["普通"] },
      directDamage: 0,
      enabled: true,
      statuses: { burn: 0, freeze: 0, parasitism: 0, poison: 0 },
    });

    expect(result.freeze).toMatchObject({
      lethal: false,
      stacks: 1,
      thresholdHp: 18,
      thresholdPercent: 5,
    });
    expect(result.actualStatusDamage).toBe(0);
    expect(result.combinedHpLoss).toBe(0);
    expect(result.remainingHp).toBe(19);
  });

  test("does not settle end-turn statuses after direct damage already knocks out", () => {
    const result = calculateNegativeStatusSettlement({
      applications: { poison: 10 },
      defender: { currentHp: 100, maxHp: 1000, types: ["普通"] },
      directDamage: 100,
      enabled: true,
      statuses: { burn: 0, freeze: 0, parasitism: 0, poison: 0 },
    });
    expect(result).toMatchObject({
      combinedHpLoss: 100,
      skipped: "direct-ko",
      statusDamage: 0,
    });
  });

  test("parasitism healing never exceeds the source missing HP", () => {
    const result = calculateNegativeStatusSettlement({
      applications: {},
      attacker: { currentHp: 490, maxHp: 500 },
      defender: { currentHp: 500, maxHp: 1000, types: ["普通"] },
      directDamage: 0,
      enabled: true,
      statuses: { burn: 0, freeze: 0, parasitism: 5, poison: 0 },
    });
    expect(result.breakdown.find((item) => item.id === "parasitism"))
      .toMatchObject({ damage: 100, healing: 10 });
  });

  test("supports an immediate burn trigger before the regular end-turn trigger", () => {
    const result = calculateNegativeStatusSettlement({
      attacker: { currentHp: 100, maxHp: 500 },
      defender: { currentHp: 1000, maxHp: 1000, types: ["普通"] },
      directDamage: 0,
      enabled: true,
      modifiers: { burnImmediateTriggers: 1 },
      statuses: { burn: 4, freeze: 0, parasitism: 0, poison: 0 },
    });
    expect(result.breakdown.find((item) => item.id === "burn")).toMatchObject({
      damage: 160,
      triggerCount: 2,
    });
  });

  test("caps trait healing from burn and poison by the source missing HP", () => {
    const result = calculateNegativeStatusSettlement({
      attacker: { currentHp: 480, maxHp: 500 },
      defender: { currentHp: 1000, maxHp: 1000, types: ["普通"] },
      directDamage: 0,
      enabled: true,
      modifiers: { healFromBurn: true, healFromPoison: true },
      statuses: { burn: 2, freeze: 0, parasitism: 0, poison: 2 },
    });
    expect(result.totalHealing).toBe(20);
  });

  test("projects burn for this turn, next turn without reuse, and next turn with reuse", () => {
    const preview = projectNegativeStatusTurns({
      applications: { burn: 10 },
      attacker: { currentHp: 500, maxHp: 500 },
      defender: { currentHp: 1000, maxHp: 1000, types: ["普通"] },
      directDamage: 0,
      enabled: true,
      statuses: { burn: 0 },
    });

    expect(preview.current).toMatchObject({
      actualStatusDamage: 200,
      nextStacks: { burn: 5 },
      stacks: { burn: 10 },
    });
    expect(preview.nextWithoutRepeat).toMatchObject({
      actualStatusDamage: 100,
      nextStacks: { burn: 2 },
      stacks: { burn: 5 },
    });
    expect(preview.nextWithRepeat).toMatchObject({
      actualStatusDamage: 300,
      nextStacks: { burn: 7 },
      stacks: { burn: 15 },
    });
  });

  test("projects the 煤渣草 burn growth before the next action", () => {
    const preview = projectNegativeStatusTurns({
      applications: { burn: 10 },
      defender: { currentHp: 1000, maxHp: 1000, types: ["普通"] },
      enabled: true,
      modifiers: { burnGrows: true },
      statuses: { burn: 0 },
    });

    expect(preview.current.nextStacks.burn).toBe(15);
    expect(preview.nextWithoutRepeat).toMatchObject({
      actualStatusDamage: 300,
      nextStacks: { burn: 23 },
      stacks: { burn: 15 },
    });
    expect(preview.nextWithRepeat).toMatchObject({
      actualStatusDamage: 500,
      nextStacks: { burn: 38 },
      stacks: { burn: 25 },
    });
  });

  test("does not project any negative status while settlement is disabled", () => {
    expect(projectNegativeStatusTurns({
      applications: { poison: 3 },
      defender: { currentHp: 1000, maxHp: 1000, types: ["普通"] },
      enabled: false,
    })).toBeNull();
  });

  test("applies action-only burn triggers only when that action is repeated", () => {
    const preview = projectNegativeStatusTurns({
      applications: { burn: 4 },
      defender: { currentHp: 1000, maxHp: 1000, types: ["普通"] },
      enabled: true,
      modifiers: { burnImmediateTriggers: 1 },
      statuses: { burn: 0 },
    });

    expect(preview.current.actualStatusDamage).toBe(160);
    expect(preview.nextWithoutRepeat.actualStatusDamage).toBe(40);
    expect(preview.nextWithRepeat.actualStatusDamage).toBe(240);
  });

  test("supports recalculated repeat applications for layer-dependent status skills", () => {
    const preview = projectNegativeStatusTurns({
      applications: { burn: 4 },
      defender: { currentHp: 1000, maxHp: 1000, types: ["普通"] },
      enabled: true,
      repeatApplications: { burn: 8 },
      statuses: { burn: 0 },
    });

    expect(preview.current.stacks.burn).toBe(4);
    expect(preview.nextWithRepeat.stacks.burn).toBe(10);
  });
});
