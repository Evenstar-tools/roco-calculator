import { describe, expect, test } from "vitest";
import { buildCalculatorViewModel } from "../../src/domain/calculator-view-model.js";
import { buildBalanceComparison } from "../../src/features/balance-comparison/model.js";
import { createSpiritSearchIndex } from "../../src/data/search-index.js";

const patch = { id: "reviewed-patch", label: "已核验调整", date: "2026.10.14", status: "current" };
const stats = { hp: 100, physicalAttack: 120, magicalAttack: 80, physicalDefense: 100, magicalDefense: 100, speed: 100 };
const info = (items, extra = {}) => ({ patch, items, ...extra });
const stat = (field, before, after) => ({ kind: "stat", field, label: field, before, after });
function fixture() {
  const snapshot = {
    meta: { id: "comparison-fixture", rulesVersion: "comparison-rules" },
    spirits: [
      { id: "alpha", fullName: "甲", types: ["火"], raceStats: { ...stats }, traitIds: [], changeInfo: info([stat("physicalAttack", 80, 120)]) },
      { id: "beta", fullName: "乙", types: ["火"], raceStats: { ...stats }, traitIds: [] },
    ],
    skills: [
      { id: "hit", name: "测试攻击", category: "physical", type: "火", basePower: 80, cost: 2, changeInfo: info([stat("basePower", 60, 80)]) },
      { id: "unchanged", name: "普通测试", category: "physical", type: "火", basePower: 70, cost: 1 },
    ],
    learnsets: ["alpha", "beta"].map((spiritId) => ({ spiritId, skillIds: ["hit", "unchanged"] })),
    traits: [], typeChart: null,
  };
  const direction = () => ({ context: {}, currentHp: null, finalDamageMultiplier: 1, hitCount: 1, overrides: {}, reduction: 1, selectedSkillIndex: 0, selectedDamageSource: "skill", starfallStacks: 0 });
  const side = (spiritId) => ({ spiritId, displayIvs: Object.fromEntries(Object.keys(stats).map((key) => [key, 60])), nature: "neutral", skills: { single: "hit", four: ["hit", "unchanged", null, null] } });
  const state = {
    directions: { forward: direction(), reverse: direction() }, level: 60, mode: "four", schemaVersion: 1,
    sides: { attacker: side("alpha"), defender: side("beta") },
    versions: { data: snapshot.meta.id, rules: snapshot.meta.rulesVersion },
  };
  return { snapshot, state, activeDirection: "forward", patchId: patch.id, enabled: true };
}

