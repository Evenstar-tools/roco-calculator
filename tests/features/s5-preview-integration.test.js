import { readFileSync } from "node:fs";
import { afterEach, expect, test, vi } from "vitest";
import catalog from "../../data/candidates/s5-preview-new-spirits.json";
import { createSpiritSearchIndex } from "../../src/data/search-index.js";
import { withCalculatorExtras } from "../../src/data/snapshot-extras.js";
import { withWebPreview } from "../../src/features/s5-preview/with-web-preview.js";
import { S5_PREVIEW_MECHANICS } from "../../src/features/s5-preview/mechanics.js";
import { S5_PREVIEW_TEST_STATS, s5PreviewIds } from "../../src/features/s5-preview/catalog.js";
import { getS5PreviewTraitInputs, getS5PreviewTraitEvaluation } from "../../src/domain/s5-preview-traits.js";
import { applyS5SeasonAnnouncement } from "../../src/features/s5-preview/season-announcement.js";

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

test("真实来源目录逐项进入原搜索，机制与图片都有接续入口，未修改正式资料", () => {
  const current = JSON.parse(readFileSync("public/data/runtime.json", "utf8"));
  const original = structuredClone(current);
  const existingWeb = applyS5SeasonAnnouncement(withCalculatorExtras(current));
  const result = withWebPreview(current);
  expect(current).toEqual(original);
  expect(result.meta).toBe(current.meta);
  const index = createSpiritSearchIndex(result.spirits);
  expect(catalog.entries.filter(({ kind }) => kind === "family")).toHaveLength(28);
  expect(catalog.entries.filter(({ kind }) => kind === "boss")).toHaveLength(3);
  for (const entry of catalog.entries) {
    expect(S5_PREVIEW_MECHANICS).toHaveProperty(entry.mechanicKey);
    const spirit = index.search(entry.name).find(({ fullName }) => fullName === entry.name);
    expect(spirit).toMatchObject({
      fullName: entry.name, raceStats: entry.raceStats === undefined ? S5_PREVIEW_TEST_STATS : entry.raceStats,
      calculationStatus: entry.raceStats === null ? "pending-race-stats" : "pending-s5-mechanics",
      types: entry.types ?? [], dexNo: null,
      previewIdentity: { key: entry.key, mechanicKey: entry.mechanicKey, formalIdPending: true, raceStatsPlaceholder: entry.raceStats === undefined },
    });
    expect(result.learnsets.find(({ spiritId }) => spiritId === spirit.id)?.skillIds).toEqual([...(entry.skills ?? []), ...(entry.officialSkillRefs ?? [])].map(skill => skill.id));
    expect(result.traits.find(({ id }) => spirit.traitIds.includes(id))?.description).toBe(entry.traitSummary);
    expect(result.traits.find(({ id }) => spirit.traitIds.includes(id))?.provenance.previewStatus.adaptationStatus).toBe("description-only");
    const asset = readFileSync(`public${spirit.assetUrl}`);
    if (spirit.assetUrl.endsWith(".png")) {
      expect(asset.subarray(1, 4).toString()).toBe("PNG");
      expect(Math.max(asset.readUInt32BE(16), asset.readUInt32BE(20))).toBe(128);
    } else {
      expect(asset.toString("utf8")).toContain("<svg");
    }
  }
  for (const base of ["冰钻布鲁斯", "琉璃水母"]) {
    expect(index.search(base).filter(({ baseName }) => baseName === base)).toHaveLength(2);
    const originalBase = existingWeb.spirits.find(({ fullName }) => fullName === base);
    expect(result.spirits.find(({ fullName }) => fullName === base)).toEqual(originalBase);
  }
  expect(withWebPreview(result)).toBe(result);
  expect(result.spirits.filter(({ previewIdentity }) => previewIdentity?.raceStatsPlaceholder)
    .map(({ previewIdentity }) => previewIdentity.key).sort())
    .toEqual(catalog.entries.filter(entry => entry.raceStats === undefined).map(entry => entry.key).sort());
  for (const spirit of current.spirits.filter(({ changeInfo }) => changeInfo?.isNew && changeInfo.patch?.id?.startsWith("s4-"))) {
    const currentSpirit = result.spirits.find(({ id }) => id === spirit.id);
    expect(currentSpirit.changeInfo?.isNew).not.toBe(true);
    expect([currentSpirit.changeInfo, ...(currentSpirit.changeInfo?.history ?? [])]
      .some(record => record.patch.id === spirit.changeInfo.patch.id && JSON.stringify(record.items) === JSON.stringify(spirit.changeInfo.items))).toBe(true);
    expect(currentSpirit.raceStats).toEqual(existingWeb.spirits.find(({ id }) => id === spirit.id).raceStats);
    expect(spirit.changeInfo.isNew).toBe(true);
  }
});

