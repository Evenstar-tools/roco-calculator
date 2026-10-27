import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { getTraitView } from "../../src/domain/calculator-view-model.js";
import { createInitialState } from "../../src/state/defaults.js";
import { calculatorReducer } from "../../src/state/reducer.js";
import { updateMirroredTraitContext, migrateSharedConfiguration, selectSpirit } from "../../src/state/calculator-session.js";
import { selectShareableInputs } from "../../src/state/share.js";
import { buildBalanceComparison } from "../../src/features/balance-comparison/model.js";
import { withWebPreview } from "../../src/features/s5-preview/with-web-preview.js";
import { withS5PreviewCatalog } from "../../src/features/s5-preview/catalog.js";
import catalog from "../../data/candidates/s5-preview-new-spirits.json";
import { getLegacyMinggulongLevelInputs } from "../../src/features/s5-preview/level-input-migration.js";

const original = JSON.parse(readFileSync("public/data/runtime.json", "utf8"));
const snapshot = withWebPreview(original);
const find = (name) => snapshot.spirits.find(spirit => spirit.fullName === name);
const skill = (name) => snapshot.skills.find(entry => entry.name === name);
function fixture(key, mode = "four") {
  const state = createInitialState(snapshot);
  state.mode = mode;
  state.sides.attacker.spiritId = `spirit_preview_s5_${key}`;
  state.sides.defender.spiritId = find("迪莫").id;
  for (const side of Object.values(state.sides)) side.skills = {
    single: skill("撕咬").id, four: [skill("撕咬").id, skill("水波术").id, null, null],
  };
  return state;
}
function set(state, sideKey, suffix, value) {
  const spirit = snapshot.spirits.find(entry => entry.id === state.sides[sideKey].spiritId);
  const direction = sideKey === "attacker" ? "forward" : "reverse";
  const control = getTraitView(snapshot, spirit, "attacker").inputs.find(input => input.contextKey.endsWith(suffix));
  expect(control, suffix).toBeTruthy();
  return updateMirroredTraitContext(state, { direction, key: control.id, value }).state;
}
const view = (state, extra = {}) => buildBalanceComparison({ snapshot, state, ...extra }).afterView;

test("官方换牙仅加物攻：魔攻面板与魔法伤害保持；剪影离场次数只加技能威力", () => {
  let shark = fixture("lele-shark");
  const plain = view(shark);
  shark = set(shark, "attacker", "NegativeCleared", true);
  const boosted = view(shark);
  expect(boosted.sides.attacker.finalPanelStats.physicalAttack).toBeGreaterThan(plain.sides.attacker.finalPanelStats.physicalAttack);
  expect(boosted.sides.attacker.finalPanelStats.magicalAttack).toBe(plain.sides.attacker.finalPanelStats.magicalAttack);
  expect(boosted.calculation.forward.results[0].totalDamage).toBeGreaterThan(plain.calculation.forward.results[0].totalDamage);
  expect(boosted.calculation.forward.results[1].totalDamage).toBe(plain.calculation.forward.results[1].totalDamage);

  let scissor = fixture("little-scissor");
  const before = view(scissor);
  scissor.directions.forward.context.attackerTraitS5AttackBuffActive = true;
  scissor.directions.forward.context.attackerTraitS5CurrentAttackBonus = 90;
  expect(view(scissor).calculation.forward.results[0].totalDamage).toBe(before.calculation.forward.results[0].totalDamage);
  scissor = set(scissor, "attacker", "OpponentExitCount", 2);
  const after = view(scissor);
  expect(after.sides.attacker.finalPanelStats).toEqual(before.sides.attacker.finalPanelStats);
  for (const index of [0, 1]) {
    expect(after.calculation.forward.results[index].totalDamage).toBeGreaterThan(before.calculation.forward.results[index].totalDamage);
    expect(after.calculation.forward.results[index].traitContributions).toContainEqual(expect.objectContaining({ values: expect.objectContaining({ fixedPowerAdd: 40 }) }));
  }
  const swapped = calculatorReducer(scissor, { type: "sides/swap" });
  const restored = migrateSharedConfiguration(selectShareableInputs(swapped), swapped.versions, snapshot);
  expect(view(restored).calculation.reverse.results[0].totalDamage).toBe(after.calculation.forward.results[0].totalDamage);
  expect(view(restored).calculation.reverse.results[1].totalDamage).toBe(after.calculation.forward.results[1].totalDamage);
});

