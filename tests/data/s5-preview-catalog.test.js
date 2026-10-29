import { describe, expect, test } from "vitest";
import { buildCalculatorViewModel } from "../../src/domain/calculator-view-model.js";
import { createSpiritSearchIndex } from "../../src/data/search-index.js";
import {
  createReviewedS5PreviewIdMap, s5PreviewIds, validateS5PreviewCatalog,
  withS5PreviewCatalog,
} from "../../src/features/s5-preview/catalog.js";

// Synthetic evidence and entities validate the overlay contract, not S5 game data.
const stats = { hp: 100, physicalAttack: 100, magicalAttack: 100,
  physicalDefense: 100, magicalDefense: 100, speed: 100, total: 600 };
const entry = (key, name, kind = "family") => ({
  key, name, kind, traitSummary: "视频已说明的机制摘要，数值未知。",
  evidence: { seconds: 12, frame: "evidence/frame-12.jpg" },
  mechanicKey: "fixture-mechanic", unknowns: ["种族值", "属性", "技能学习面"],
});
function fixture() {
  return {
    catalog: { catalogId: "s5-fixture", source: { url: "https://example.com/fixture", bvid: "fixture-video" },
      entries: [entry("family-a", "测试新家族"), { ...entry("boss-a", "测试新首领", "boss"), baseName: "现有精灵" }] },
    snapshot: {
      meta: { id: "s4-fixture", rulesVersion: "s4-fixture-rules", seasonId: "S4" },
      spirits: [{ id: "existing", fullName: "现有精灵", baseName: "现有精灵", types: ["火"],
        raceStats: { ...stats }, traitIds: ["existing-trait"] }],
      traits: [{ id: "existing-trait", name: "既有特性", description: "既有说明" }],
      skills: [], learnsets: [{ spiritId: "existing", skillIds: [] }], typeChart: null,
    },
  };
}

const knownSkill = () => ({ id: "skill_preview_s5_barren-devour", name: "荒芜之噬", type: "龙",
  category: "physical", cost: 5, basePower: 130, description: "造成物伤，若击败敌方，自己等级+20。",
  evidence: { kind: "user-image", frame: "user-skill-card.png" }, acquisition: "专属技能" });

test("首领可按用户确认暂录原六维，重复投影和后续正式数值更新保留身份", () => {
  const { snapshot, catalog } = fixture();
  const options = { useTestRaceStats: true };
  const old = withS5PreviewCatalog(snapshot, catalog, options);
  const boss = catalog.entries[1];
  boss.raceStats = { ...snapshot.spirits[0].raceStats };
  boss.raceStatsEvidence = { kind: "user-confirmed-baseline", baseSpiritId: "existing",
    baseName: boss.baseName, confirmedAt: "2026-10-29", note: "先按原形态六维录入，后续再更新。" };
  const original = structuredClone(snapshot);
  const id = s5PreviewIds(boss.key).spiritId;
  const recorded = withS5PreviewCatalog(old, catalog, options);
  expect(recorded.spirits.find(spirit => spirit.id === id)).toMatchObject({ raceStats: boss.raceStats,
    previewIdentity: { raceStatsPlaceholder: false, raceStatsEvidence: boss.raceStatsEvidence } });
  expect(withS5PreviewCatalog(recorded, catalog, options)).toBe(recorded);
  expect(recorded.learnsets.find(learnset => learnset.spiritId === id).skillIds).toEqual([]);
  boss.raceStats = { ...stats, hp: 120, total: 620 };
  boss.raceStatsEvidence = { kind: "official-image", url: "https://example.com/boss", frame: "boss-official.png" };
  const updated = withS5PreviewCatalog(recorded, catalog, options);
  expect(updated.spirits.find(spirit => spirit.id === id).raceStats.hp).toBe(120);
  expect(withS5PreviewCatalog(updated, catalog, options)).toBe(updated);
  expect(snapshot).toEqual(original);
});