test("/pre/生产模式保留每个已绑定剪影及其来源，不回退通用问号", async () => {
  vi.stubEnv("MODE", "pre");
  vi.stubEnv("BASE_URL", "/pre/");
  vi.resetModules();
  const { withWebPreview: withPre } = await import("../../src/features/s5-preview/with-web-preview.js");
  const current = JSON.parse(readFileSync("public/data/runtime.json", "utf8"));
  const result = withPre(current);
  const index = createSpiritSearchIndex(result.spirits);
  for (const entry of catalog.entries) {
    const spirit = index.search(entry.name).find(({ fullName }) => fullName === entry.name);
    const expected = `/pre${entry.asset?.localUrl ?? "/assets/spirits/s5-preview-silhouette.svg"}`;
    expect(spirit.assetUrl, entry.key).toBe(expected);
    if (entry.asset) {
      expect(spirit.previewIdentity.asset).toEqual(entry.asset);
      const png = readFileSync(`public${entry.asset.localUrl}`);
      expect(png.subarray(1, 4).toString()).toBe("PNG");
      expect(Math.max(png.readUInt32BE(16), png.readUInt32BE(20))).toBe(128);
    }
    if (entry.raceStats === null) expect(spirit.raceStats).toBeNull();
    else expect(spirit.raceStats).toMatchObject(entry.raceStats ?? S5_PREVIEW_TEST_STATS);
    expect(spirit.calculationStatus).toBe(entry.raceStats === null ? "pending-race-stats" : "pending-s5-mechanics");
  }
});

test("视频比较提及的千棘盔首领不是S5新增，沿用已有千棘海针及磨损分支", () => {
  const current = JSON.parse(readFileSync("public/data/runtime.json", "utf8"));
  const original = structuredClone(current);
  const result = withWebPreview(current);
  const index = createSpiritSearchIndex(result.spirits);
  expect(catalog.entries.some(({ key }) => key === "boss-thousand-spikes")).toBe(false);
  expect(S5_PREVIEW_MECHANICS).not.toHaveProperty("boss-thousand-spikes");
  expect(result.spirits.some(({ id, fullName }) =>
    id === "spirit_preview_s5_boss-thousand-spikes" || fullName === "千棘盔（首领化）")).toBe(false);
  for (const id of ["spirit_786924cd03526ca4", "spirit_dbf6e5118a0b051e"]) {
    const formal = current.spirits.find(spirit => spirit.id === id);
    expect(formal.stage).toBe("首领");
    expect(result.spirits.find(spirit => spirit.id === id)).toEqual(formal);
    const found = index.search(formal.fullName).find(spirit => spirit.id === id);
    expect(found).not.toHaveProperty("previewIdentity");
    expect(found.changeInfo?.isNew).not.toBe(true);
    expect(found.traitName).toBe("溶解腐蚀");
  }
  expect(result.traits.find(({ id }) => id === "trait_40aa89d1be037fd7"))
    .toEqual(current.traits.find(({ id }) => id === "trait_40aa89d1be037fd7"));
  expect(result.learnsets.filter(({ spiritId }) => spiritId === "spirit_786924cd03526ca4"))
    .toEqual(current.learnsets.filter(({ spiritId }) => spiritId === "spirit_786924cd03526ca4"));
  expect(current).toEqual(original);
});

