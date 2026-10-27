import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { buildCalculatorViewModel } from "../../src/domain/calculator-view-model.js";
import { createInitialState } from "../../src/state/defaults.js";
import { damagePresentation } from "../../src/domain/result-presentation.js";
import { buildBalanceComparison } from "../../src/features/balance-comparison/model.js";
import { withS5PreviewCalculationGuard } from "../../src/features/s5-preview/calculation-guard.js";
import { applyS5SeasonAnnouncement } from "../../src/features/s5-preview/season-announcement.js";

const current = JSON.parse(readFileSync("public/data/runtime.json", "utf8"));
const raceStats = { hp: 100, physicalAttack: 100, magicalAttack: 100, physicalDefense: 100, magicalDefense: 100, speed: 100, total: 600 };
const fire = current.spirits.find(({ fullName }) => fullName === "烈火守护");
const bite = current.skills.find(({ name }) => name === "撕咬");
const pendingId = "test_s5_placeholder";
function fixture({ side = "attacker", mode = "four", direction = "forward" } = {}) {
  const snapshot = {
    ...current,
    spirits: [...current.spirits, { id: pendingId, fullName: "S5测试精灵", types: [], raceStats: { ...raceStats },
      calculationStatus: "pending-s5-mechanics", traitIds: ["test_s5_trait"],
      previewIdentity: { raceStatsPlaceholder: true, formalIdPending: true } }],
    traits: [...current.traits, { id: "test_s5_trait", name: "前瞻特性", description: "特性规则待接入" }],
    learnsets: [...current.learnsets, { spiritId: pendingId, skillIds: [bite.id], defaultSkillIds: [bite.id] }],
  };
  const state = createInitialState(snapshot);
  state.mode = mode;
  state.calculationOptions = { ...state.calculationOptions, includeNegativeStatusSettlement: true };
  state.negativeStatuses = { attacker: { burn: 2 }, defender: { poison: 3 } };
  for (const [key, value] of Object.entries(state.sides)) {
    value.spiritId = key === side ? pendingId : fire.id;
    value.skills = { single: bite.id, four: [bite.id, null, null, null] };
  }
  return { snapshot, state, activeDirection: direction };
}

function expectBlocked(result) {
  expect(result).toMatchObject({ status: "unsupported", totalDamage: null, damage: null,
    hpPercent: null, remainingHp: null, lethal: false });
  expect(result.reason).toContain("S5测试精灵的 S5 特性尚未接入");
  expect(damagePresentation(result)).toMatchObject({ damage: null, percent: null, remainingHp: null, hasStatusImpact: false });
  expect(result.formulaSteps).toEqual([]);
  expect(result.hitDamages).toEqual([]);
  expect(result.gainSources).toEqual({});
  expect(result.traitContributions).toEqual([]);
  expect(result.negativeStatusApplications).toBeNull();
  expect(result.negativeStatusSettlement).toBeNull();
  expect(result.markSettlements).toEqual([]);
  expect(result.traitSettlements).toEqual([]);
  for (const field of ["mainDamage", "additionalDamage", "traitDamage", "actualPower", "combatPanel", "postAttackEffects"]) {
    expect(result).not.toHaveProperty(field);
  }
}

