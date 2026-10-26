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

describe("S5 Web/Windows 展示候选覆盖", () => {
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

  test("条目参考剪影优先于通用图并保留来源；缺图条目仍用默认占位", () => {
    const { snapshot, catalog } = fixture();
    const generic = withS5PreviewCatalog(snapshot, catalog);
    catalog.entries[0].asset = {
      localUrl: "/assets/spirits/s5-preview/family-a.png", kind: "reference-silhouette",
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
    for (const asset of [{ ...valid, sourceUrl: "http://example.com/video" },
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