test("阿布三形态保留稳定身份与图片证据，共用已核验S5机制且不补猜正式资料", () => {
  const current = JSON.parse(readFileSync("public/data/runtime.json", "utf8"));
  const result = withWebPreview(current);
  const index = createSpiritSearchIndex(result.spirits);
  const saintId = s5PreviewIds("boss-abu").spiritId;
  expect(index.search("圣龙阿布").find(({ id }) => id === saintId)).toMatchObject({
    fullName: "圣龙阿布", baseName: "阿布", stage: "首领",
    previewIdentity: { key: "boss-abu", mechanicKey: "abu" },
  });
  expect(result.spirits.some(({ fullName }) => fullName === "阿布（首领化）")).toBe(false);
  const superEntry = catalog.entries.find(({ key }) => key === "super-abu");
  expect(superEntry.traitSummary).toBe(catalog.entries.find(({ key }) => key === "abu").traitSummary);
  expect(superEntry.mechanicKey).toBe("abu");
  expect(superEntry.evidence).toEqual({
    kind: "official-image", url: "https://www.taptap.cn/moment/662643409994908648", frame: "abu-official-intro-3.jpg",
  });
  expect(superEntry.evidence).not.toHaveProperty("seconds");
  expect(superEntry).not.toHaveProperty("asset");
  const superSpirit = result.spirits.find(({ id }) => id === s5PreviewIds("super-abu").spiritId);
  expect(superSpirit.raceStats).toEqual(S5_PREVIEW_TEST_STATS);
  expect(result.learnsets.find(({ spiritId }) => spiritId === superSpirit.id).skillIds).toEqual([]);
  const superTrait = result.traits.find(({ id }) => superSpirit.traitIds.includes(id));
  expect(superTrait.description).toBe(superEntry.traitSummary);
  expect(superTrait.provenance.previewStatus.adaptationStatus).toBe("description-only");
  expect(superTrait).not.toHaveProperty("ruleId");
  for (const key of ["abu", "boss-abu", "super-abu"]) {
    const entity = result.traits.find(({ id }) => id === s5PreviewIds(key).traitId);
    expect(entity.previewIdentity.mechanicKey).toBe("abu");
    expect(getS5PreviewTraitInputs(entity)).toEqual(getS5PreviewTraitInputs(superTrait));
    expect(getS5PreviewTraitEvaluation(entity)).toMatchObject({ mechanicKey: "abu", currentLevel: 60, calcStatus: "ready" });
  }
  const abuEntry = catalog.entries.find(({ key }) => key === "abu");
  expect(abuEntry.asset.kind).toBe("official-portrait");
  expect(abuEntry.asset.localUrl).toBe("/assets/spirits/s5-preview/abu.png");
  expect(result.spirits.find(({ id }) => id === s5PreviewIds("abu").spiritId).previewIdentity.asset.kind).toBe("official-portrait");
});


test("原占位属性按官方图纠正并分开来源，未列圣龙阿布不从同族猜测", () => {
  const expected = {
    冥古龙: ["幽", "龙"], 阿布: ["龙"], 超能阿布: ["龙"], 地绡银龙: ["地"], 龙嵴金脉: ["电"],
    "冰钻布鲁斯（首领化）": ["冰"], "琉璃水母（首领化）": ["水", "毒"],
    鲸羽: ["幻", "冰"], 豆粒鹅: ["冰"], 西瓜虫: ["虫", "草"], 滴溜豚: ["毒", "幻"], 乐乐鲨: ["水"],
    蛋包蛋: ["普通", "萌"], 蟹蟹椰: ["水", "草"], 小剪影: ["幽"], 铃兰: ["草", "萌"],
  };
  const current = JSON.parse(readFileSync("public/data/runtime.json", "utf8"));
  const result = withWebPreview(current);
  const typed = result.spirits.filter(spirit => spirit.previewIdentity && spirit.types.length);
  expect(typed).toHaveLength(30);
  for (const [name, types] of Object.entries(expected)) {
    const spirit = result.spirits.find(entry => entry.fullName === name);
    expect(spirit.types, name).toEqual(types);
    const official = catalog.entries.find(entry => entry.name === name)?.typesProvenance?.authority === "official-image";
    if (official) {
      expect(spirit.previewIdentity.typesProvenance.authority).toBe("official-image");
      expect(["verified", "reviewed"]).toContain(spirit.previewIdentity.typesProvenance.reviewStatus);
    } else {
      expect(spirit.previewIdentity.typesProvenance).toMatchObject({ authority: "user-provided", reviewStatus: "pending" });
    }
  }
  expect(result.spirits.find(spirit => spirit.fullName === "圣龙阿布").types).toEqual([]);
  expect(current.spirits.some(spirit => spirit.previewIdentity)).toBe(false);
});