describe("S5 placeholder calculation guard", () => {
  test.each(["attacker", "defender"].flatMap(side => ["four", "single"].flatMap(mode =>
    ["forward", "reverse"].map(direction => ({ side, mode, direction })))))
  ("$side placeholder blocks both directions in $mode/$direction while keeping panels and editing", (options) => {
    const args = fixture(options);
    const raw = buildCalculatorViewModel(args);
    expect(raw.configurationReady).toBe(true);
    expect(raw.result.selectedResult.status).toBe("exact");
    expect(raw.result.selectedResult.totalDamage).toBeGreaterThan(0);
    const original = structuredClone(raw.result.selectedResult);
    const guarded = withS5PreviewCalculationGuard(raw);
    expect(guarded.configurationReady).toBe(raw.configurationReady);
    expect(guarded.configurationEditable).toBe(raw.configurationEditable);
    expect(guarded.sides).toBe(raw.sides);
    expect(guarded.skills).toBe(raw.skills);
    expect(guarded.sides[options.side].panelStats).not.toBeNull();
    expect(guarded.result.defenderHp).toBe(raw.result.defenderHp);
    for (const direction of ["forward", "reverse"]) {
      expectBlocked(guarded.calculation[direction].selectedResult);
      for (const result of guarded.calculation[direction].results.filter(Boolean)) expectBlocked(result);
      for (const result of guarded.skillResultsByDirection[direction].filter(Boolean)) expectBlocked(result);
    }
    expectBlocked(guarded.result.selectedResult);
    for (const result of guarded.result.results.filter(Boolean)) expectBlocked(result);
    for (const result of guarded.result.skillResults) expectBlocked(result);
    expect(raw.result.selectedResult).toEqual(original);
  });

  test("bloodline, trait and nested result aliases never retain calculated damage or settlements", () => {
    const raw = buildCalculatorViewModel(fixture());
    const result = raw.result.selectedResult;
    expect(result.negativeStatusSettlement).not.toBeNull();
    const alias = { ...result, remainingHp: 77, postAttackEffects: { damage: 99 }, gainSummary: "must be removed" };
    raw.calculation.forward.bloodlineResult = alias;
    raw.calculation.reverse.traitResult = alias;
    raw.result.traitDamageResult = alias;
    raw.result.bloodlineResult = { id: "bloodline", name: "血脉", damage: 99, hpPercent: 12, selected: true };
    raw.result.traitResult = { id: "trait", name: "特性", damage: 99, hpPercent: 12, selected: false };
    raw.traitResultsByDirection = { forward: alias, reverse: alias };
    const guarded = withS5PreviewCalculationGuard(raw);
    for (const result of [guarded.calculation.forward.bloodlineResult, guarded.calculation.reverse.traitResult,
      guarded.result.traitDamageResult, guarded.result.bloodlineResult, guarded.result.traitResult,
      ...Object.values(guarded.traitResultsByDirection)]) expectBlocked(result);
    expect(guarded.result.bloodlineResult).toMatchObject({ id: "bloodline", name: "血脉", selected: true });
    expect(alias.remainingHp).toBe(77);
    expect(alias.gainSummary).toBe("must be removed");
  });

  test("custom race stats keep their edited panel but cannot bypass the pending-mechanics guard", () => {
    const args = fixture();
    const trial = buildBalanceComparison({ ...args,
      customEnabled: { attacker: { [pendingId]: true } },
      customStats: { attacker: { [pendingId]: { physicalAttack: 250 } } },
    });
    const guarded = trial.afterView;
    expect(trial.hasCustom).toBe(true);
    expect(guarded.configurationReady).toBe(true);
    expect(guarded.sides.attacker.spirit.raceStats.physicalAttack).toBe(250);
    expect(guarded.sides.attacker.spirit.calculationStatus).toBe("pending-s5-mechanics");
    expectBlocked(guarded.result.selectedResult);
    expect(args.snapshot.spirits.find(({ id }) => id === pendingId).raceStats.physicalAttack).toBe(100);
  });

  test("ordinary views and absent views preserve their exact reference", () => {
    const args = fixture();
    args.state.sides.attacker.spiritId = fire.id;
    const raw = buildCalculatorViewModel(args);
    expect(withS5PreviewCalculationGuard(raw)).toBe(raw);
    expect(withS5PreviewCalculationGuard(null)).toBeNull();
    expect(withS5PreviewCalculationGuard(undefined)).toBeUndefined();
  });

  test("S5未接入状态只保护相应技能，旁边已支持技能继续可算", () => {
    const snapshot = applyS5SeasonAnnouncement(current);
    const state = createInitialState(snapshot);
    state.mode = "four";
    const pending = snapshot.skills.find(({ name }) => name === "焚毁");
    state.sides.attacker.spiritId = fire.id;
    state.sides.defender.spiritId = fire.id;
    state.sides.attacker.skills.four = [pending.id, bite.id, null, null];
    const raw = buildCalculatorViewModel({ snapshot, state, activeDirection: "forward" });
    const guarded = withS5PreviewCalculationGuard(raw, snapshot, state);
    expect(guarded.skillResultsByDirection.forward[0]).toMatchObject({ status: "unsupported", totalDamage: null, reason: pending.s5StatusEffectPending });
    expect(guarded.skillResultsByDirection.forward[1]).toBe(raw.skillResultsByDirection.forward[1]);
    expect(guarded.skillResultsByDirection.forward[1].totalDamage).toBeGreaterThan(0);
    expect(raw.skillResultsByDirection.forward[0].status).not.toBe("unsupported");
  });

  test("换碟的广播只拦携带有效特性的一侧，不猜加成、不影响其他技能", () => {
    const snapshot = applyS5SeasonAnnouncement(current);
    const state = createInitialState(snapshot);
    state.mode = "four";
    const owner = snapshot.spirits.find(({ fullName }) => fullName === "音碟吼");
    const broadcast = snapshot.skills.find(({ name }) => name === "广播");
    state.sides.attacker.spiritId = owner.id;
    state.sides.defender.spiritId = fire.id;
    for (const side of Object.values(state.sides)) side.skills.four = [broadcast.id, bite.id, null, null];
    const raw = buildCalculatorViewModel({ snapshot, state, activeDirection: "forward" });
    const guarded = withS5PreviewCalculationGuard(raw, snapshot, state);
    expect(guarded.skillResultsByDirection.forward[0]).toMatchObject({ status: "unsupported", totalDamage: null, reason: expect.stringContaining("尚未公布") });
    expect(guarded.skillResultsByDirection.forward[1]).toBe(raw.skillResultsByDirection.forward[1]);
    expect(guarded.skillResultsByDirection.reverse[0]).toBe(raw.skillResultsByDirection.reverse[0]);
    state.sides.attacker.ignoreTraits = true;
    const ignored = buildCalculatorViewModel({ snapshot, state, activeDirection: "forward" });
    expect(withS5PreviewCalculationGuard(ignored, snapshot, state).skillResultsByDirection.forward[0])
      .toBe(ignored.skillResultsByDirection.forward[0]);
  });
});