test.each(["single", "four"])("%s冥古龙79级额外四成承伤只乘受击方向，80不触发且不再暗减回合", mode => {
  let state = fixture("minggulong", mode);
  state = set(state, "attacker", "BattleLevel", 80);
  const at80 = view(state);
  expect(at80.sides.attacker.combatLevel).toBe(80);
  expect(at80.calculation.reverse.selectedResult.traitContributions?.some(entry => entry.values?.finalDamageMultiplier === 1.4)).not.toBe(true);
  state = set(state, "attacker", "BattleLevel", 79);
  const at79 = view(state);
  expect(at79.sides.attacker.combatLevel).toBe(79);
  expect(at79.calculation.reverse.selectedResult.traitContributions).toEqual(expect.arrayContaining([
    expect.objectContaining({ values: expect.objectContaining({ finalDamageMultiplier: 1.4 }) }),
  ]));
  expect(at79.calculation.forward.selectedResult.traitContributions?.some(entry => entry.values?.finalDamageMultiplier === 1.4)).not.toBe(true);
  expect(at79.calculation.reverse.selectedResult.totalDamage).toBeGreaterThan(at80.calculation.reverse.selectedResult.totalDamage);
});

test("填写当前等级后清掉无效旧回合记录，镜像承伤恢复且不触碰其它方特性", () => {
  let state = fixture("minggulong");
  for (const [direction, role] of [["forward", "attacker"], ["reverse", "defender"]]) {
    const count = getLegacyMinggulongLevelInputs(role).find(input => input.contextKey.endsWith("LevelEventCount"));
    state.directions[direction].context[count.id] = 10;
  }
  state.directions.reverse.context.attackerTraitS5LevelEventCount = 3;
  expect(view(state).calculation.reverse.selectedResult.status).toBe("unsupported");
  state = set(state, "attacker", "BattleLevel", 79);
  expect(view(state).calculation.reverse.selectedResult.status).toBe("exact");
  for (const [direction, role] of [["forward", "attacker"], ["reverse", "defender"]]) {
    for (const old of getLegacyMinggulongLevelInputs(role)) expect(state.directions[direction].context).not.toHaveProperty(old.id);
  }
  expect(state.directions.reverse.context.attackerTraitS5LevelEventCount).toBe(3);
});

test.each(["single", "four"])("%s真实S5占位已接物攻与damage，保持各侧作用域", mode => {
  let state = fixture("gold-vein-dragon", mode);
  const baseline = view(state);
  expect(baseline.calculation.forward.selectedResult.status).toBe("exact");
  state = set(state, "attacker", "ChargeCount", 1);
  const boosted = view(state);
  expect(boosted.calculation.forward.selectedResult.totalDamage).toBeGreaterThan(baseline.calculation.forward.selectedResult.totalDamage);
  expect(boosted.calculation.reverse.selectedResult.totalDamage).toBe(baseline.calculation.reverse.selectedResult.totalDamage);
  expect(boosted.sides.attacker.finalPanelStats.physicalAttack).toBeGreaterThan(baseline.sides.attacker.finalPanelStats.physicalAttack);
  expect(boosted.sides.attacker.finalPanelStats.magicalAttack).toBe(baseline.sides.attacker.finalPanelStats.magicalAttack);
  expect(boosted.result.selectedResult.totalDamage).toBe(boosted.calculation.forward.selectedResult.totalDamage);
  state = set(state, "attacker", "ChargeCount", 0);
  expect(view(state).calculation.forward.selectedResult.totalDamage).toBe(baseline.calculation.forward.selectedResult.totalDamage);
});

