// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { applyS5Bwiki } from "../../scripts/bwiki/apply-s5-bwiki.mjs";
import { withWebPreview } from "../../src/features/s5-preview/with-web-preview.js";
import { chooseDefaultSkillIds } from "../../src/domain/skill-loadout.js";

const read = file => JSON.parse(readFileSync(file, "utf8"));
const evidence = read("data/reviewed/nrc-s5-20261101.json");
const original = withWebPreview(read("data/snapshots/current.json"));
const result = applyS5Bwiki(original, evidence);
const findSpirit = (snapshot, name) => snapshot.spirits.find(spirit => spirit.fullName === name);
const pool = (snapshot, name) => snapshot.learnsets.find(entry => entry.spiritId === findSpirit(snapshot, name).id);
const sourceSpirit = name => Object.values(evidence.modules.Catalog).find(spirit => spirit.title === name);
const ownerTrait = (snapshot, name) => snapshot.traits.find(trait => trait.id === findSpirit(snapshot, name).traitIds[0]);

describe("complete S5 BWIKI build overlay", () => {
  test("画龙点睛按用户确认为无威力状态技能，保留BWIKI原始85威力证据", () => {
    const raw = Object.values(evidence.modules.Skills).find(skill => skill.name === "画龙点睛");
    const skill = result.skills.find(entry => entry.name === "画龙点睛");
    expect(raw.power).toBe(85);
    expect(skill).toMatchObject({ category: "status", basePower: null, cost: 1 });
    expect(skill.provenance.s5UserCorrection).toMatchObject({ sourceValue: 85, value: null });
    expect(result.learnsets.some(pool => pool.skillIds.includes(skill.id))).toBe(true);
  });
  test("covers every source entity and keeps S4 release identity, input snapshot, and repeated imports stable", () => {
    expect(result.meta.id).toBe(original.meta.id);
    expect(result.meta.rulesVersion).toBe(original.meta.rulesVersion);
    expect(result.meta.s5NrcSync).toMatchObject({ complete: true, version: "s5-2026-10-31",
      counts: { spirits: 660, skills: 607, traitRecords: 260, addedSpirits: 27, addedSkills: 28, addedTraits: 14 } });
    expect(result.spirits.filter(spirit => Object.hasOwn(evidence.modules.Catalog, spirit.provenance?.nrc?.id))).toHaveLength(660);
    const skillSources = new Set([...result.skills, ...result.traits]
      .flatMap(entity => entity.provenance?.nrc?.sourceIds ?? entity.provenance?.nrc?.id ?? []).filter(Boolean));
    expect(skillSources.size).toBe(867);
    expect(applyS5Bwiki(result, evidence)).toEqual(result);
    expect(withWebPreview(read("data/snapshots/current.json"))).toEqual(original);
  });
  test("all published spirit/skill IDs remain usable and no second same-name entity is introduced", () => {
    for (const key of ["spirits", "skills"]) {
      expect(new Set(result[key].map(entity => entity.id)).size).toBe(result[key].length);
      const field = key === "spirits" ? "fullName" : "name";
      for (const name of new Set(result[key].map(entity => entity[field]))) {
        expect(result[key].filter(entity => entity[field] === name).length)
          .toBeLessThanOrEqual(Math.max(1, original[key].filter(entity => entity[field] === name).length));
      }
      for (const entry of original[key]) expect(result[key].some(entity => entity.id === entry.id)).toBe(true);
    }
    expect(findSpirit(result, "圣冠布鲁斯").id).toBe("spirit_preview_s5_boss-ice-bruce");
    expect(result.skills.find(skill => skill.name === "荒芜之噬").id).toBe(original.skills.find(skill => skill.name === "荒芜之噬").id);
  });
  test("each preview owner retains its trait ID/mechanism, real stats and local portrait", () => {
    for (const rawId of Object.keys(evidence.modules.SeasonFeatures)) {
      const raw = evidence.modules.Catalog[rawId];
      const previous = findSpirit(original, raw.title), current = findSpirit(result, raw.title);
      expect(current.id).toBe(previous.id);
      expect(current.traitIds).toEqual(previous.traitIds);
      expect(ownerTrait(result, raw.title).previewIdentity).toEqual(ownerTrait(original, raw.title).previewIdentity);
      expect(current.previewIdentity).toMatchObject({ ...previous.previewIdentity, raceStatsPlaceholder: false,
        raceStatsEvidence: { kind: "bwiki-season", revision: evidence.seasons[0].sources.Roster.revision } });
      expect(current.raceStats).toMatchObject({ hp: raw.stats.hp, physicalAttack: raw.stats.atk, magicalAttack: raw.stats.spa,
        physicalDefense: raw.stats.def, magicalDefense: raw.stats.spd, speed: raw.stats.spe });
      expect(current.asset).toEqual(previous.asset);
      expect(current.calculationStatus).toBe(previous.calculationStatus === "pending-race-stats" ? "pending-s5-mechanics" : previous.calculationStatus);
    }
  });
  test("same-name dice abilities receive the correct per-owner text and retain their shared mechanic", () => {
    const first = ownerTrait(result, "滴溜豚"), evolved = ownerTrait(result, "滴廿豚");
    expect(first.name).toBe("游戏的本质"); expect(evolved.name).toBe("游戏的本质");
    expect(first.description).toContain("1~6"); expect(evolved.description).toContain("1~20");
    expect(first.id).not.toBe(evolved.id);
    expect(first.previewIdentity.mechanicKey).toBe("diliutun");
    expect(evolved.previewIdentity.mechanicKey).toBe("diliutun");
    for (const name of ["滴溜豚", "滴廿豚"]) {
      const raw = sourceSpirit(name);
      expect(ownerTrait(result, name).effectDetails).toEqual(evidence.modules.Skills[raw.feature_skill_id].effect_details);
      expect(ownerTrait(result, name).provenance.nrc.gameId).toBe(evidence.modules.Skills[raw.feature_skill_id].game_id);
    }
  });
  test("complete pools preserve every source method, append season supplements and restrict legendary skills", () => {
    for (const raw of Object.values(evidence.modules.Catalog)) {
      const learned = pool(result, raw.title), basePool = evidence.modules.Learnsets[raw.learnset_id];
      const supplement = evidence.modules.SeasonLearnsets?.[raw.id] ?? {};
      const rawIds = [...(basePool.native_skills ?? []), ...(supplement.native_skills ?? []),
        ...(basePool.blood_skills ?? []), ...(supplement.blood_skills ?? [])].map(item => item.skill);
      rawIds.push(...(basePool.skill_stones ?? []), ...(supplement.skill_stones ?? []));
      const expectedIds = new Set(rawIds.map(id => result.skills.find(skill => skill.provenance?.nrc?.id === id)?.id));
      expect(expectedIds.has(undefined)).toBe(false);
      for (const id of expectedIds) expect(learned.skillIds).toContain(id);
      expect(Object.keys(learned.acquisitions)).toEqual(learned.skillIds);
      const legendary = supplement.legendary ?? basePool.legendary;
      if (legendary && (!legendary.requires || legendary.requires === raw.title)) {
        const skill = result.skills.find(candidate => candidate.provenance?.nrc?.id === legendary.skill);
        expect(learned.acquisitions[skill.id]).toContain(`传说技能（${legendary.requires ?? raw.title}）`);
      }
    }
    const learned = pool(result, "喵喵");
    const fresh = result.skills.find(skill => skill.provenance?.nrc?.id === evidence.modules.SeasonLearnsets.pet_000001.skill_stones[0]);
    expect(learned.acquisitions[fresh.id]).toContain("技能石");
  });
  test("system templates retain legal positions and refill withdrawn, duplicate and empty defaults", () => {
    const snapshot = structuredClone(original), spirit = findSpirit(snapshot, "冥古龙");
    const learned = snapshot.learnsets.find(entry => entry.spiritId === spirit.id);
    const legal = learned.defaultSkillIds.find(Boolean);
    learned.defaultSkillIds = [legal, "withdrawn-skill", null, legal];
    const next = applyS5Bwiki(snapshot, evidence);
    const repaired = pool(next, "冥古龙").defaultSkillIds;
    expect(repaired[0]).toBe(legal);
    expect(repaired).toHaveLength(4);
    expect(repaired.every(Boolean)).toBe(true);
    expect(new Set(repaired).size).toBe(4);
    expect(repaired.every(id => pool(next, "冥古龙").skillIds.includes(id))).toBe(true);
    expect(learned.defaultSkillIds).toEqual([legal, "withdrawn-skill", null, legal]);
  });
  test("all 27 S5 identities have four distinct legal system defaults, including both bosses and the growth dragon", () => {
    const spirits = result.spirits.filter(spirit => spirit.introducedSeason === "S5");
    expect(spirits).toHaveLength(27);
    for (const spirit of spirits) {
      const defaults = chooseDefaultSkillIds(result, spirit.id);
      expect(defaults, spirit.fullName).toHaveLength(4);
      expect(defaults.every(Boolean), spirit.fullName).toBe(true);
      expect(new Set(defaults).size, spirit.fullName).toBe(4);
      expect(defaults.every(id => pool(result, spirit.fullName).skillIds.includes(id)), spirit.fullName).toBe(true);
    }
    expect(chooseDefaultSkillIds(result, findSpirit(result, "圣冠布鲁斯").id)[0])
      .toBe(original.skills.find(skill => skill.name === "冰雹").id);
    expect(chooseDefaultSkillIds(result, findSpirit(result, "琉璃君主").id)[0])
      .toBe(original.skills.find(skill => skill.name === "血气").id);
    expect(chooseDefaultSkillIds(result, findSpirit(result, "小冥龙").id))
      .not.toContain(original.skills.find(skill => skill.name === "荒芜之噬").id);
  });
  test("the 27/28 confirmed new identities are marked S5; absent Abu/lily entries stay untouched", () => {
    for (const [rawId, raw] of Object.entries(evidence.modules.Catalog)) {
      const spirit = findSpirit(result, raw.title);
      if (Object.hasOwn(evidence.modules.SeasonFeatures, rawId)) {
        expect(spirit).toMatchObject({ introducedSeason: "S5", changeInfo: { isNew: true, patch: { seasonId: "S5" } } });
      } else expect(spirit.changeInfo?.isNew).not.toBe(true);
    }
    for (const [rawId, raw] of Object.entries(evidence.modules.Skills)) if (raw.category !== "特性" && evidence.modules.SkillSeasons?.[rawId] === "S5") {
      expect(result.skills.find(skill => skill.name === raw.name)).toMatchObject({ introducedSeason: "S5", changeInfo: { isNew: true } });
    }
    for (const name of ["阿布", "圣龙阿布", "超能阿布", "铃兰"]) {
      expect(findSpirit(result, name)).toEqual(findSpirit(original, name));
      expect(pool(result, name)).toEqual(pool(original, name));
      expect(ownerTrait(result, name)).toEqual(ownerTrait(original, name));
    }
    expect(findSpirit(result, "幽影树（突变的样子）").provenance.nrc.status).toBe("legacy-unconfirmed");
  });
  test("full evolution families carry stable IDs and auditable final/growth/boss classification", () => {
    expect(findSpirit(result, "小冥龙")).toMatchObject({ formRole: "growth", formRoleEvidence: { kind: "bwiki-season" } });
    expect(findSpirit(result, "冥古龙")).toMatchObject({ formRole: "final" });
    expect(findSpirit(result, "圣冠布鲁斯")).toMatchObject({ formRole: "boss", stage: "首领", sourceCategory: "首领形态" });
    for (const name of ["小冥龙", "冥古龙"]) expect(findSpirit(result, name).evolutionChainIds).toEqual(expect.arrayContaining([
      findSpirit(result, "小冥龙").id, findSpirit(result, "冥古龙").id,
    ]));
    for (const raw of Object.values(evidence.modules.Catalog)) {
      const spirit = findSpirit(result, raw.title);
      expect(spirit.formRoleEvidence.revision).toBeGreaterThan(0);
      expect(spirit.evolutionChainIds.every(id => result.spirits.some(member => member.id === id))).toBe(true);
    }
  });
  test("existing executable rules and pending mechanism guards are not erased by new numbers/text", () => {
    const guarded = original.skills.filter(skill => skill.s5StatusEffectPending || skill.ruleId);
    expect(guarded.length).toBeGreaterThan(0);
    for (const previous of guarded) {
      const current = result.skills.find(skill => skill.id === previous.id);
      expect(current.ruleId).toBe(previous.ruleId);
      expect(current.ruleParams).toEqual(previous.ruleParams);
      expect(current.s5StatusEffectPending).toEqual(["矿物置换", "续杯"].includes(previous.name)
        ? undefined : previous.s5StatusEffectPending);
    }
    const raw = sourceSpirit("冥古龙");
    expect(findSpirit(result, "冥古龙").provenance.nrc).toMatchObject({ id: raw.id, gameId: raw.game_id, head: raw.image.head });
  });
  test("the real shifted source ordinals cannot swap 抓挠/猛烈撞击 identities, artwork or executable rules", () => {
    const beforeScratch = original.skills.find(skill => skill.name === "抓挠");
    const beforeTackle = original.skills.find(skill => skill.name === "猛烈撞击");
    expect(beforeScratch.provenance.nrc.id).toBe("skill_000246");
    expect(beforeTackle.provenance.nrc.id).toBe("skill_000247");
    const scratch = result.skills.find(skill => skill.name === "抓挠"), tackle = result.skills.find(skill => skill.name === "猛烈撞击");
    expect(scratch).toMatchObject({ id: beforeScratch.id, provenance: { nrc: { id: "skill_000247" }, nrcHistory: [beforeScratch.provenance.nrc] } });
    expect(tackle).toMatchObject({ id: beforeTackle.id, provenance: { nrc: { id: "skill_000248" }, nrcHistory: [beforeTackle.provenance.nrc] } });
    expect(scratch.asset).toEqual(beforeScratch.asset);
    expect(tackle.asset).toEqual(beforeTackle.asset);
    expect(result.meta.s5NrcSync.identityAudit.skills.reboundSourceIds).toBeGreaterThan(500);
    const collision = structuredClone(original);
    collision.skills.find(skill => skill.name === "抓挠").provenance.nrc.gameId = -1;
    expect(() => applyS5Bwiki(collision, evidence)).toThrow("同名实体的游戏 ID 冲突：抓挠");
  });
  test("all 312 current-version spirit histories map to existing change-detail and ledger records", () => {
    const audit = result.meta.s5NrcSync.historyAudit;
    expect(audit).toMatchObject({ sourceRecords: 1971, mappedRecords: 1971, currentVersionRecords: 312, currentVersionMappedRecords: 312 });
    expect(audit.pending.filter(row => row.version === evidence.modules.Config.current_version)).toEqual([]);
    const groups = info => [info, ...(info?.history ?? [])].filter(Boolean);
    for (const [rawId, records] of Object.entries(evidence.modules.History.pets)) {
      const raw = evidence.modules.Catalog[rawId];
      for (const record of records.filter(row => row.version === evidence.modules.Config.current_version)) {
        const relevant = record.changes.filter(change => !["breeding", "handbook"].includes(change.group));
        if (!relevant.length) continue;
        const spirit = findSpirit(result, raw.title);
        const group = groups(spirit.changeInfo).find(row => row.patch.id === record.version);
        expect(group, raw.title).toBeTruthy();
        expect(group.items.length).toBeGreaterThanOrEqual(relevant.length);
        expect(result.currentPatchChanges.spirits.find(row => row.entityId === spirit.id)).toEqual(spirit.changeInfo);
      }
    }
    expect(result.currentPatchChanges.patch).toMatchObject({ id: "s5-2026-10-31", date: "2026.10.31", displayDate: "2026.11.05" });
  });
  test("喵喵 newly learns 维管束重构 and raw stat/ability changes retain exact values and source dates", () => {
    const group = (entity, id) => [entity.changeInfo, ...(entity.changeInfo?.history ?? [])].find(row => row?.patch?.id === id);
    const patchId = "s5-2026-10-31";
    expect(group(findSpirit(result, "喵喵"), patchId)).toMatchObject({ patch: { date: "2026.10.31", sourceUrl: evidence.seasons[0].sources.Aux.url },
      items: expect.arrayContaining([{ kind: "learnset", field: "skillIds", skillId: result.skills.find(skill => skill.name === "维管束重构").id,
        label: "新增可学习技能", after: "维管束重构", note: "技能书" }]) });
    for (const name of ["夜游魔", "障眼魔"]) {
      const items = group(findSpirit(result, name), patchId).items;
      expect(items.some(item => item.kind === "trait" && item.before.includes("50%") && item.after.includes("100%"))).toBe(true);
    }
    const skill = result.skills.find(item => item.name === "暖阳");
    expect(group(skill, patchId).items).toEqual(expect.arrayContaining([
      { kind: "stat", field: "basePower", label: "威力", before: 70, after: 65 },
      { kind: "mechanic", field: "description", label: "技能效果", before: "造成物伤，每使用1次其他火系技能，威力永久+40，使用本技能后重置。",
        after: "造成物伤，每使用1次其他火系技能，威力永久+60，使用本技能后重置。" },
    ]));
    const source = Object.entries(evidence.modules.History.pets).find(([, records]) => records.some(row => row.version === patchId && row.changes.some(change => change.group === "stats")));
    const changes = source[1].find(row => row.version === patchId).changes.filter(change => change.group === "stats");
    const current = group(findSpirit(result, evidence.modules.Catalog[source[0]].title), patchId);
    for (const change of changes) expect(current.items).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "stat", label: change.field, before: change.before, after: change.after })]));
  });
  test("existing S4 history remains accessible with its original patch/date/items and new-only spirits stay NEW", () => {
    for (const kind of ["spirits", "skills"]) for (const before of original[kind]) {
      const previousGroups = [before.changeInfo, ...(before.changeInfo?.history ?? [])].filter(row => row?.patch?.id);
      const after = result[kind].find(entity => entity.id === before.id);
      const groups = [after.changeInfo, ...(after.changeInfo?.history ?? [])].filter(Boolean);
      for (const previous of previousGroups) {
        const current = groups.find(row => row.patch?.id === previous.patch.id);
        expect(current?.patch.date).toBe(previous.patch.date);
        for (const item of previous.items ?? []) expect(current.items).toContainEqual(item);
      }
    }
    for (const rawId of Object.keys(evidence.modules.SeasonFeatures)) {
      const spirit = findSpirit(result, evidence.modules.Catalog[rawId].title);
      expect(spirit.changeInfo.isNew).toBe(true);
      expect(spirit.changeInfo.items.every(item => item.kind === "new")).toBe(true);
    }
  });
  test("unmapped old historical names remain explicit pending; ecological fields do not create calculator features", () => {
    const audit = result.meta.s5NrcSync.historyAudit;
    expect(audit.pending).toHaveLength(25);
    expect(new Set(audit.pending.map(row => row.change.name ?? row.change.value))).toEqual(new Set(["冰封", "暮风隐者", "满月砣"]));
    expect(audit.pending.every(row => row.sourceUrl === evidence.sources["模块:Pets/data/History"].url)).toBe(true);
    expect(audit.ignoredChanges).toEqual({ handbook: 9, breeding: 63 });
  });
});
