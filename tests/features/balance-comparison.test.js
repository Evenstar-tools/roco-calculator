import { describe, expect, test } from "vitest";
import { buildCalculatorViewModel } from "../../src/domain/calculator-view-model.js";
import { buildBalanceComparison, createRecordedBaseline, damageDelta } from "../../src/features/balance-comparison/model.js";
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

describe("已记录调整与自定义种族值串联", () => {
  test("同时重算种族值、技能威力与双向结果，不修改数据或配置", () => {
    const args = fixture();
    const saved = structuredClone(args);
    const comparison = buildBalanceComparison(args);
    expect(comparison.issue).toBeNull();
    expect(comparison.beforeView.sides.attacker.spirit.raceStats.physicalAttack).toBe(80);
    expect(comparison.afterView.sides.attacker.spirit.raceStats.physicalAttack).toBe(120);
    expect(comparison.beforeView.result.selectedResult.totalDamage).toBeLessThan(comparison.afterView.result.selectedResult.totalDamage);
    expect(comparison.beforeView.calculation.reverse.selectedResult.totalDamage).toBeLessThan(comparison.afterView.calculation.reverse.selectedResult.totalDamage);
    expect(comparison.changes).toHaveLength(2);
    expect(args).toEqual(saved);
    expect(comparison.beforeView.calculation.versions).toEqual(comparison.afterView.calculation.versions);
  });

  test("只回退指定 patch，拒绝记录漂移", () => {
    const args = fixture();
    args.snapshot.spirits[0].changeInfo.patch = { ...patch, id: "other-patch" };
    const baseline = createRecordedBaseline(args.snapshot, { patchId: patch.id });
    expect(baseline.snapshot.spirits[0].raceStats.physicalAttack).toBe(120);
    expect(baseline.snapshot.skills[0].basePower).toBe(60);
    args.snapshot.skills[0].basePower = 81;
    expect(buildBalanceComparison(args)).toMatchObject({ beforeView: null, issue: expect.stringContaining("不一致") });
  });

  test("没有当前选择相关改动时保持同一伤害，不混入别的实体机制", () => {
    const args = fixture();
    args.snapshot.spirits[0].changeInfo.items = [{ kind: "trait", label: "特性·无关", before: "旧", after: "新" }];
    args.state.sides.attacker.spiritId = "beta";
    for (const side of Object.values(args.state.sides)) side.skills = { single: "unchanged", four: ["unchanged", null, null, null] };
    const result = buildBalanceComparison(args);
    expect(result.issue).toBeNull();
    expect(result.changes).toEqual([]);
    expect(result.beforeView.result.selectedResult.totalDamage).toBe(result.afterView.result.selectedResult.totalDamage);
  });

  test("同种精灵两侧自定义互不串值，关闭恢复官方，编辑不污染官方", () => {
    const args = fixture();
    args.enabled = false;
    args.state.sides.defender.spiritId = "alpha";
    args.customStats = { attacker: { alpha: { physicalAttack: 200 } }, defender: { alpha: { physicalDefense: 200 } } };
    args.customEnabled = { attacker: { alpha: true }, defender: { alpha: true } };
    const saved = structuredClone(args);
    const result = buildBalanceComparison(args);
    expect(result.afterView.sides.attacker.spirit.id).toBe("alpha");
    expect(result.afterView.sides.defender.spirit.id).toBe("alpha");
    expect(result.afterView.sides.attacker.spirit.raceStats).toMatchObject({ physicalAttack: 200, physicalDefense: 100 });
    expect(result.afterView.sides.defender.spirit.raceStats).toMatchObject({ physicalAttack: 120, physicalDefense: 200 });
    expect(result.afterView.selectableSpirits).toHaveLength(2);
    expect(result.afterView.sides.attacker.panelStats.physicalAttack).toBeGreaterThan(result.beforeView.sides.attacker.panelStats.physicalAttack);
    expect(args).toEqual(saved);
    args.customEnabled = {};
    const closed = buildBalanceComparison(args);
    expect(closed.active).toBe(false);
    expect(closed.afterView.sides.attacker.spirit.raceStats.physicalAttack).toBe(120);
  });

  test("历史记录为 before，当前自定义为 after，各自重新生成面板", () => {
    const args = fixture();
    args.customStats = { attacker: { alpha: { physicalAttack: 200 } } };
    args.customEnabled = { attacker: { alpha: true } };
    const result = buildBalanceComparison(args);
    expect(result.beforeView.sides.attacker.spirit.raceStats.physicalAttack).toBe(80);
    expect(result.afterView.sides.attacker.spirit.raceStats.physicalAttack).toBe(200);
    expect(result.changes.filter(({ kind }) => kind === "custom")).toHaveLength(1);
    expect(result.afterLabel).toBe("自定义试算");
  });

  test("关闭功能后遗留百分比模式不改变普通共享 VM 的绝对生命输入", () => {
    const args = fixture();
    args.enabled = false;
    args.hpInputModes = { forward: "percent" };
    args.state.directions.forward.currentHp = 100;
    args.state.directions.forward.context.currentHpPercent = 25;
    const direct = buildCalculatorViewModel(args);
    const inactive = buildBalanceComparison(args);
    expect(inactive.active).toBe(false);
    expect(inactive.beforeView).toBeNull();
    expect(inactive.afterView).toEqual(direct);
    expect(inactive.afterView.result.defenderHp).toBe(100);
    args.enabled = true;
    const active = buildBalanceComparison(args);
    expect(active.beforeView.result.defenderHp).toBe(Math.round(active.beforeView.result.defenderMaxHp * 0.25));
    expect(active.afterView.result.defenderHp).toBe(Math.round(active.afterView.result.defenderMaxHp * 0.25));
    expect(args.state.directions.forward.currentHp).toBe(100);
  });

  test("记录基线和自定义副本保留卡片头像，双方身份均回到官方 ID", () => {
    const args = fixture();
    args.snapshot.spirits[0].asset = { localUrl: "/assets/alpha.png" };
    args.snapshot.spirits[1].asset = { publicPath: "/assets/beta.png" };
    args.spiritIndex = createSpiritSearchIndex(args.snapshot.spirits);
    args.customStats = { attacker: { alpha: { physicalAttack: 180 } }, defender: { beta: { physicalDefense: 140 } } };
    args.customEnabled = { attacker: { alpha: true }, defender: { beta: true } };
    const result = buildBalanceComparison(args);
    for (const view of [result.beforeView, result.afterView]) {
      expect(view.sides.attacker.spirit).toMatchObject({ id: "alpha", assetUrl: "/assets/alpha.png" });
      expect(view.sides.defender.spirit).toMatchObject({ id: "beta", assetUrl: "/assets/beta.png" });
      expect(view.active.attackSpirit.assetUrl).toBe("/assets/alpha.png");
      expect(view.active.defenseSpirit.assetUrl).toBe("/assets/beta.png");
    }
  });

  test("未经旧规则审计的 hitCount 字段不按可回退数值处理", () => {
    const args = fixture();
    args.snapshot.skills[0].hitCount = 2;
    args.snapshot.skills[0].changeInfo = info([stat("hitCount", 1, 2)]);
    const result = buildBalanceComparison(args);
    expect(result.beforeView).toBeNull();
    expect(result.issue).toContain("调整前规则未核验");
    expect(result.afterView.result.selectedResult.status).toBe("exact");
  });

  test.each(["percentage", "absolute"])("保留 %s 生命输入语义，与共享 VM 直接重算一致", (mode) => {
    const args = fixture();
    args.enabled = false;
    args.customStats = { defender: { beta: { hp: 200 } } };
    args.customEnabled = { defender: { beta: true } };
    // HealthInput stores both values for either unit, so the Web-only input
    // mode is required to disambiguate how a changed maximum HP is applied.
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
    expect(result.afterView.result.defenderHp).toBe(mode === "percentage" ? Math.round(result.afterView.sides.defender.panelStats.hp * 0.25) : 100);
    expect(result.afterView.sides.defender.health.maxHp).toBeGreaterThan(result.beforeView.sides.defender.health.maxHp);
    expect(args.state.directions.forward.currentHp).toBe(100);
  });

  test.each(["trait", "mechanic", "learnset", "new"])("所选实体 %s 无旧规则时阻断前后对比，保留当前普通计算", (kind) => {
    const args = fixture();
    args.snapshot.spirits[0].changeInfo = info([{ kind, label: "未核验变化", before: "旧", after: "新" }], kind === "new" ? { isNew: true } : {});
    const result = buildBalanceComparison(args);
    expect(result.beforeView).toBeNull();
    expect(result.issue).toBeTruthy();
    expect(result.afterView.result.selectedResult.status).toBe("exact");
  });

  test("已获得/复制的特性也按其原始拥有者改动记录阻断", () => {
    const args = fixture();
    args.snapshot.traits = [{ id: "moon", name: "铭记于月亮" }, { id: "changed", name: "变化特性" }];
    args.snapshot.spirits[0].traitIds = ["moon"];
    args.snapshot.spirits[0].changeInfo = undefined;
    args.snapshot.spirits[1].changeInfo = info([{ kind: "trait", label: "特性·变化特性", before: "旧", after: "新" }]);
    args.state.sides.defender.spiritId = "alpha";
    args.state.sides.attacker.acquiredTraitIds = ["changed"];
    const result = buildBalanceComparison(args);
    expect(result.beforeView).toBeNull();
    expect(result.issue).toContain("调整前规则未核验");
  });

  test("继承特性匹配官方名称；四技能模式不拿单技能页的旧选择阻断", () => {
    const args = fixture();
    args.snapshot.spirits[0].changeInfo = undefined;
    args.snapshot.spirits[0].baseName = "棋契陛下";
    args.snapshot.spirits[0].variantName = "棋绮后分支";
    args.snapshot.traits = [{
      id: "official-penetration", name: "渗透",
      changeInfo: info([{ kind: "mechanic", field: "description", label: "特性机制", before: "旧", after: "新" }]),
    }];
    expect(buildBalanceComparison(args).issue).toContain("调整前规则未核验");
    args.snapshot.spirits[0].baseName = "普通";
    args.snapshot.skills[0].changeInfo = info([{ kind: "mechanic", label: "旧规则", before: "旧", after: "新" }]);
    for (const side of Object.values(args.state.sides)) side.skills.four = ["unchanged", null, null, null];
    const result = buildBalanceComparison(args);
    expect(result.issue).toBeNull();
    expect(result.changes).toEqual([]);
  });

  test("战斗形态草稿按 resolved ID 隔离，保留来源属性和特性", () => {
    const args = fixture();
    args.enabled = false;
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

  test("国际服限制及不兼容版本仍由共享引擎拒绝，未改环境元数据", () => {
    const args = fixture();
    args.snapshot.meta = { ...args.snapshot.meta, serverId: "global", placeholderSource: "cn" };
    args.state.serverId = "global";
    args.customStats = { attacker: { alpha: { physicalAttack: 200 } } };
    args.customEnabled = { attacker: { alpha: true } };
    const result = buildBalanceComparison(args);
    expect(result.afterView.configurationReady).toBe(false);
    expect(result.afterView.result).toBeNull();
    expect(result.beforeView).toBeNull();
    expect(args.snapshot.meta.serverId).toBe("global");
    args.snapshot.meta.serverId = "cn";
    args.state.serverId = "cn";
    const incompatible = buildBalanceComparison(args);
    expect(incompatible.afterView.result.selectedResult).toMatchObject({ status: "unsupported", totalDamage: null });
  });

  test("零旧伤害不产生无限增长，HP 占比百分点独立于伤害百分比", () => {
    expect(damageDelta(0, 10)).toEqual({ difference: 10, percent: null, hpPercentPoints: null });
    expect(damageDelta(0, 0)?.percent).toBe(0);
    expect(damageDelta({ totalDamage: 50, hpPercent: 10 }, { totalDamage: 60, hpPercent: 15 })).toEqual({ difference: 10, percent: 20, hpPercentPoints: 5 });
    expect(damageDelta(null, 10)).toBeNull();
  });
});