test("聚能按能力等级合并其它修正后截到99，物攻专用且不提前截特性", () => {
  const state = fixture("gold-vein-dragon");
  const baseline = view(state);
  for (const count of [0, 1, 2, 19, 20, 21]) {
    const result = view(set(state, "attacker", "ChargeCount", count));
    for (const stat of ["physicalAttack"]) {
      expect(result.sides.attacker.finalPanelStats[stat]).toBeCloseTo(
        Math.floor(baseline.sides.attacker.finalPanelStats[stat] * (1 + Math.min(99, 5 * count) / 10)), 6);
    }
  }
  const combined = set(state, "attacker", "ChargeCount", 20);
  combined.directions.forward.overrides.attackLevelStage = -10;
  const result = view(combined);
  expect(result.sides.attacker.finalPanelStats.physicalAttack).toBeCloseTo(
    baseline.sides.attacker.finalPanelStats.physicalAttack * 10, 6);
});

test("交换攻防时聚能次数跟随精灵，两侧不同次数不串且可交换还原", () => {
  let state = fixture("gold-vein-dragon");
  state.sides.defender.spiritId = "spirit_preview_s5_gold-vein-dragon";
  state = set(state, "attacker", "ChargeCount", 1);
  state = set(state, "defender", "ChargeCount", 2);
  const before = view(state);
  const swapped = calculatorReducer(state, { type: "sides/swap" });
  const after = view(swapped);
  expect(after.sides.attacker.finalPanelStats.physicalAttack).toBe(before.sides.defender.finalPanelStats.physicalAttack);
  expect(after.sides.defender.finalPanelStats.physicalAttack).toBe(before.sides.attacker.finalPanelStats.physicalAttack);
  expect(calculatorReducer(swapped, { type: "sides/swap" })).toEqual(state);
});

test("银龙手动当前魔攻增益只增加魔攻，不按能量次数猜累计", () => {
  let state = fixture("underground-silver-dragon");
  const before = view(state);
  state = set(state, "attacker", "EnergySpent", 5);
  const after = view(state);
  expect(after.skillResultsByDirection.forward[0].totalDamage).toBe(before.skillResultsByDirection.forward[0].totalDamage);
  expect(after.skillResultsByDirection.forward[1].totalDamage).toBeGreaterThan(before.skillResultsByDirection.forward[1].totalDamage);
  expect(after.sides.attacker.finalPanelStats.physicalAttack).toBe(before.sides.attacker.finalPanelStats.physicalAttack);
  expect(after.sides.attacker.finalPanelStats.magicalAttack).toBeGreaterThan(before.sides.attacker.finalPanelStats.magicalAttack);
});

test("阿布三形态同规则，等级进入面板和伤害，80级移除额外承伤", () => {
  const damages = [];
  for (const key of ["abu", "boss-abu", "super-abu"]) {
    let state = fixture(key);
    const at60 = view(state);
    expect(at60.calculation.forward.selectedResult.status).toBe("exact");
    const ignored = structuredClone(state);
    ignored.sides.attacker.ignoreTraits = true;
    expect(at60.calculation.reverse.selectedResult.totalDamage).toBeGreaterThan(view(ignored).calculation.reverse.selectedResult.totalDamage);
    damages.push([at60.calculation.forward.selectedResult.totalDamage, at60.calculation.reverse.selectedResult.totalDamage]);
    state = set(state, "attacker", "BattleLevel", 79);
    const at79 = view(state);
    expect(at79.sides.attacker.combatLevel).toBe(79);
    expect(at79.calculation.reverse.selectedResult.traitContributions).toEqual(expect.arrayContaining([
      expect.objectContaining({ values: expect.objectContaining({ finalDamageMultiplier: 1.4 }) }),
    ]));
    expect(at79.calculation.forward.selectedResult.traitContributions?.some(entry => entry.values?.finalDamageMultiplier === 1.4)).not.toBe(true);
    state = set(state, "attacker", "BattleLevel", 80);
    const at80 = view(state);
    for (const direction of ["forward", "reverse"]) {
      expect(at80.calculation[direction].selectedResult.status).toBe("exact");
    }
    expect(at80.sides.attacker.combatLevel).toBe(80);
    expect(at80.calculation.reverse.selectedResult.traitContributions?.some(entry => entry.values?.finalDamageMultiplier === 1.4)).not.toBe(true);
    expect(at80.sides.attacker.panelStats.physicalAttack).toBeGreaterThan(at60.sides.attacker.panelStats.physicalAttack);
    expect(at80.sides.attacker.panelStats.hp).toBeGreaterThan(at60.sides.attacker.panelStats.hp);
    expect(at80.calculation.forward.selectedResult.totalDamage).toBeGreaterThan(at60.calculation.forward.selectedResult.totalDamage);
    expect(at80.calculation.reverse.selectedResult.totalDamage).toBeLessThan(at60.calculation.reverse.selectedResult.totalDamage);
  }
  expect(damages[1]).toEqual(damages[0]);
  expect(damages[2]).toEqual(damages[0]);
});

