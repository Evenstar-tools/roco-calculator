import { stableId, splitFullName } from "./normalize.mjs";
import { mergeEntityChangeInfo } from "../../src/data/entity-change-history.js";
import { chooseDefaultSkillIds, reconcileSkillLoadout } from "../../src/domain/skill-loadout.js";
import { getSpiritSkillSlotCapacity } from "../../src/domain/skill-slot-capacity.js";

const STATS = { hp: "hp", atk: "physicalAttack", spa: "magicalAttack", def: "physicalDefense", spd: "magicalDefense", spe: "speed" };
const required = (condition, message) => { if (!condition) throw new Error(`S5 BWIKI 覆盖：${message}`); };
const unique = values => [...new Set(values)];
const isPreview = value => /^s5(?:[-_:]|$)/iu.test(value?.previewIdentity?.catalogId ?? "");
const category = raw => raw.category === "防御" ? "defense" : raw.category === "状态" ? "status"
  : raw.damage_class === "物攻" ? "physical" : raw.damage_class === "魔攻" ? "magical" : null;
const completeSkill = skill => ["physical", "magical", "status", "defense"].includes(skill.category) && typeof skill.type === "string" &&
  Number.isSafeInteger(skill.cost) && skill.cost >= 0 && (["status", "defense"].includes(skill.category) || Number.isFinite(skill.basePower));