test("暂用原形态数值须有具名首领与明确确认来源，不替普通新精灵补未知值", () => {
  const { catalog } = fixture();
  const boss = catalog.entries[1];
  boss.raceStats = { ...stats };
  const valid = { kind: "user-confirmed-baseline", baseSpiritId: "existing", baseName: boss.baseName,
    confirmedAt: "2026-10-29", note: "用户确认暂用原形态。" };
  for (const invalid of [{}, { ...valid, baseName: "其他精灵" }, { ...valid, baseSpiritId: "" },
    { ...valid, confirmedAt: "" }, { ...valid, note: "" }]) {
    boss.raceStatsEvidence = invalid;
    expect(() => validateS5PreviewCatalog(catalog)).toThrow("六维缺少官方图片或用户确认的原形态来源");
  }
  boss.raceStatsEvidence = valid;
  boss.kind = "family";
  expect(() => validateS5PreviewCatalog(catalog)).toThrow("六维缺少官方图片或用户确认的原形态来源");
});

describe("S5 Web/Windows 展示候选覆盖", () => {
  test("正式特性名与已知专属技能可升级旧空池，稳定ID且不自动配置技能", () => {
    const { snapshot, catalog } = fixture();
    const options = { useTestRaceStats: true };
    const old = withS5PreviewCatalog(snapshot, catalog, options);
    const definition = { ...knownSkill(), iconUrl: "/assets/skills/skill_preview_s5_barren-devour.png" };
    Object.assign(catalog.entries[0], { traitName: "恶龙的奢望", traitSummary: "用户新核对的特性说明。", skills: [definition] });
    const original = structuredClone({ snapshot, catalog, old });
    const fresh = withS5PreviewCatalog(snapshot, catalog, options);
    const upgraded = withS5PreviewCatalog(old, catalog, options);
    const { spiritId, traitId } = s5PreviewIds("family-a");
    for (const result of [fresh, upgraded]) {
      expect(result.spirits.find(spirit => spirit.id === spiritId)).toMatchObject({
        traitName: "恶龙的奢望", traitDescription: catalog.entries[0].traitSummary, traitIds: [traitId],
      });
      expect(result.traits.find(trait => trait.id === traitId)).toMatchObject({ name: "恶龙的奢望", description: catalog.entries[0].traitSummary });
      const skill = result.skills.find(skill => skill.id === definition.id);
      expect(skill).toMatchObject({ id: definition.id, name: definition.name, cost: 5, basePower: 130,
        type: "龙", category: "physical", description: definition.description, iconUrl: definition.iconUrl,
        previewIdentity: { catalogId: catalog.catalogId, key: "family-a", formalIdPending: true, evidence: definition.evidence } });
      expect(skill.previewIdentity.evidence).not.toBe(definition.evidence);
      expect(skill).not.toHaveProperty("calculationStatus");
      expect(skill).not.toHaveProperty("ruleId");
      expect(result.learnsets.find(learnset => learnset.spiritId === spiritId)).toEqual({
        spiritId, skillIds: [definition.id], defaultSkillIds: [], acquisitions: { [definition.id]: ["专属技能"] },
      });
      expect(result.learnsets.find(learnset => learnset.spiritId === s5PreviewIds("boss-a").spiritId).skillIds).toEqual([]);
      expect(withS5PreviewCatalog(result, catalog, options)).toBe(result);
      expect(result.meta).toBe(snapshot.meta);
    }
    expect(upgraded.skills).not.toBe(old.skills);
    expect({ snapshot, catalog, old }).toEqual(original);
  });

  test("技能资料有变化才复制技能集合；学习途径仅在本精灵池中按证据更新", () => {
    const { snapshot, catalog } = fixture();
    const definition = knownSkill(); delete definition.acquisition;
    catalog.entries[0].skills = [definition];
    const initial = withS5PreviewCatalog(snapshot, catalog);
    const spiritId = s5PreviewIds("family-a").spiritId;
    expect(initial.learnsets.find(entry => entry.spiritId === spiritId)).not.toHaveProperty("acquisitions");
    definition.acquisition = "专属技能";
    const learned = withS5PreviewCatalog(initial, catalog);
    expect(learned.skills).toBe(initial.skills);
    expect(learned.learnsets.find(entry => entry.spiritId === spiritId).acquisitions).toEqual({ [definition.id]: ["专属技能"] });
    definition.basePower = 140;
    const updated = withS5PreviewCatalog(learned, catalog);
    expect(updated.skills).not.toBe(learned.skills);
    expect(updated.skills.find(skill => skill.id === definition.id).basePower).toBe(140);
    expect(learned.skills.find(skill => skill.id === definition.id).basePower).toBe(130);
    expect(withS5PreviewCatalog(updated, catalog)).toBe(updated);
    definition.iconUrl = "/assets/skills/skill_preview_s5_barren-devour.png";
    const withIcon = withS5PreviewCatalog(updated, catalog);
    expect(withIcon.skills.find(skill => skill.id === definition.id).iconUrl).toBe(definition.iconUrl);
    expect(withS5PreviewCatalog(withIcon, catalog)).toBe(withIcon);
    definition.iconUrl = "/assets/skills/../unrelated.png";
    expect(() => withS5PreviewCatalog(withIcon, catalog)).toThrow("图标必须使用本技能对应的本地 PNG");
    delete definition.iconUrl;
    catalog.entries[0].skills = [];
    const cleared = withS5PreviewCatalog(updated, catalog);
    expect(cleared.skills).toBe(updated.skills);
    expect(cleared.learnsets.find(entry => entry.spiritId === spiritId)).toEqual({ spiritId, skillIds: [], defaultSkillIds: [] });
  });

  test("完整正式同名技能复用正式ID，不覆盖数值；正式同名精灵不额外注入候选技能", () => {
    const { snapshot, catalog } = fixture();
    const definition = knownSkill();
    catalog.entries[0].skills = [definition];
    catalog.entries[0].traitName = "恶龙的奢望";
    const officialSkill = { ...definition, id: "official-barren-devour", cost: 4, basePower: 150,
      description: "正式资料优先", provenance: { authority: "official" } };
    snapshot.skills.push(officialSkill);
    const result = withS5PreviewCatalog(snapshot, catalog);
    expect(result.skills).toBe(snapshot.skills);
    expect(result.skills[0]).toBe(officialSkill);
    expect(result.skills.some(skill => skill.id === definition.id)).toBe(false);
    expect(result.learnsets.find(entry => entry.spiritId === s5PreviewIds("family-a").spiritId)).toMatchObject({
      skillIds: [officialSkill.id], acquisitions: { [officialSkill.id]: ["专属技能"] }, defaultSkillIds: [],
    });
    expect(withS5PreviewCatalog(result, catalog)).toBe(result);
    snapshot.skills = [];
    const formal = { ...snapshot.spirits[0], id: "formal-family", fullName: catalog.entries[0].name };
    snapshot.spirits.push(formal);
    const formalResult = withS5PreviewCatalog(snapshot, catalog);
    expect(formalResult.spirits.find(spirit => spirit.id === formal.id)).toBe(formal);
    expect(formalResult.skills).toBe(snapshot.skills);
    expect(formalResult.skills).toEqual([]);
    expect(formalResult.traits.some(trait => trait.id === s5PreviewIds("family-a").traitId)).toBe(false);
  });

  test("已知技能拒绝不完整数值/用户证据，候选特性名与学习途径不得为空", () => {
    for (const fields of [{ id: "foreign-id" }, { type: "龙系" }, { category: "unknown" }, { cost: -1 },
      { cost: 5.5 }, { basePower: Number.NaN }, { description: " " }, { evidence: null },
      { evidence: { kind: "user-image", frame: "" } }, { acquisition: " " }]) {
      const { catalog } = fixture();
      catalog.entries[0].skills = [{ ...knownSkill(), ...fields }];
      expect(() => validateS5PreviewCatalog(catalog)).toThrow("S5 前瞻目录");
    }
    for (const traitName of ["", null, 1]) {
      const { catalog } = fixture(); catalog.entries[0].traitName = traitName;
      expect(() => validateS5PreviewCatalog(catalog)).toThrow("特性名无效");
    }
    const { catalog } = fixture(); catalog.entries[0].skills = {};
    expect(() => validateS5PreviewCatalog(catalog)).toThrow("已知技能池无效");
  });

  test("技能ID、同名及旧占位学习池冲突显式拒绝，不覆盖其他资料", () => {
    for (const duplicate of [{ ...knownSkill(), basePower: 131 }, { ...knownSkill(), id: "skill_preview_s5_other" },
      { ...knownSkill(), name: "另一技能" }]) {
      const { catalog } = fixture();
      catalog.entries[0].skills = [knownSkill()]; catalog.entries[1].skills = [duplicate];
      expect(() => validateS5PreviewCatalog(catalog)).toThrow("ID 或名称重复");
    }
    for (const foreign of [
      { ...knownSkill(), name: "其他实体", previewIdentity: { catalogId: "other", key: "family-a", formalIdPending: true } },
      { ...knownSkill(), id: "unreviewed", calculationStatus: "pending-skill-data", previewIdentity: { formalIdPending: true } },
    ]) {
      const { snapshot, catalog } = fixture();
      catalog.entries[0].skills = [knownSkill()]; snapshot.skills.push(foreign);
      const before = structuredClone(snapshot);
      expect(() => withS5PreviewCatalog(snapshot, catalog)).toThrow(/技能 ID 冲突|同名技能/u);
      expect(snapshot).toEqual(before);
    }
    const { snapshot, catalog } = fixture(); catalog.entries[0].skills = [knownSkill()];
    const old = withS5PreviewCatalog(snapshot, catalog);
    old.learnsets.find(entry => entry.spiritId === s5PreviewIds("family-a").spiritId).skillIds.push("foreign-skill");
    expect(() => withS5PreviewCatalog(old, catalog)).toThrow("候选记录已漂移");
  });

  test("用户录入属性接入新旧占位且幂等，正式同名资料不被覆盖", () => {
    const { snapshot, catalog } = fixture();
    const old = withS5PreviewCatalog(snapshot, catalog, { useTestRaceStats: true });
    catalog.entries[0].types = ["幽", "龙"];
    catalog.entries[1].types = ["水"];
    catalog.typesProvenance = { authority: "user-provided", providedAt: "2026-10-27", reviewStatus: "pending" };
    const fresh = withS5PreviewCatalog(snapshot, catalog, { useTestRaceStats: true });
    const upgraded = withS5PreviewCatalog(old, catalog, { useTestRaceStats: true });
    expect(upgraded.spirits.slice(1).map(spirit => spirit.types)).toEqual([["幽", "龙"], ["水"]]);
    expect(upgraded.spirits[1].types).toEqual(fresh.spirits[1].types);
    expect(upgraded.spirits[1].types).not.toBe(catalog.entries[0].types);
    expect(upgraded.spirits[1].previewIdentity.typesProvenance).toEqual(catalog.typesProvenance);
    expect(old.spirits[1].types).toEqual([]);
    expect(withS5PreviewCatalog(upgraded, catalog, { useTestRaceStats: true })).toBe(upgraded);
    const formal = { ...snapshot.spirits[0], id: "formal", fullName: catalog.entries[0].name, types: ["光"] };
    const next = withS5PreviewCatalog({ ...snapshot, spirits: [...snapshot.spirits, formal] }, catalog);
    expect(next.spirits.find(spirit => spirit.id === formal.id)).toBe(formal);
    expect(formal.types).toEqual(["光"]);
  });

  test.each([["幽灵"], ["水", "水"], ["水", "毒", "龙"], "水", null].map(types => ({ types })))("属性 $types 不能静默变成中性或重复属性", ({ types }) => {
    const { catalog } = fixture();
    catalog.entries[0].types = types;
    expect(() => validateS5PreviewCatalog(catalog)).toThrow("属性无效");
  });

  test("用户验收六维100只在显式测试覆盖中使用，正式资料与未知关系保留", () => {
    const { snapshot, catalog } = fixture();
    const original = structuredClone({ snapshot, catalog });
    const pending = withS5PreviewCatalog(snapshot, catalog);
    const options = { useTestRaceStats: true };
    const result = withS5PreviewCatalog(pending, catalog, options);
    for (const candidate of result.spirits.slice(1)) {
      expect(candidate.raceStats).toEqual(stats);
      expect(candidate.calculationStatus).toBe("pending-s5-mechanics");
      expect(candidate.previewIdentity).toMatchObject({ formalIdPending: true, raceStatsPlaceholder: true });
      expect(candidate.types).toEqual([]);
      expect(result.learnsets.find(({ spiritId }) => spiritId === candidate.id)?.skillIds).toEqual([]);
    }
    expect(result.spirits[0]).toBe(snapshot.spirits[0]);
    expect(withS5PreviewCatalog(result, catalog, options)).toBe(result);
    expect({ snapshot, catalog }).toEqual(original);
    expect(pending.spirits[1].raceStats).toBeNull();
    const formal = { ...snapshot.spirits[0], id: "formal", fullName: catalog.entries[0].name,
      raceStats: { ...stats, physicalAttack: 143 } };
    const next = withS5PreviewCatalog({ ...snapshot, spirits: [...snapshot.spirits, formal] }, catalog, options);
    expect(next.spirits.find(({ id }) => id === formal.id)).toBe(formal);
    expect(next.spirits.find(({ id }) => id === formal.id).raceStats.physicalAttack).toBe(143);
  });

  test("保留正式身份和现有实体，候选不继承首领基底数值或学习面", () => {
    const { snapshot, catalog } = fixture();
    const saved = structuredClone({ snapshot, catalog });
    const result = withS5PreviewCatalog(snapshot, catalog);
    expect({ snapshot, catalog }).toEqual(saved);
    expect(result.meta).toBe(snapshot.meta);
    expect(result.skills).toBe(snapshot.skills);
    expect(result.spirits[0]).toBe(snapshot.spirits[0]);
    expect(result.traits[0]).toBe(snapshot.traits[0]);
    for (const candidate of result.spirits.slice(1)) {
      expect(candidate).toMatchObject({ raceStats: null, types: [], dexNo: null,
        calculationStatus: "pending-race-stats", asset: { localUrl: "/assets/spirits/s5-preview-silhouette.svg" } });
      expect(candidate).not.toHaveProperty("previewDefaults");
      expect(result.learnsets.find(({ spiritId }) => spiritId === candidate.id))
        .toEqual({ spiritId: candidate.id, skillIds: [], defaultSkillIds: [] });
    }
    expect(result.spirits[2]).toMatchObject({ stage: "首领", baseName: "现有精灵" });
    expect(result.spirits[1].previewIdentity).toMatchObject({ key: "family-a", formalIdPending: true,
      mechanicKey: "fixture-mechanic", evidence: catalog.entries[0].evidence });
  });

  test("可搜索和使用既有本地头像入口；重复覆盖幂等", () => {
    const { snapshot, catalog } = fixture();
    const result = withS5PreviewCatalog(snapshot, catalog, { assetUrl: "/assets/fixture-silhouette.svg" });
    expect(withS5PreviewCatalog(result, catalog)).toBe(result);
    expect(createSpiritSearchIndex(result.spirits).search("测试新家族")[0])
      .toMatchObject({ id: "spirit_preview_s5_family-a", assetUrl: "/assets/fixture-silhouette.svg" });
    expect(result.traits[1]).toMatchObject({ name: "前瞻特性", description: catalog.entries[0].traitSummary });
  });

  test.each(["reference-silhouette", "official-silhouette", "official-portrait"])("条目%s优先于通用图并保留来源；缺图条目仍用默认占位", (kind) => {
    const { snapshot, catalog } = fixture();
    const generic = withS5PreviewCatalog(snapshot, catalog);
    catalog.entries[0].asset = {
      localUrl: "/assets/spirits/s5-preview/family-a.png", kind,
      sourceUrl: "https://example.com/official-video", sourceFrame: "official/frames/frame-002.jpg",
    };
    const result = withS5PreviewCatalog(snapshot, catalog);
    expect(result.spirits[1].asset.localUrl).toBe(catalog.entries[0].asset.localUrl);
    expect(result.spirits[1].previewIdentity.asset).toEqual(catalog.entries[0].asset);
    expect(result.spirits[1].previewIdentity.asset).not.toBe(catalog.entries[0].asset);
    expect(result.spirits[2].asset.localUrl).toBe("/assets/spirits/s5-preview-silhouette.svg");
    expect(withS5PreviewCatalog(result, catalog)).toBe(result);
    expect(withS5PreviewCatalog(generic, catalog).spirits[1].asset.localUrl).toBe(catalog.entries[0].asset.localUrl);
    expect(generic.spirits[1].asset.localUrl).toBe("/assets/spirits/s5-preview-silhouette.svg");
    snapshot.spirits.push({ ...snapshot.spirits[0], id: "formal", fullName: catalog.entries[0].name,
      asset: { localUrl: "/assets/spirits/formal.png", status: "verified" } });
    const formal = snapshot.spirits[1];
    expect(withS5PreviewCatalog(snapshot, catalog).spirits[1]).toBe(formal);
    expect(formal.asset).toEqual({ localUrl: "/assets/spirits/formal.png", status: "verified" });
    expect(formal).not.toHaveProperty("previewIdentity");
  });

  test("参考剪影拒绝外站、目录逃逸及缺少来源的路径", () => {
    const valid = { localUrl: "/assets/spirits/s5-preview/family-a.png", kind: "reference-silhouette",
      sourceUrl: "https://example.com/official-video", sourceFrame: "frames/frame-002.jpg" };
    for (const localUrl of ["https://example.com/image.png", "//example.com/image.png",
      "/assets/../private.png", "/assets/%2e%2e/private.png", "/assets/spirits\\private.png",
      "/assets/spirits/image.png?external=true", "/other/image.png"]) {
      const { snapshot, catalog } = fixture();
      catalog.entries[0].asset = { ...valid, localUrl };
      expect(() => withS5PreviewCatalog(snapshot, catalog)).toThrow("项目内 assets 路径");
    }
    for (const asset of [{ ...valid, kind: "unknown" }, { ...valid, sourceUrl: "http://example.com/video" },
      { ...valid, sourceUrl: "https://" }, { ...valid, sourceFrame: " " }]) {
      const { catalog } = fixture(); catalog.entries[0].asset = asset;
      expect(() => validateS5PreviewCatalog(catalog)).toThrow("HTTPS 来源及证据帧");
    }
    const { snapshot, catalog } = fixture();
    expect(() => withS5PreviewCatalog(snapshot, catalog, { assetUrl: "//example.com/image.png" }))
      .toThrow("项目内 assets 路径");
  });

  test("选中未知六维候选仍可见，但不能生成面板或伤害", () => {
    const { snapshot, catalog } = fixture();
    const result = withS5PreviewCatalog(snapshot, catalog);
    const direction = () => ({ context: {}, overrides: {}, currentHp: null });
    const side = (spiritId) => ({ spiritId, nature: "neutral", displayIvs: {}, skills: { single: null, four: [null, null, null, null] } });
    const view = buildCalculatorViewModel({ snapshot: result, activeDirection: "forward", state: {
      mode: "four", directions: { forward: direction(), reverse: direction() },
      sides: { attacker: side(s5PreviewIds("family-a").spiritId), defender: side("existing") },
    } });
    expect(view.configurationReady).toBe(false);
    expect(view.configurationIssue).toBe("种族值待确认");
    expect(view.sides.attacker.spirit.fullName).toBe("测试新家族");
    expect(view.sides.attacker.panelStats).toBeNull();
    expect(view.result).toBeNull();
  });

  test("已有同名完整正式实体优先，普通基底不会吞掉首领候选", () => {
    const { snapshot, catalog } = fixture();
    snapshot.spirits.push({ ...snapshot.spirits[0], id: "formal-family", fullName: "测试新家族" });
    const result = withS5PreviewCatalog(snapshot, catalog);
    expect(result.spirits.filter(({ fullName }) => fullName === "测试新家族")).toHaveLength(1);
    expect(result.spirits.some(({ id }) => id === s5PreviewIds("family-a").spiritId)).toBe(false);
    expect(result.spirits.find(({ id }) => id === s5PreviewIds("boss-a").spiritId)?.raceStats).toBeNull();
    expect(result.traits).toHaveLength(2);
    // A reviewed import may retain the exact local candidate IDs.
    const formal = result.spirits.find(({ id }) => id === "formal-family");
    formal.id = s5PreviewIds("family-a").spiritId;
    expect(withS5PreviewCatalog(result, catalog)).toBe(result);
  });

  test("缺少证据、重复 key/名称及生成 ID 冲突均拒绝", () => {
    for (const mutate of [
      (catalog) => { catalog.entries[0].evidence.seconds = null; },
      (catalog) => { catalog.entries[0].evidence.frame = ""; },
      (catalog) => { catalog.entries[1].key = catalog.entries[0].key; },
      (catalog) => { catalog.entries[1].name = catalog.entries[0].name; },
      (catalog) => { catalog.entries[0].key = "../unsafe"; },
    ]) {
      const { catalog } = fixture(); mutate(catalog);
      expect(() => validateS5PreviewCatalog(catalog)).toThrow("S5 前瞻目录");
    }
    const { snapshot, catalog } = fixture();
    snapshot.spirits.push({ id: s5PreviewIds("family-a").spiritId, fullName: "其他实体" });
    expect(() => withS5PreviewCatalog(snapshot, catalog)).toThrow("精灵 ID 冲突");
    snapshot.spirits.pop();
    snapshot.traits.push({ id: s5PreviewIds("family-a").traitId, name: "其他特性" });
    expect(() => withS5PreviewCatalog(snapshot, catalog)).toThrow("特性 ID 冲突");
  });

  test("不将同名未知实体或国际服视为正式国服数据", () => {
    const { snapshot, catalog } = fixture();
    snapshot.spirits.push({ id: "unreviewed", fullName: "测试新家族", raceStats: null });
    expect(() => withS5PreviewCatalog(snapshot, catalog)).toThrow("同名精灵尚未正式确认");
    snapshot.meta.serverId = "global";
    expect(() => withS5PreviewCatalog(snapshot, catalog)).toThrow("仅适用于国服参考快照");
  });

  test("明天的正式映射只接受显式审核表，不按名字猜测或改写存档", () => {
    const { snapshot, catalog } = fixture();
    const saved = structuredClone({ snapshot, catalog });
    const review = { status: "reviewed", catalogId: catalog.catalogId,
      mappings: [{ key: "family-a", spiritId: "existing", traitId: "existing-trait" }] };
    expect(createReviewedS5PreviewIdMap(catalog, snapshot, review)).toEqual({
      catalogId: catalog.catalogId,
      spiritIds: { "spirit_preview_s5_family-a": "existing" },
      traitIds: { "trait_preview_s5_family-a": "existing-trait" },
    });
    expect({ snapshot, catalog }).toEqual(saved);
    expect(() => createReviewedS5PreviewIdMap(catalog, snapshot, { ...review, status: "candidate" })).toThrow("尚未审核");
    expect(() => createReviewedS5PreviewIdMap(catalog, snapshot, { ...review,
      mappings: [{ key: "not-in-evidence", spiritId: "existing" }] })).toThrow("key 未知");
    expect(() => createReviewedS5PreviewIdMap(catalog, snapshot, { ...review,
      mappings: [{ key: "family-a", spiritId: s5PreviewIds("family-a").spiritId }] })).toThrow("尚未确认");
    expect(() => createReviewedS5PreviewIdMap(catalog, snapshot, { ...review,
      mappings: [{ key: "family-a", spiritId: "existing", traitId: "unrelated" }] })).toThrow("不匹配");
    expect(() => createReviewedS5PreviewIdMap(catalog, snapshot, { ...review,
      mappings: [...review.mappings, { key: "boss-a", spiritId: "existing" }] })).toThrow("同一精灵");
  });
});