test("骰子未投掷中性可算，实际点数无映射时拦截，已有待核验技能守门保留", () => {
  let state = fixture("diliutun");
  expect(view(state).calculation.forward.selectedResult.status).toBe("exact");
  state = set(state, "attacker", "DiceRolled", true);
  expect(view(state).calculation.forward.selectedResult).toMatchObject({ status: "unsupported", totalDamage: null });
  expect(view(state).calculation.forward.selectedResult.reason).toContain("映射");
  state = fixture("lele-shark");
  state.sides.attacker.skills.four[0] = skill("焚毁").id;
  const guarded = view(state);
  expect(guarded.skillResultsByDirection.forward[0]).toMatchObject({ status: "unsupported", totalDamage: null });
  expect(guarded.skillResultsByDirection.forward[1].status).toBe("exact");
});

test("特性参数经过分享输入/恢复不丢失，切换精灵清理，和自定义种族值共同计算", () => {
  let state = fixture("gold-vein-dragon");
  state = set(state, "attacker", "ChargeCount", 1);
  state = set(state, "attacker", "ChargeCount", 2);
  const before = view(state);
  const restored = migrateSharedConfiguration(selectShareableInputs(state), state.versions, snapshot);
  expect(view(restored).calculation.forward.selectedResult.totalDamage).toBe(before.calculation.forward.selectedResult.totalDamage);
  const currentId = state.sides.attacker.spiritId;
  const custom = view(state, { customEnabled: { attacker: { [currentId]: true } },
    customStats: { attacker: { [currentId]: { physicalAttack: 150 } } } });
  expect(custom.calculation.forward.selectedResult.totalDamage).toBeGreaterThan(before.calculation.forward.selectedResult.totalDamage);
  const switched = selectSpirit(state, { initialState: createInitialState(snapshot), side: "attacker", snapshot,
    spiritId: "spirit_preview_s5_little-scissor" }).state;
  const plain = fixture("little-scissor");
  switched.sides.attacker.skills = structuredClone(plain.sides.attacker.skills);
  expect(view(switched).calculation.forward.selectedResult.status).toBe("exact");
  expect(view(switched).calculation.forward.selectedResult.totalDamage).toBe(view(plain).calculation.forward.selectedResult.totalDamage);
  expect(original.spirits.some(entry => entry.id === currentId)).toBe(false);
});

test("既有占位覆盖能升级特性接线元数据，保持稳定ID和幂等", () => {
  const old = withS5PreviewCatalog(original, catalog, { useTestRaceStats: true });
  const oldTrait = old.traits.find(entry => entry.id === "trait_preview_s5_super-abu");
  delete oldTrait.previewIdentity.mechanicKey;
  oldTrait.description = "旧的未知摘要";
  const updated = withS5PreviewCatalog(old, catalog, { useTestRaceStats: true });
  expect(updated.traits.find(entry => entry.id === oldTrait.id).previewIdentity.mechanicKey).toBe("abu");
  expect(withS5PreviewCatalog(updated, catalog, { useTestRaceStats: true })).toBe(updated);
  expect(oldTrait.description).toBe("旧的未知摘要");
});


