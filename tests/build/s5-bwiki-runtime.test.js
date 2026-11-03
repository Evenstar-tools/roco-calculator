// @vitest-environment node
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { buildS5BwikiRuntime } from "../../scripts/s5-bwiki-runtime.mjs";
import { resolveSpiritFormRole } from "../../src/features/team-ability/domain/spirit-form-role.js";
import { withWebPreview } from "../../src/features/s5-preview/with-web-preview.js";
import { getS5PreviewTraitEvaluation, getS5PreviewTraitInputs } from "../../src/domain/s5-preview-traits.js";
import { packS5RuntimeRelations, restoreS5RuntimeRelations } from "../../src/data/s5-runtime-relations.js";
import { loadServerSnapshot } from "../../src/runtime/load-snapshot.js";
import { pruneCnProductionModule } from "../../scripts/cn-production-pruning.mjs";
import { withCalculatorExtras } from "../../src/data/snapshot-extras.js";
import { withPublicResourceUrls } from "../../src/runtime/public-resource-url.js";
import { createSpiritSearchIndex } from "../../src/data/search-index.js";
import { buildCalculatorViewModel } from "../../src/domain/calculator-view-model.js";
import { createInitialState } from "../../src/state/defaults.js";

describe("isolated BWIKI S5 runtime", () => {
  let runtime;
  beforeAll(async () => { runtime = await buildS5BwikiRuntime(); }, 30000);

  it("round-trips all history and learning relations within the runtime payload budget", () => {
    const packed = packS5RuntimeRelations(runtime);
    expect(restoreS5RuntimeRelations(packed)).toEqual(runtime);
    expect(Buffer.byteLength(JSON.stringify(packed))).toBeLessThan(2.5 * 1024 * 1024);
    expect(restoreS5RuntimeRelations(runtime)).toBe(runtime);
  });

  it("restores the transport at the shared loader before the independent deer entry uses it", async () => {
    const loaded = await loadServerSnapshot("cn", { fetcher: async () => ({
      ok: true, json: async () => packS5RuntimeRelations(runtime),
    }) });
    expect(loaded).toEqual(runtime);
    expect(loaded.learnsets.every(pool => pool.skillIds.every(id => typeof id === "string"))).toBe(true);
  });

  it("serves reviewed values and art under existing preview identities", () => {
    expect(runtime.meta.s5NrcSync.complete).toBe(true);
    expect(runtime.meta.seasonId).toBe("S5");
    expect(runtime.meta.catalogVersion).toBe(runtime.meta.s5NrcSync.version);
    expect(runtime.meta.id).toBe("s4-2026-09-10");
    const bruce = runtime.spirits.find(spirit => spirit.fullName === "圣冠布鲁斯");
    expect(bruce.id).toBe("spirit_preview_s5_boss-ice-bruce");
    // Live S5 roster revision 20305 and both rendered species pages agree.
    expect(bruce.raceStats).toEqual({ hp: 73, physicalAttack: 103, magicalAttack: 28,
      physicalDefense: 114, magicalDefense: 88, speed: 90, total: 496 });
    const monarch = runtime.spirits.find(spirit => spirit.fullName === "琉璃君主");
    expect(monarch.id).toBe("spirit_preview_s5_boss-glass-jellyfish");
    expect(monarch.raceStats).toEqual({ hp: 141, physicalAttack: 40, magicalAttack: 89,
      physicalDefense: 93, magicalDefense: 136, speed: 95, total: 594 });
    for (const spirit of [bruce, monarch]) {
      expect(spirit.previewIdentity.raceStatsPlaceholder).toBe(false);
      expect(spirit.previewIdentity.raceStatsEvidence).toMatchObject({ kind: "bwiki-season", revision: 20305 });
      expect(withWebPreview(runtime).spirits.find(entry => entry.id === spirit.id).raceStats).toEqual(spirit.raceStats);
    }
    expect(bruce.asset.localUrl).toContain("/assets/spirits/s5-preview/");
    expect(runtime.traits.find(trait => bruce.traitIds.includes(trait.id)).previewIdentity.mechanicKey)
      .toBe("boss-ice-bruce");
  });

  it.each(["/", "/pre/"])("%s production transport equals the full hidden overlay including evidence and blocked calculations", base => {
    const packed = packS5RuntimeRelations(runtime);
    const legacy = withPublicResourceUrls(withWebPreview(packed), base);
    const hidden = runtime.spirits.filter(spirit => spirit.previewIdentity?.catalogId === "candymo-hidden-20261101");
    expect(hidden).toHaveLength(27);
    for (const spirit of hidden) {
      const expected = legacy.spirits.find(entry => entry.id === spirit.id);
      expect(spirit.previewIdentity).toEqual(expected.previewIdentity);
      expect(spirit.previewIdentity.source).toMatchObject({ authority: "third-party-hidden" });
      expect(spirit.raceStats).toBeNull();
      expect(spirit.calculationStatus).toBe("pending-race-stats");
      expect(runtime.learnsets.find(pool => pool.spiritId === spirit.id).skillIds).toEqual([]);
      expect(resolveSpiritFormRole(spirit).formRoleStatus).not.toBe("verified");
    }
    const file = "src/features/s5-preview/with-web-preview.js";
    const result = pruneCnProductionModule(readFileSync(file, "utf8"), `D:/project/${file}`, { reviewedS5: true });
    const compile = result.replace(/^import .*;\n/gmu, "").replace("export function", "function") + "\nreturn withWebPreview;";
    const apply = new Function("restoreS5RuntimeRelations", "withCalculatorExtras", "withPublicResourceUrls", compile)(
      restoreS5RuntimeRelations, withCalculatorExtras, value => withPublicResourceUrls(value, base),
    );
    const production = apply(packed);
    expect(production).toEqual(legacy);
    const index = createSpiritSearchIndex(production.spirits);
    for (const spirit of hidden) {
      expect(index.search(spirit.fullName).find(entry => entry.id === spirit.id))
        .toMatchObject(withPublicResourceUrls(spirit, base));
    }
    const portrait = production.spirits.find(spirit => spirit.fullName === "呼拉猫");
    expect(portrait.asset.localUrl).toBe(`${base}assets/spirits/candymo-hidden/3217.png`);
    expect(portrait.previewIdentity.asset).toEqual(hidden.find(spirit => spirit.id === portrait.id).previewIdentity.asset);
    expect(portrait.previewIdentity.asset.localUrl).toBe("/assets/spirits/candymo-hidden/3217.png");
    for (const side of ["attacker", "defender"]) {
      const state = createInitialState(production);
      state.sides[side].spiritId = portrait.id;
      const view = buildCalculatorViewModel({ snapshot: production, state, activeDirection: "forward" });
      expect(view.sides[side].spirit.id).toBe(portrait.id);
      expect(view.sides[side].panelStats).toBeNull();
      expect(view.configurationReady).toBe(false);
      expect(view.configurationIssue).toBe("种族值待确认");
      expect(view.result).toBeNull();
    }
  });

  it("retains rank eligibility and newly published learning methods after compaction", () => {
    const spirit = runtime.spirits.find(entry => entry.fullName === "地绡银龙");
    expect(resolveSpiritFormRole(spirit).formRole).toBe("final");
    const pool = runtime.learnsets.find(entry => entry.spiritId === spirit.id);
    const skill = runtime.skills.find(entry => entry.name === "碎银");
    expect(pool.skillIds).toContain(skill.id);
    expect(pool.acquisitionsPartial).toBe(true);
    expect(pool.acquisitions[skill.id].length).toBeGreaterThan(0);
    expect(runtime.spirits.some(entry => entry.fullName === "阿布")).toBe(true);
  });

  it.each(["魔力猫", "圣光迪莫", "爵士鹿"])("retains %s's calculator wish skills after replacing the source learning pool", name => {
    const spirit = runtime.spirits.find(entry => entry.fullName === name);
    const pool = runtime.learnsets.find(entry => entry.spiritId === spirit.id);
    expect(pool.skillIds.some(id => runtime.skills.find(skill => skill.id === id)?.name.startsWith("愿力冲击"))).toBe(true);
    expect(withWebPreview(runtime).learnsets.find(entry => entry.spiritId === spirit.id).skillIds).toEqual(pool.skillIds);
  });

  it.each([["滴溜豚", 6], ["滴廿豚", 20]])("keeps %s's distinct die and published effect rows", (name, faces) => {
    const spirit = runtime.spirits.find(entry => entry.fullName === name);
    const trait = runtime.traits.find(entry => spirit.traitIds.includes(entry.id));
    expect(trait.description).toContain(`1~${faces}点`);
    expect(trait.effectDetails.rows).toHaveLength(faces);
    const controls = getS5PreviewTraitInputs(trait, "attacker");
    const context = Object.fromEntries(controls.map(control => [control.id,
      control.contextKey.endsWith("DiceRolled") ? true : 2]));
    expect(getS5PreviewTraitEvaluation(trait, "attacker", context).calcStatus).not.toBe("pending");
  });
});