test("具名官方图片占位使用图片证据，无需伪造视频时间或战斗参数", () => {
  const { snapshot, catalog } = fixture();
  catalog.entries[0].evidence = { kind: "official-image", url: "https://example.com/official-intro", frame: "named-official.jpg" };
  catalog.entries[0].asset = { localUrl: "/assets/spirits/named.png", kind: "official-portrait",
    sourceUrl: "https://example.com/official-intro", sourceFrame: "named-official.jpg" };
  const result = withS5PreviewCatalog(snapshot, catalog);
  expect(result.spirits[1].previewIdentity.evidence).toEqual(catalog.entries[0].evidence);
  expect(result.spirits[1].previewIdentity.evidence).not.toHaveProperty("seconds");
  expect(result.spirits[1].previewIdentity.source).toEqual({ url: catalog.entries[0].evidence.url, authority: "official-image" });
  expect(result.spirits[1].previewIdentity.asset.kind).toBe("official-portrait");
  expect(result.spirits[1].raceStats).toBeNull();
  expect(result.learnsets.find(entry => entry.spiritId === result.spirits[1].id)?.skillIds).toEqual([]);
  for (const evidence of [
    { kind: "official-image", url: "http://example.com/intro", frame: "named.jpg" },
    { kind: "official-image", url: "https://example.com/intro", frame: " " },
  ]) {
    catalog.entries[0].evidence = evidence;
    expect(() => validateS5PreviewCatalog(catalog)).toThrow("官方图片来源及证据图");
  }
});