test("不同等级通过原特性context分享恢复，派生等级不写入协议", () => {
  let state = fixture("super-abu");
  state.sides.defender.spiritId = "spirit_preview_s5_minggulong";
  state = set(state, "attacker", "BattleLevel", 62);
  state = set(state, "defender", "BattleLevel", 79);
  const before = view(state);
  const shared = selectShareableInputs(state);
  const restored = migrateSharedConfiguration(shared, state.versions, snapshot);
  const after = view(restored);
  for (const side of ["attacker", "defender"]) {
    expect(shared.sides[side]).not.toHaveProperty("level");
    expect(after.sides[side].combatLevel).toBe(before.sides[side].combatLevel);
    expect(after.sides[side].panelStats).toEqual(before.sides[side].panelStats);
  }
  expect(after.sides.attacker.combatLevel).toBe(62);
  expect(after.sides.defender.combatLevel).toBe(79);
  for (const direction of ["forward", "reverse"]) {
    expect(after.calculation[direction].selectedResult.totalDamage).toBe(before.calculation[direction].selectedResult.totalDamage);
  }
});


test("萌系天气只反转风起的自动先手判定，真实速度、顺风和闪击数值不交换", () => {
  const local = structuredClone(snapshot);
  const state = fixture("gold-vein-dragon");
  const own = local.spirits.find(spirit => spirit.fullName === "银月狼王");
  state.sides.attacker.spiritId = own.id;
  const target = local.spirits.find(spirit => spirit.id === state.sides.defender.spiritId);
  own.raceStats.speed = 180;
  target.raceStats.speed = 80;
  own.traitIds = [];
  own.traitName = "";
  target.traitIds = [];
  target.traitName = "";
  const evaluate = () => buildBalanceComparison({ snapshot: local, state }).afterView.calculation.forward.selectedResult;
  state.marks.attacker.positive = { id: "tailwind", stacks: 1 };
  const before = evaluate();
  for (const direction of Object.values(state.directions)) direction.context.weatherDream = true;
  const reverseOrder = evaluate();
  expect(reverseOrder.totalDamage).toBeLessThan(before.totalDamage);
  expect(reverseOrder.combatPanel).toEqual(before.combatPanel);
  // Explicit action confirmation remains authoritative when skill priority matters.
  state.directions.forward.context.actedBeforeEnemy = true;
  expect(evaluate().totalDamage).toBe(before.totalDamage);
  delete state.directions.forward.context.actedBeforeEnemy;
  state.marks.attacker.positive = { id: null, stacks: 0 };
  own.traitIds = [local.traits.find(trait => trait.name === "顺风").id];
  const quick = local.skills.find(skill => skill.name === "闪击");
  state.sides.attacker.skills.four[0] = quick.id;
  const underDream = evaluate();
  for (const direction of Object.values(state.directions)) direction.context.weatherDream = false;
  const ordinary = evaluate();
  expect(underDream.totalDamage).toBe(ordinary.totalDamage);
  expect(underDream.combatPanel).toEqual(ordinary.combatPanel);
  expect(underDream.formulaSteps).toEqual(ordinary.formulaSteps);
});

test.each(["single", "four"])("%s蛋包蛋单开关固定双防+50%，不叠加且取消后面板和承伤恢复", mode => {
  let state = fixture("egg-wrap", mode);
  const before = view(state);
  state = set(state, "attacker", "EggTriggered", true);
  const after = view(state);
  for (const key of ["physicalDefense", "magicalDefense"]) {
    expect(after.sides.attacker.finalPanelStats[key]).toBe(Math.floor(before.sides.attacker.finalPanelStats[key] * 1.5));
  }
  expect(after.calculation.reverse.selectedResult.totalDamage).toBeLessThan(before.calculation.reverse.selectedResult.totalDamage);
  expect(view(set(state, "attacker", "EggTriggered", true)).calculation.reverse.selectedResult.totalDamage)
    .toBe(after.calculation.reverse.selectedResult.totalDamage);
  const restored = view(set(state, "attacker", "EggTriggered", false));
  expect(restored.sides.attacker.finalPanelStats).toEqual(before.sides.attacker.finalPanelStats);
  expect(restored.calculation.reverse.selectedResult.totalDamage).toBe(before.calculation.reverse.selectedResult.totalDamage);
});