describe("独立种族值试算", () => {
  test("两侧同种精灵手调互不串值，直接产生当前结果且不生成历史比较", () => {
    const args = fixture();
    args.state.sides.defender.spiritId = "alpha";
    args.customStats = { attacker: { alpha: { physicalAttack: 200 } }, defender: { alpha: { physicalDefense: 200 } } };
    args.customEnabled = { attacker: { alpha: true }, defender: { alpha: true } };
    const saved = structuredClone(args);
    const result = buildBalanceComparison(args);
    expect(result.afterView.sides.attacker.spirit.raceStats).toMatchObject({ physicalAttack: 200, physicalDefense: 100 });
    expect(result.afterView.sides.defender.spirit.raceStats).toMatchObject({ physicalAttack: 120, physicalDefense: 200 });
    expect(result.afterView.selectableSpirits).toHaveLength(2);
    expect(result).not.toHaveProperty("beforeView");
    expect(result).not.toHaveProperty("patch");
    expect(args).toEqual(saved);
    args.customEnabled = {};
    const closed = buildBalanceComparison(args);
    expect(closed.active).toBe(false);
    expect(closed.afterView.sides.attacker.spirit.raceStats.physicalAttack).toBe(120);
  });

  test("关闭功能后遗留百分比模式不改变普通共享VM的绝对生命输入", () => {
    const args = fixture();
    args.hpInputModes = { forward: "percent" };
    args.state.directions.forward.currentHp = 100;
    args.state.directions.forward.context.currentHpPercent = 25;
    expect(buildBalanceComparison(args).afterView).toEqual(buildCalculatorViewModel(args));
    expect(buildBalanceComparison(args).afterView.result.defenderHp).toBe(100);
  });

  test("自定义副本保留头像和双方官方身份", () => {
    const args = fixture();
    args.snapshot.spirits[0].asset = { localUrl: "/assets/alpha.png" };
    args.snapshot.spirits[1].asset = { publicPath: "/assets/beta.png" };
    args.spiritIndex = createSpiritSearchIndex(args.snapshot.spirits);
    args.customStats = { attacker: { alpha: { physicalAttack: 180 } }, defender: { beta: { physicalDefense: 140 } } };
    args.customEnabled = { attacker: { alpha: true }, defender: { beta: true } };
    const view = buildBalanceComparison(args).afterView;
    expect(view.sides.attacker.spirit).toMatchObject({ id: "alpha", assetUrl: "/assets/alpha.png" });
    expect(view.sides.defender.spirit).toMatchObject({ id: "beta", assetUrl: "/assets/beta.png" });
    expect(view.active.attackSpirit.assetUrl).toBe("/assets/alpha.png");
    expect(view.active.defenseSpirit.assetUrl).toBe("/assets/beta.png");
  });

  test.each(["percentage", "absolute"])("保留%s生命输入语义，与共享VM直接重算一致", (mode) => {
    const args = fixture();
    args.customStats = { defender: { beta: { hp: 200 } } };
    args.customEnabled = { defender: { beta: true } };
    args.state.directions.forward.currentHp = 100;
    args.state.directions.forward.context.currentHpPercent = 25;
    args.hpInputModes = { forward: mode === "percentage" ? "percent" : "hp" };
    const result = buildBalanceComparison(args);
    const expected = structuredClone(args.snapshot);
    expected.spirits[1].raceStats.hp = 200;
    const expectedState = structuredClone(args.state);
    if (mode === "percentage") expectedState.directions.forward.currentHp = Math.round(result.afterView.sides.defender.panelStats.hp * 0.25);
    const direct = buildCalculatorViewModel({ snapshot: expected, state: expectedState, activeDirection: "forward" });
    expect(result.afterView.result.selectedResult.totalDamage).toBe(direct.result.selectedResult.totalDamage);
    expect(result.afterView.result.defenderHp).toBe(direct.result.defenderHp);
    expect(args.state.directions.forward.currentHp).toBe(100);
  });

  test.each([0, -1, 1.5, "", "bad"])("拒绝无效手调值%s，保留当前官方计算", value => {
    const args = fixture();
    args.customStats = { attacker: { alpha: { physicalAttack: value } } };
    args.customEnabled = { attacker: { alpha: true } };
    const result = buildBalanceComparison(args);
    expect(result.issue).toContain("正整数");
    expect(result.afterView.sides.attacker.spirit.raceStats.physicalAttack).toBe(120);
  });

  test("S4旧调整、新身份与未知旧机制元数据都不再进入试算链路", () => {
    const args = fixture();
    args.snapshot.spirits[1].changeInfo = info([{ kind: "new" }], { isNew: true });
    args.snapshot.spirits[0].changeInfo = info([{ kind: "trait", before: "旧", after: "新" }]);
    const ordinary = buildCalculatorViewModel(args);
    expect(buildBalanceComparison(args).afterView).toEqual(ordinary);
    args.customStats = { attacker: { alpha: { physicalAttack: 180 } } };
    args.customEnabled = { attacker: { alpha: true } };
    const result = buildBalanceComparison(args);
    expect(result.issue).toBeNull();
    expect(result.afterView.result.selectedResult.totalDamage).toBeGreaterThan(ordinary.result.selectedResult.totalDamage);
  });

  test("战斗形态按resolved ID隔离，保留来源属性和特性", () => {
    const args = fixture();
    args.snapshot.spirits[0].evolutionChainIds = ["alpha", "form"];
    args.snapshot.spirits[0].traitName = "来源特性";
    args.snapshot.spirits.push({ ...args.snapshot.spirits[0], id: "form", fullName: "战斗形态", traitName: "形态特性", raceStats: { ...stats, physicalAttack: 150 }, types: ["水"], evolutionChainIds: ["alpha", "form"] });
    args.state.sides.attacker.battleForm = { branchId: "alpha", spiritId: "form" };
    args.customStats = { attacker: { alpha: { physicalAttack: 999 }, form: { physicalAttack: 180 } } };
    args.customEnabled = { attacker: { alpha: true, form: true } };
    const result = buildBalanceComparison(args);
    expect(result.afterView.sides.attacker.spirit).toMatchObject({ id: "form", types: ["火"], traitName: "来源特性", raceStats: { physicalAttack: 180 } });
    args.state.sides.attacker.spiritId = "beta";
    delete args.state.sides.attacker.battleForm;
    expect(buildBalanceComparison(args).active).toBe(false);
  });

  test("国际计算和未知种族值限制保持原样", () => {
    const args = fixture();
    args.snapshot.spirits[0].calculationStatus = "pending-race-stats";
    args.customStats = { attacker: { alpha: { physicalAttack: 200 } } };
    args.customEnabled = { attacker: { alpha: true } };
    expect(buildBalanceComparison(args).issue).toContain("种族值待确认");
    delete args.snapshot.spirits[0].calculationStatus;
    args.snapshot.meta = { ...args.snapshot.meta, serverId: "global", placeholderSource: "cn" };
    args.state.serverId = "global";
    const result = buildBalanceComparison(args);
    expect(result.afterView.configurationReady).toBe(false);
    expect(result.afterView.result).toBeNull();
    expect(args.snapshot.meta.serverId).toBe("global");
  });
});
