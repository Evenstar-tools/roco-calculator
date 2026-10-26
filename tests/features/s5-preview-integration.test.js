import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import catalog from "../../data/candidates/s5-preview-new-spirits.json";
import { createSpiritSearchIndex } from "../../src/data/search-index.js";
import { withCalculatorExtras } from "../../src/data/snapshot-extras.js";
import { withWebPreview } from "../../src/features/s5-preview/with-web-preview.js";
import { S5_PREVIEW_MECHANICS } from "../../src/features/s5-preview/mechanics.js";

test("真实视频目录逐项进入原搜索，机制与剪影都有接续入口，未修改正式资料", () => {
  const current = JSON.parse(readFileSync("public/data/runtime.json", "utf8"));
  const original = structuredClone(current);
  const existingWeb = withCalculatorExtras(current);
  const result = withWebPreview(current);
  expect(current).toEqual(original);
  expect(result.meta).toBe(current.meta);
  const index = createSpiritSearchIndex(result.spirits);
  expect(catalog.entries.filter(({ kind }) => kind === "family")).toHaveLength(13);
  expect(catalog.entries.filter(({ kind }) => kind === "boss")).toHaveLength(4);
  for (const entry of catalog.entries) {
    expect(S5_PREVIEW_MECHANICS).toHaveProperty(entry.mechanicKey);
    const spirit = index.search(entry.name).find(({ fullName }) => fullName === entry.name);
    expect(spirit).toMatchObject({
      fullName: entry.name, raceStats: null, calculationStatus: "pending-race-stats",
      types: [], dexNo: null,
      previewIdentity: { key: entry.key, mechanicKey: entry.mechanicKey, formalIdPending: true },
    });
    expect(result.learnsets.find(({ spiritId }) => spiritId === spirit.id)?.skillIds).toEqual([]);
    expect(result.traits.find(({ id }) => spirit.traitIds.includes(id))?.description).toBe(entry.traitSummary);
    const asset = readFileSync(`public${spirit.assetUrl}`);
    if (spirit.assetUrl.endsWith(".png")) {
      expect(asset.subarray(1, 4).toString()).toBe("PNG");
      expect([asset.readUInt32BE(16), asset.readUInt32BE(20)]).toEqual([128, 128]);
    } else {
      expect(asset.toString("utf8")).toContain("<svg");
    }
  }
  for (const base of ["冰钻布鲁斯", "琉璃水母"]) {
    expect(index.search(base).filter(({ baseName }) => baseName === base)).toHaveLength(2);
    expect(result.spirits.find(({ fullName }) => fullName === base))
      .toEqual(existingWeb.spirits.find(({ fullName }) => fullName === base));
  }
  expect(withWebPreview(result)).toBe(result);
});