test.each(["attacker", "defender"])("%s龙嵴金脉无技能时也显示聚能物攻，选择技能后不重复计算", side => {
  let state = fixture("gold-vein-dragon");
  if (side === "defender") state = calculatorReducer(state, { type: "sides/swap" });
  for (const owner of Object.values(state.sides)) owner.skills = { single: null, four: [null, null, null, null] };
  const base = view(state).sides[side].panelStats;
  for (const count of [0, 1, 2, 20]) {
    const expected = Math.floor(base.physicalAttack * (1 + Math.min(99, count * 5) / 10));
    state = set(state, side, "ChargeCount", count);
    const model = view(state);
    expect(model.sides[side].finalPanelStats).toMatchObject({ physicalAttack: expected, magicalAttack: base.magicalAttack, physicalDefense: base.physicalDefense });
    expect(model.sides[side].abilityStageBonuses).toMatchObject({ attack: 0, attackByCategory: { physical: count * 5, magical: 0 }, defense: 0 });
    expect(state.directions.forward.overrides.attackLevelStage ?? 0).toBe(0);
  }
  state = set(state, side, "ChargeCount", 2);
  const withoutSkill = view(state);
  state.sides[side].skills.four[0] = skill("撕咬").id;
  expect(view(state).sides[side].finalPanelStats.physicalAttack).toBe(withoutSkill.sides[side].finalPanelStats.physicalAttack);
  state.sides[side].skills.four[0] = null;
  state.sides[side].ignoreTraits = true;
  expect(view(state).sides[side].finalPanelStats?.physicalAttack ?? view(state).sides[side].panelStats.physicalAttack).toBe(base.physicalAttack);
  expect(view(state).sides[side].abilityStageBonuses.attack).toBe(0);
});

test("无技能时S5双防和单魔攻也生效，聚能与手调修正合并后截断", () => {
  for (const [key, suffix, value, expected] of [
    ["egg-wrap", "EggTriggered", true, { physicalDefense: 304, magicalDefense: 304, physicalAttack: 203 }],
    ["underground-silver-dragon", "EnergySpent", 5, { magicalAttack: 342, physicalAttack: 151 }],
  ]) {
    let state = fixture(key);
    for (const owner of Object.values(state.sides)) owner.skills = { single: null, four: [null, null, null, null] };
    state = set(state, "attacker", suffix, value);
    expect(view(state).sides.attacker.finalPanelStats).toMatchObject(expected);
  }
  let state = fixture("gold-vein-dragon");
  for (const owner of Object.values(state.sides)) owner.skills = { single: null, four: [null, null, null, null] };
  state = set(state, "attacker", "ChargeCount", 20);
  state.directions.forward.overrides.attackLevelStage = -10;
  expect(view(state).sides.attacker.finalPanelStats.physicalAttack).toBe(2370);
});

test.each([
  ["single", "attacker"], ["single", "defender"],
  ["four", "attacker"], ["four", "defender"],
])("%s模式%s银龙4点能量保留单魔攻4层展示，手调双攻只叠加一次", (mode, side) => {
  let state = fixture("underground-silver-dragon", mode);
  if (side === "defender") state = calculatorReducer(state, { type: "sides/swap" });
  for (const owner of Object.values(state.sides)) owner.skills = { single: null, four: [null, null, null, null] };
  state = set(state, side, "EnergySpent", 4);
  const base = view(state).sides[side].panelStats;
  const direction = side === "attacker" ? "forward" : "reverse";
  for (const skillName of [null, "防御", "光球"]) {
    const skillId = skillName ? skill(skillName).id : null;
    state.sides[side].skills = { single: skillId, four: [skillId, null, null, null] };
    for (const manual of [0, 1]) {
      const physicalAttack = Math.floor(base.physicalAttack * (1 + manual / 10));
      const magicalAttack = Math.floor(base.magicalAttack * (1 + (manual + 4) / 10));
      state.directions[direction].overrides.attackLevelStage = manual;
      const ownerView = view(state).sides[side];
      expect(ownerView.abilityStageBonuses).toMatchObject({
        attackByCategory: { physical: 0, magical: 4 }, defense: 0,
      });
      expect(ownerView.finalPanelStats).toMatchObject({ physicalAttack, magicalAttack });
      expect(state.directions[direction].overrides.attackLevelStage).toBe(manual);
    }
  }
  state.sides[side].ignoreTraits = true;
  expect(view(state).sides[side].abilityStageBonuses).toMatchObject({
    attackByCategory: { physical: 0, magical: 0 }, defense: 0,
  });
});
