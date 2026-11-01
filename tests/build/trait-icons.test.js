import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createTraitIconLookup, createTraitIconPlan, resolveTraitIconUrls } from "../../scripts/bwiki/sync-trait-icons.mjs";
import { getTraitIconUrl } from "../../src/data/trait-icons.js";

const evidence = { moduleSources: { Skills: [{ title: "模块:Pets/data/Skills", revision: 20323 }] },
  modules: { Skills: { source: { name: "特性甲", category: "特性", icon: "Feature_123.png", desc: "新版描述" } } } };

describe("BWIKI trait icons stay separate from seasonal rules", () => {
  it("binds existing identities without changing old or localized text", () => {
    const trait = { id: "global:trait-a", reference: { sourceId: "trait-a" }, name: "特性甲", description: "旧版描述" };
    const before = structuredClone(trait);
    const plan = createTraitIconPlan(evidence, [{ traits: [trait] }]);
    expect(trait).toEqual(before);
    expect(plan.bindings).toHaveLength(1);
    const lookup = createTraitIconLookup({ ...plan, assets: plan.assets.map(asset => ({ ...asset, sourceUrl: "https://patchwiki.biligame.com/icon.png", bytes: 12 })) });
    expect(lookup.ids["global:trait-a"]).toBe("/assets/traits/Feature_123.png");
    expect(lookup.ids["trait-a"]).toBe(lookup.ids["global:trait-a"]);
    expect(JSON.stringify(lookup)).not.toContain("描述");
  });

  it("does not invent icons for unknown candidates or pick conflicting same-name files", () => {
    const plan = createTraitIconPlan(evidence, [{ traits: [{ id: "pending", name: "特性待确认" }] }]);
    expect(plan.bindings).toEqual([]);
    expect(plan.assets).toEqual([]);
    expect(plan.missing).toEqual([{ id: "pending", name: "特性待确认" }]);
    expect(() => createTraitIconPlan({ ...evidence, modules: { Skills: { ...evidence.modules.Skills,
      conflict: { category: "特性", name: "特性甲", icon: "Feature_456.png" } } } }, [])).toThrow("同名特性图标冲突");
  });

  it("uses the public MediaWiki POST API and records unavailable images", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({ query: { pages: [
      { title: "文件:Feature 123.png", imageinfo: [{ url: "https://patchwiki.biligame.com/icon.png", width: 256, height: 256 }] },
      { title: "文件:Feature 456.png", missing: true },
    ] } }) }));
    const rows = await resolveTraitIconUrls([{ sourceFile: "Feature_123.png" }, { sourceFile: "Feature_456.png" }], { fetchImpl });
    expect(fetchImpl.mock.calls[0][1].method).toBe("POST");
    expect(rows[0].sourceUrl).toBe("https://patchwiki.biligame.com/icon.png");
    expect(rows[1].unavailable).toBe(true);
  });

  it("keeps existing Abu art and resolves translated traits by stable identity", () => {
    expect(getTraitIconUrl({ id: "abu", name: "圣龙的心愿", iconUrl: "/assets/traits/candymo-s5-200328.png" })).toBe("/assets/traits/candymo-s5-200328.png");
    for (const mount of ["/pre", "/global-assets"]) {
      const iconUrl = `${mount}/assets/traits/candymo-s5-200328.png`;
      expect(getTraitIconUrl({ id: "abu", iconUrl })).toBe(iconUrl);
    }
    for (const iconUrl of ["https://example.com/assets/traits/fake.png", "//example.com/assets/traits/fake.png", "/assets/traits/../fake.png", "/pre/assets/traits/%2e%2e/fake.png"]) {
      expect(getTraitIconUrl({ id: "unknown", iconUrl })).toBe("");
    }
    expect(getTraitIconUrl({ id: "trait_102e1d7085a2c40b", name: "Localized title" })).toMatch(/^\/assets\/traits\/Feature_\d+\.png$/u);
    expect(getTraitIconUrl({ id: "unknown", name: "特性待确认" })).toBe("");
  });

  it("ships every bound image locally with real source dimensions", () => {
    const root = path.resolve(import.meta.dirname, "../..");
    const plan = JSON.parse(readFileSync(path.join(root, "data/reviewed/nrc-trait-icons.json"), "utf8"));
    expect(plan.assets.length).toBeGreaterThan(0);
    for (const asset of plan.assets) {
      expect(asset.sourceUrl).toMatch(/^https:\/\/patchwiki\.biligame\.com\//u);
      expect(asset.width).toBeGreaterThan(0);
      expect(asset.height).toBeGreaterThan(0);
      expect(existsSync(path.join(root, "public", asset.localUrl))).toBe(true);
    }
    const snapshot = JSON.parse(readFileSync(path.join(root, "public/data/global-runtime.json"), "utf8"));
    for (const trait of snapshot.traits) expect(getTraitIconUrl(trait), trait.name).toBeTruthy();
  });
});
