import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { getTraitView } from "../../src/domain/calculator-view-model.js";
import { createInitialState } from "../../src/state/defaults.js";
import { updateMirroredTraitContext, migrateSharedConfiguration, selectSpirit } from "../../src/state/calculator-session.js";
import { selectShareableInputs } from "../../src/state/share.js";
import { buildBalanceComparison } from "../../src/features/balance-comparison/model.js";
import { withWebPreview } from "../../src/features/s5-preview/with-web-preview.js";
import { withS5PreviewCatalog } from "../../src/features/s5-preview/catalog.js";
import catalog from "../../data/candidates/s5-preview-new-spirits.json";

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

test.each(["single", "four"])("%s真实S5占位已接双攻/双防与damage，保持各侧作用域", mode => {
  let state = fixture("gold-vein-dragon", mode);
  const baseline = view(state);
  expect(baseline.calculation.forward.selectedResult.status).toBe("exact");
  state = set(state, "attacker", "AttackBuffActive", true);
  const boosted = view(state);
  expect(boosted.calculation.forward.selectedResult.totalDamage).toBeGreaterThan(baseline.calculation.forward.selectedResult.totalDamage);
  expect(boosted.calculation.reverse.selectedResult.totalDamage).toBe(baseline.calculation.reverse.selectedResult.totalDamage);
  expect(boosted.sides.attacker.finalPanelStats.physicalAttack).toBeGreaterThan(baseline.sides.attacker.finalPanelStats.physicalAttack);
  expect(boosted.sides.attacker.finalPanelStats.magicalAttack).toBeGreaterThan(baseline.sides.attacker.finalPanelStats.magicalAttack);
  expect(boosted.result.selectedResult.totalDamage).toBe(boosted.calculation.forward.selectedResult.totalDamage);
  state = set(state, "attacker", "AttackBuffActive", false);
  expect(view(state).calculation.forward.selectedResult.totalDamage).toBe(baseline.calculation.forward.selectedResult.totalDamage);
});

test("银龙手动当前魔攻增益只增加魔攻，不按能量次数猜累计", () => {
  let state = fixture("underground-silver-dragon");
  const before = view(state);
  state = set(state, "attacker", "CurrentMagicalAttackBonus", 50);
  const after = view(state);
  expect(after.skillResultsByDirection.forward[0].totalDamage).toBe(before.skillResultsByDirection.forward[0].totalDamage);
  expect(after.skillResultsByDirection.forward[1].totalDamage).toBeGreaterThan(before.skillResultsByDirection.forward[1].totalDamage);
  expect(after.sides.attacker.finalPanelStats.physicalAttack).toBe(before.sides.attacker.finalPanelStats.physicalAttack);
  expect(after.sides.attacker.finalPanelStats.magicalAttack).toBeGreaterThan(before.sides.attacker.finalPanelStats.magicalAttack);
});

test("阿布三形态同规则，60级试算承伤生效，未知等级公式两方向拦截", () => {
  const damages = [];
  for (const key of ["abu", "boss-abu", "super-abu"]) {
    let state = fixture(key);
    const at60 = view(state);
    expect(at60.calculation.forward.selectedResult.status).toBe("exact");
    const ignored = structuredClone(state);
    ignored.sides.attacker.ignoreTraits = true;
    expect(at60.calculation.reverse.selectedResult.totalDamage).toBeGreaterThan(view(ignored).calculation.reverse.selectedResult.totalDamage);
    damages.push([at60.calculation.forward.selectedResult.totalDamage, at60.calculation.reverse.selectedResult.totalDamage]);
    state = set(state, "attacker", "CurrentLevel", 80);
    const unknown = view(state);
    for (const direction of ["forward", "reverse"]) {
      expect(unknown.calculation[direction].selectedResult).toMatchObject({ status: "unsupported", totalDamage: null });
      expect(unknown.calculation[direction].selectedResult.reason).toContain("等级");
    }
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
  state = set(state, "attacker", "AttackBuffActive", true);
  state = set(state, "attacker", "CurrentAttackBonus", 70);
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