function applyBwikiHistory(snapshot, evidence, { spiritIds, skillIds, version }) {
  const history = evidence.modules.History;
  const audit = { sourceRecords: 0, mappedRecords: 0, currentVersionRecords: 0, currentVersionMappedRecords: 0,
    pending: [], ignoredChanges: {} };
  if (!history) return audit;
  const spirits = new Map(snapshot.spirits.map(entity => [entity.id, entity]));
  const skills = new Map(snapshot.skills.map(entity => [entity.id, entity]));
  const rawSkillsByName = new Map(Object.entries(evidence.modules.Skills).filter(([, raw]) => raw.category !== "特性")
    .map(([id, raw]) => [raw.name, id]));
  const statFields = { 生命: "hp", 物攻: "physicalAttack", 魔攻: "magicalAttack", 物防: "physicalDefense", 魔防: "magicalDefense", 速度: "speed" };
  const text = value => Array.isArray(value) ? value.join("\n") : value;
  const historyPatch = id => {
    const entry = history.versions?.[id];
    if (!entry?.date || !entry.season) return null;
    const source = evidence.moduleSources.History?.find(ref => id.startsWith("s5-")
      ? ref.title === evidence.seasons.find(season => season.code === "S5")?.sources.Aux.title
      : ref.title === "模块:Pets/data/History") ?? evidence.moduleSources.History?.[0];
    return { id, seasonId: entry.season, label: entry.label, date: entry.date.replaceAll("-", "."),
      ...(entry.display_date ? { displayDate: entry.display_date.replaceAll("-", ".") } : {}),
      status: id === version ? "current" : "historical", sourceUrl: source?.url };
  };
  // Records may previously have lived only in the legacy ledger. Restore them
  // before adding source history so no old patch/date silently disappears.
  for (const key of ["spirits", "skills"]) for (const record of snapshot.currentPatchChanges?.[key] ?? []) {
    const entity = (key === "spirits" ? spirits : skills).get(record.entityId);
    if (entity) entity.changeInfo = mergeEntityChangeInfo({ patch: snapshot.currentPatchChanges.patch, ...record }, entity.changeInfo);
  }
  const add = (entity, patch, items, introduced = false) => {
    if (!items.length) return;
    entity.changeInfo = mergeEntityChangeInfo(entity.changeInfo, { patch, entityId: entity.id,
      entityName: entity.fullName ?? entity.name, isNew: introduced && patch.seasonId === "S5" ||
        entity.changeInfo?.isNew === true && entity.changeInfo.patch?.seasonId === "S5",
      ...(introduced ? { isFinal: entity.stage !== "首领" } : {}), items });
  };
  const records = Object.entries(history.pets ?? {}).flatMap(([rawId, rows]) => rows.map(record => ({ rawId, record })))
    .sort((a, b) => (history.versions[a.record.version]?.date ?? "").localeCompare(history.versions[b.record.version]?.date ?? "") ||
      a.record.version.localeCompare(b.record.version));
  for (const { rawId, record } of records) {
    audit.sourceRecords += 1;
    const currentVersion = record.version === version;
    if (currentVersion) audit.currentVersionRecords += 1;
    const spiritId = spiritIds.get(rawId) ?? snapshot.spirits.find(entity => entity.provenance?.nrc?.id === rawId)?.id;
    const spirit = spirits.get(spiritId), patch = historyPatch(record.version);
    const pending = (change, reason) => audit.pending.push({ rawId, version: record.version, change, reason,
      sourceUrl: patch?.sourceUrl ?? evidence.moduleSources.History?.[0]?.url });
    if (!spirit || !patch) { pending(null, !spirit ? "历史精灵身份未映射" : "历史版本日期或赛季缺失"); continue; }
    audit.mappedRecords += 1;
    if (currentVersion) audit.currentVersionMappedRecords += 1;
    const items = [];
    let introduced = false;
    for (const change of record.changes ?? []) {
      const values = Object.fromEntries(["before", "after"].filter(key => Object.hasOwn(change, key))
        .map(key => [key, text(change[key])]));
      if (["breeding", "handbook"].includes(change.group)) {
        audit.ignoredChanges[change.group] = (audit.ignoredChanges[change.group] ?? 0) + 1;
      } else if (change.group === "stats") {
        if (!statFields[change.field] || !Number.isFinite(change.before) || !Number.isFinite(change.after)) { pending(change, "种族值历史字段或前后值无效"); continue; }
        items.push({ kind: "stat", field: statFields[change.field], label: change.field, ...values });
      } else if (change.group === "feature") {
        items.push({ kind: "trait", field: change.field === "特性说明" ? "traitDescription" : "traitIds", label: change.field, ...values });
      } else if (change.group === "skill") {
        const suffix = ["威力", "能耗", "说明"].find(value => change.field?.endsWith(value));
        const name = suffix ? change.field.slice(0, -suffix.length) : null;
        const target = skills.get(skillIds.get(rawSkillsByName.get(name)));
        if (!target || !Object.hasOwn(change, "before") || !Object.hasOwn(change, "after")) { pending(change, "历史技能字段或前后值未可靠映射"); continue; }
        const item = { kind: suffix === "说明" ? "mechanic" : "stat", field: { 威力: "basePower", 能耗: "cost", 说明: "description" }[suffix],
          label: suffix === "说明" ? "技能效果" : suffix, ...values };
        add(target, patch, [item]);
        items.push({ ...item, label: `${name}·${item.label}` });
      } else if (change.group === "learnset") {
        const target = skills.get(skillIds.get(rawSkillsByName.get(change.name)));
        if (!target || !["added", "removed"].includes(change.action)) { pending(change, "历史学习面技能或动作未可靠映射"); continue; }
        items.push({ kind: "learnset", field: "skillIds", skillId: target.id,
          label: change.action === "added" ? "新增可学习技能" : "移除可学习技能",
          [change.action === "added" ? "after" : "before"]: change.name,
          ...(change.source || change.qualifier ? { note: [change.source, change.qualifier].filter(Boolean).join(" · ") } : {}) });
      } else if (change.group === "lord") {
        const matches = snapshot.spirits.filter(entity => entity.fullName === change.value);
        if (change.action !== "lord_added" || matches.length !== 1) { pending(change, "历史首领身份未可靠映射"); continue; }
        items.push({ kind: "mechanic", field: "evolutionChainIds", label: "新增首领形态", after: change.value });
      } else if (change.group === "evolution") {
        items.push({ kind: "mechanic", field: "evolutionChainNames", label: "进化路径", ...values });
      } else if (change.group === "identity") {
        if (change.action === "introduced") {
          introduced = true;
          items.push({ kind: "new", label: "新增精灵", after: change.value });
        } else if (change.field === "形态") items.push({ kind: "mechanic", field: "variantName", label: "形态", ...values });
        else pending(change, "历史身份字段未可靠映射");
      } else pending(change, "历史变更类型未支持映射");
    }
    add(spirit, patch, items, introduced);
  }
  // mergeEntityChangeInfo deliberately preserves insertion order. Sort groups
  // by their own recorded date so reimporting older history cannot become latest.
  for (const entity of [...snapshot.spirits, ...snapshot.skills]) if (entity.changeInfo) {
    const groups = [entity.changeInfo, ...(entity.changeInfo.history ?? [])].map(({ history: _history, ...group }) => ({ ...group, items: group.items ?? [] }))
      .sort((a, b) => String(b.patch?.date ?? "").replace(/[^\d]/gu, "").localeCompare(String(a.patch?.date ?? "").replace(/[^\d]/gu, "")) ||
        String(b.patch?.id ?? "").localeCompare(String(a.patch?.id ?? "")));
    const [latest, ...older] = groups;
    entity.changeInfo = { ...latest, ...(older.length ? { history: older } : {}) };
  }
  snapshot.currentPatchChanges = { ...snapshot.currentPatchChanges, patch: historyPatch(version),
    spirits: snapshot.spirits.map(entity => entity.changeInfo).filter(Boolean),
    skills: snapshot.skills.map(entity => entity.changeInfo).filter(Boolean) };
  return audit;
}

/** Build-only CN preview overlay. Published identities and mechanism contracts stay intact. */
export function applyS5Bwiki(snapshot, evidence) {
  required((snapshot.meta?.serverId ?? "cn") === "cn", "只允许国服资料");
  const modules = evidence?.modules;
  required(evidence?.schemaVersion === 1 && evidence.current?.season === "S5" && modules?.Catalog && modules.Skills && modules.Learnsets && modules.Evolutions,
    "完整 S5 合并来源缺失");
  const next = structuredClone(snapshot);
  const originalById = new Map([...snapshot.spirits, ...snapshot.skills, ...snapshot.traits].map(entity => [entity.id, entity]));
  const season = evidence.seasons.find(item => item.code === "S5");
  required(season?.sources?.Roster && season.sources.Arts && season.sources.Gifts && season.sources.Aux, "S5 分片来源缺失");
  const baseRef = name => evidence.sources[`模块:Pets/data/${name}`] ?? evidence.moduleSources[name]?.[0];
  const spiritIsNew = raw => Object.hasOwn(modules.SeasonFeatures ?? {}, raw.id);
  const spiritRef = raw => spiritIsNew(raw) ? season.sources.Roster : baseRef("Catalog");
  const skillRef = (rawId, raw) => modules.SkillSeasons?.[rawId] === "S5"
    ? raw.category === "特性" ? season.sources.Gifts : season.sources.Arts : baseRef("Skills");
  const version = modules.Config?.current_version ?? "s5-bwiki";
  const patch = { id: version, seasonId: "S5", label: "S5 BWIKI 补充资料", status: "current",
    date: version.match(/\d{4}-\d{2}-\d{2}/u)?.[0]?.replaceAll("-", "."), sourceUrl: season.sources.Roster.url };
  const mark = (entity, rawId, raw, ref) => {
    required(ref?.revision && ref.url, `来源修订缺失：${rawId}`);
    const { status: _status, reason: _reason, ...previous } = entity.provenance?.nrc ?? {};
    entity.provenance = { ...entity.provenance,
      nrc: { ...previous, id: rawId, revision: ref.revision,
      ...(raw.game_id != null ? { gameId: raw.game_id } : {}),
      ...(raw.icon ? { icon: raw.icon } : {}), ...(raw.image?.head ? { head: raw.image.head } : {}) },
    s5NrcSource: ref };
  };
  const find = (list, rawId, raw, field) => {
    const name = raw[field === "fullName" ? "title" : "name"];
    // BWIKI renumbered hundreds of sequential source IDs in this revision.
    // An old ordinal must never steal another named entity's executable rules.
    const byId = list.filter(entity => entity.provenance?.nrc?.id === rawId && entity[field] === name &&
      (entity.provenance.nrc.gameId == null || raw.game_id == null || entity.provenance.nrc.gameId === raw.game_id));
    const byName = list.filter(entity => entity[field] === name);
    required(byId.length <= 1 && byName.length <= 1, `身份不唯一：${name}`);
    required(!byId.length || !byName.length || byId[0] === byName[0], `来源 ID 与名称指向不同实体：${name}`);
    required(!byName.length || byName[0].provenance?.nrc?.gameId == null || raw.game_id == null ||
      byName[0].provenance.nrc.gameId === raw.game_id, `同名实体的游戏 ID 冲突：${name}`);
    return byId[0] ?? byName[0];
  };
  const addNew = (entity, label) => {
    entity.introducedSeason = "S5";
    entity.changeInfo = mergeEntityChangeInfo(entity.changeInfo, { patch, entityId: entity.id,
      entityName: entity.fullName ?? entity.name, isNew: true, isFinal: entity.stage !== "首领",
      items: [{ kind: "new", label, after: entity.fullName ?? entity.name }] });
  };
  const skillIds = new Map(), traitIds = new Map(), spiritIds = new Map();
  const traitAliases = new Map();
  const updateTrait = (trait, rawId, raw) => {
    Object.assign(trait, { name: raw.name, description: raw.desc });
    if (Object.hasOwn(raw, "effect_details")) trait.effectDetails = structuredClone(raw.effect_details);
    if (modules.SkillSeasons?.[rawId] === "S5") trait.introducedSeason = "S5";
    mark(trait, rawId, raw, skillRef(rawId, raw));
    if (!traitAliases.has(trait.id)) traitAliases.set(trait.id, new Set());
    traitAliases.get(trait.id).add(rawId);
    return trait.id;
  };
  for (const [rawId, raw] of Object.entries(modules.Skills)) {
    required(typeof raw.name === "string" && typeof raw.desc === "string", `技能/特性文本缺失：${rawId}`);
    if (raw.category === "特性") {
      const byId = next.traits.filter(trait => trait.provenance?.nrc?.id === rawId && trait.name === raw.name &&
        (trait.provenance.nrc.gameId == null || raw.game_id == null || trait.provenance.nrc.gameId === raw.game_id));
      const byName = next.traits.filter(trait => trait.name === raw.name);
      // One official family ability may intentionally have several preview owner IDs.
      let trait = byId.find(item => !isPreview(item)) ?? byId[0] ??
        byName.find(item => !isPreview(item) && item.description === raw.desc) ??
        byName.find(item => item.description === raw.desc) ??
        (byName.filter(item => !isPreview(item)).length === 1 ? byName.find(item => !isPreview(item)) : null);
      if (!trait) { trait = { id: stableId("trait", "nrc", rawId) }; next.traits.push(trait); }
      traitIds.set(rawId, updateTrait(trait, rawId, raw));
      continue;
    }
    let skill = find(next.skills, rawId, raw, "name");
    if (!skill) {
      skill = { id: stableId("skill", "nrc", rawId), ruleId: null, ruleParams: null };
      next.skills.push(skill);
    }
    Object.assign(skill, { name: raw.name, description: raw.desc, type: raw.element?.replace(/系$/u, "") ?? null,
      category: category(raw), cost: raw.energy ?? null,
      basePower: raw.name === "画龙点睛" && raw.game_id === 7100380 ? null : raw.power ?? null });
    // User-confirmed correction: this charge skill grants stats, never damage.
    // Keep the BWIKI record (power 85) intact in reviewed evidence for review.
    if (raw.name === "画龙点睛" && raw.game_id === 7100380) {
      skill.provenance = { ...skill.provenance, s5UserCorrection: {
        field: "basePower", sourceValue: raw.power ?? null, value: null,
        reason: "2026-11-01 用户确认：画龙点睛为无威力状态技能",
      } };
    }
    if (raw.name === "矿物置换" && raw.game_id === 7080490 || raw.name === "续杯" && raw.game_id === 7050560) {
      delete skill.s5StatusEffectPending;
    }
    if (completeSkill(skill)) {
      if (skill.calculationStatus === "pending-skill-data") delete skill.calculationStatus;
    } else skill.calculationStatus ??= "pending-skill-data";
    mark(skill, rawId, raw, skillRef(rawId, raw));
    if (modules.SkillSeasons?.[rawId] === "S5") addNew(skill, "新增技能");
    else if (skill.changeInfo?.isNew) skill.changeInfo = { ...skill.changeInfo, isNew: false };
    skillIds.set(rawId, skill.id);
  }
  for (const [rawId, raw] of Object.entries(modules.Catalog)) {
    let spirit = find(next.spirits, rawId, raw, "fullName");
    if (!spirit) {
      spirit = { id: stableId("spirit", "nrc", rawId), asset: { sourceUrl: null, width: 128, height: 128 } };
      next.spirits.push(spirit);
    }
    const rawTraitId = modules.SeasonFeatures?.[rawId] ?? raw.feature_skill_id;
    const rawTrait = modules.Skills[rawTraitId];
    required(rawTrait?.category === "特性" && traitIds.has(rawTraitId), `精灵特性缺失：${raw.title}`);
    const ownerTrait = (spirit.traitIds ?? []).map(id => next.traits.find(trait => trait.id === id)).find(isPreview);
    const traitId = ownerTrait ? updateTrait(ownerTrait, rawTraitId, rawTrait) : traitIds.get(rawTraitId);
    required(Object.keys(STATS).every(key => Number.isSafeInteger(raw.stats?.[key]) && raw.stats[key] > 0), `精灵六维缺失：${raw.title}`);
    const raceStats = Object.fromEntries(Object.entries(STATS).map(([key, field]) => [field, raw.stats[key]]));
    raceStats.total = Object.values(raceStats).reduce((sum, value) => sum + value, 0);
    const ref = spiritRef({ ...raw, id: rawId });
    Object.assign(spirit, { ...splitFullName(raw.title), fullName: raw.title, dexNo: raw.number,
      stage: [null, "一阶", "二阶", "三阶", "首领"][raw.stage], raceStats,
      types: raw.types.map(type => type.replace(/系$/u, "")), traitIds: [traitId],
      traitName: rawTrait.name, traitDescription: rawTrait.desc,
      ...(typeof raw.description === "string" ? { description: raw.description } : {}),
      ...(raw.stage === 4 ? { sourceCategory: "首领形态" } : {}) });
    required(spirit.stage, `精灵阶段无效：${raw.title}`);
    if (spirit.calculationStatus === "pending-race-stats") spirit.calculationStatus = "pending-s5-mechanics";
    if (spirit.previewIdentity) spirit.previewIdentity = { ...spirit.previewIdentity, raceStatsPlaceholder: false,
      raceStatsEvidence: { kind: "bwiki-season", ...ref } };
    mark(spirit, rawId, raw, ref);
    if (spiritIsNew({ id: rawId })) addNew(spirit, "新增精灵");
    else if (spirit.changeInfo?.isNew) spirit.changeInfo = { ...spirit.changeInfo, isNew: false };
    spiritIds.set(rawId, spirit.id);
  }
  const bySpiritId = new Map(next.spirits.map(spirit => [spirit.id, spirit]));
  const chains = new Map([...spiritIds.values()].map(id => [id, new Set([id])]));
  const finalRawIds = new Set();
  for (const branches of Object.values(modules.Evolutions)) for (const branch of branches) {
    const members = [...(branch.chain ?? []), ...(branch.lord_branches ?? [])].map(member => member.id);
    const ids = members.map(id => spiritIds.get(id));
    required(ids.every(Boolean), `进化链存在未知精灵：${members.join("、")}`);
    for (const id of ids) for (const other of ids) chains.get(id).add(other);
    if (branch.chain?.length) finalRawIds.add(branch.chain.at(-1).id);
  }
  for (const [rawId, raw] of Object.entries(modules.Catalog)) {
    const spirit = bySpiritId.get(spiritIds.get(rawId));
    const chain = [...chains.get(spirit.id)];
    spirit.evolutionChainIds = chain;
    spirit.evolutionChainNames = chain.map(id => bySpiritId.get(id).fullName);
    const evolutionRef = raw.evolution_id?.startsWith("dc5") ? season.sources.Aux : baseRef("Evolutions");
    spirit.formRole = raw.stage === 4 ? "boss" : !raw.evolution_id || finalRawIds.has(rawId) ? "final" : "growth";
    spirit.evolutionFamilyId = raw.evolution_id ?? rawId;
    spirit.formRoleEvidence = { kind: "bwiki-season", revision: evolutionRef?.revision ?? spiritRef({ id: rawId }).revision,
      url: evolutionRef?.url ?? spiritRef({ id: rawId }).url };
  }
  const oldLearnsets = new Map(next.learnsets.map(pool => [pool.spiritId, pool]));
  const learned = new Map();
  for (const [rawId, raw] of Object.entries(modules.Catalog)) {
    const pool = modules.Learnsets[raw.learnset_id];
    required(pool, `技能池缺失：${raw.title}`);
    const supplement = modules.SeasonLearnsets?.[rawId] ?? {};
    const acquisitions = {};
    const add = (rawSkillId, method) => {
      const id = skillIds.get(rawSkillId);
      required(id, `技能池存在未知技能：${raw.title} / ${rawSkillId}`);
      acquisitions[id] = unique([...(acquisitions[id] ?? []), method]);
    };
    for (const item of [...(pool.native_skills ?? []), ...(supplement.native_skills ?? [])]) add(item.skill, `默认学习 Lv.${item.level}`);
    for (const item of [...(pool.blood_skills ?? []), ...(supplement.blood_skills ?? [])]) add(item.skill, `${item.blood}系血脉 Lv.${item.level}`);
    for (const id of [...(pool.skill_stones ?? []), ...(supplement.skill_stones ?? [])]) add(id, "技能石");
    const legendary = supplement.legendary ?? pool.legendary;
    if (legendary && (!legendary.requires || legendary.requires === raw.title)) add(legendary.skill, `传说技能（${legendary.requires ?? raw.title}）`);
    const spiritId = spiritIds.get(rawId), previous = oldLearnsets.get(spiritId);
    const skillIdList = Object.keys(acquisitions);
    learned.set(spiritId, { ...previous, spiritId, skillIds: skillIdList, acquisitions,
      ...(previous?.defaultSkillIds ? { defaultSkillIds: previous.defaultSkillIds.map(id => id === null || !acquisitions[id] ? null : id) } : {}),
      ...(previous?.bloodlineSkillIds ? { bloodlineSkillIds: skillIdList.filter(id => acquisitions[id].every(method => /血脉/u.test(method))) } : {}),
      sources: unique([...(evidence.moduleSources.Learnsets ?? []), season.sources.Aux]),
      provenance: { ...previous?.provenance, skillIds: baseRef("Learnsets"), s5Supplement: season.sources.Aux } });
  }
  next.learnsets = [...next.learnsets.map(pool => learned.get(pool.spiritId) ?? pool),
    ...[...learned.values()].filter(pool => !oldLearnsets.has(pool.spiritId))];
  // These are built-in templates, not saved user configurations. Preserve
  // legal slots and refill gaps from the existing automatic default order.
  const automaticDefaults = { ...next, learnsets: next.learnsets.map(({ defaultSkillIds: _defaults, ...pool }) => pool) };
  for (const pool of next.learnsets) {
    if (!learned.has(pool.spiritId) || !Array.isArray(pool.defaultSkillIds)) continue;
    const preferred = chooseDefaultSkillIds(automaticDefaults, pool.spiritId);
    const legal = [...new Set([...preferred, ...pool.skillIds].filter(Boolean))];
    pool.defaultSkillIds = reconcileSkillLoadout({ four: chooseDefaultSkillIds(next, pool.spiritId) }, legal,
      getSpiritSkillSlotCapacity(next, pool.spiritId)).four;
  }
  // Equivalent trait records have several raw IDs. Record all aliases but use
  // one deterministic identity, independent of catalog/owner visitation order.
  for (const trait of next.traits) if (traitAliases.has(trait.id)) {
    const ids = [...traitAliases.get(trait.id)].sort();
    mark(trait, ids[0], modules.Skills[ids[0]], skillRef(ids[0], modules.Skills[ids[0]]));
    trait.provenance.nrc.sourceIds = ids;
    trait.provenance.nrc.gameIds = unique(ids.map(id => modules.Skills[id].game_id).filter(id => id != null));
  }
  for (const entity of [...next.spirits, ...next.skills, ...next.traits]) {
    const previous = originalById.get(entity.id)?.provenance?.nrc;
    if (previous?.id && entity.provenance?.nrc?.id && previous.id !== entity.provenance.nrc.id) {
      entity.provenance.nrcHistory = [...new Map([...(entity.provenance.nrcHistory ?? []), previous]
        .map(item => [`${item.id}:${item.revision}`, item])).values()];
    }
  }
  for (const spirit of next.spirits) if (spirit.provenance?.nrc?.id && !spiritIds.has(spirit.provenance.nrc.id)) {
    spirit.provenance.nrc.status = "legacy-unconfirmed";
    spirit.provenance.nrc.reason = "本次 BWIKI 精灵表未收录；保留旧身份兼容已有配置，不推测替代形态";
  }
  const identityAudit = Object.fromEntries(["spirits", "skills", "traits"].map(key => [key, {
    reboundSourceIds: next[key].filter(entity => entity.provenance?.nrcHistory?.some(item => item.id !== entity.provenance.nrc?.id)).length,
    retainedWithoutSource: next[key].filter(entity => key === "spirits" ? !spiritIds.has(entity.provenance?.nrc?.id)
      : key === "skills" ? !skillIds.has(entity.provenance?.nrc?.id) : !traitIds.has(entity.provenance?.nrc?.id)).map(entity => ({ id: entity.id, name: entity.fullName ?? entity.name })),
  }]));
  next.meta = { ...next.meta, s5NrcSync: { version, sources: Object.values(evidence.sources), complete: true, identityAudit,
    counts: { spirits: Object.keys(modules.Catalog).length, skills: skillIds.size, traitRecords: traitIds.size,
      relations: [...learned.values()].reduce((sum, pool) => sum + pool.skillIds.length, 0),
      addedSpirits: season.counts.spirits, addedSkills: season.counts.skills, addedTraits: season.counts.traits } } };
  next.meta.s5NrcSync.historyAudit = applyBwikiHistory(next, evidence, { spiritIds, skillIds, version });
  return next;
}

export const applyS5BwikiOverlay = applyS5Bwiki;
