import { mergeEntityChangeInfo } from "../../src/data/entity-change-history.js";

const required = (condition, message) => { if (!condition) throw new Error(`S5 Candymo 补充：${message}`); };
const unique = values => [...new Set(values)];

/** Fill reviewed CN gaps after BWIKI. Never import into the shared or Global base. */
export function applyS5Candymo(snapshot, evidence) {
  required((snapshot.meta?.serverId ?? "cn") === "cn" && snapshot.meta?.s5NrcSync?.complete === true,
    "须在完整国服 S5 BWIKI 覆盖后应用");
  required(evidence?.schemaVersion === 1 && evidence.seasonId === "S5" &&
    evidence.authority === "third-party-game-data-site", "已审阅第三方资料缺失");
  const next = structuredClone(snapshot);
  const source = (raw, category) => ({ authority: evidence.authority, retrievedAt: evidence.retrievedAt,
    url: raw.pageUrl ?? `https://app.candymo.com/${category}/${raw.sourceId}`,
    apiUrl: raw.apiUrl ?? `https://api.candymo.com/api/v1/${category}/${raw.sourceId}` });
  const mark = (entity, raw, category) => {
    entity.provenance = { ...entity.provenance, candymo: { id: raw.sourceId, ...source(raw, category) } };
  };
  const patch = { id: evidence.id, seasonId: "S5", label: "S5 补充资料", status: "current",
    date: evidence.retrievedAt.slice(0, 10).replaceAll("-", "."), sourceUrl: evidence.sourceSite };
  const markNew = (entity, label) => {
    entity.introducedSeason = "S5";
    entity.changeInfo = mergeEntityChangeInfo(entity.changeInfo, { patch, entityId: entity.id,
      entityName: entity.fullName ?? entity.name, isNew: true, isFinal: entity.stage !== "首领",
      items: [{ kind: "new", label, after: entity.fullName ?? entity.name }] });
  };
  const asset = (category, id) => evidence.assets.find(item => item.category === category && item.sourceId === id);
  const skillIds = new Map();
  for (const raw of evidence.skills) {
    let skill = next.skills.find(item => item.id === raw.localId);
    if (skill) {
      const gameId = skill.provenance?.nrc?.gameId ?? skill.provenance?.candymo?.id;
      required(skill.name === raw.name && gameId === raw.sourceId, `技能身份冲突：${raw.name} / ${raw.sourceId}`);
    } else {
      required(raw.sourceId === 7100400 && raw.name === "圣龙狂斩" &&
        raw.localId === "skill_preview_s5_saint-dragon-slash", `未知新增技能：${raw.name}`);
      required(!next.skills.some(item => item.name === raw.name || item.provenance?.nrc?.gameId === raw.sourceId),
        `新增技能与已有身份冲突：${raw.name}`);
      skill = { id: raw.localId, name: raw.name, type: raw.type, category: raw.category,
        cost: raw.cost, basePower: raw.basePower, description: raw.description,
        ruleId: null, ruleParams: null, s5LevelChangeRule: raw.s5LevelChangeRule,
        iconUrl: asset("skills", raw.sourceId)?.localUrl };
      required(skill.iconUrl && Number.isFinite(skill.basePower) && Number.isInteger(skill.cost), `技能资料缺失：${raw.name}`);
      mark(skill, raw, "skills");
      markNew(skill, "新增技能");
      next.skills.push(skill);
    }
    // Preserve the confirmed status-only correction even when the API carries power 85.
    if (raw.sourceId === 7100380) Object.assign(skill, { category: "status", basePower: null });
    skillIds.set(raw.sourceId, skill.id);
  }
  const petsBySource = new Map(evidence.pets.map(pet => [pet.sourceId, pet]));
  for (const raw of evidence.pets) {
    required(raw.implemented && raw.isLeaderForm === (raw.formRole === "boss"), `精灵形态未确认：${raw.name}`);
    required(Object.values(raw.raceStats).length === 6 && Object.values(raw.raceStats)
      .every(value => Number.isSafeInteger(value) && value > 0), `精灵六维不完整：${raw.name}`);
    let spirit = next.spirits.find(item => item.id === raw.localId);
    required(!next.spirits.some(item => item.fullName === raw.name && item.id !== raw.localId), `精灵重名：${raw.name}`);
    if (!spirit) { spirit = { id: raw.localId }; next.spirits.push(spirit); }
    const traitId = spirit.traitIds?.[0] ?? `trait_preview_s5_${raw.key}`;
    let trait = next.traits.find(item => item.id === traitId);
    if (!trait) { trait = { id: traitId }; next.traits.push(trait); }
    const identity = { catalogId: evidence.id, key: raw.key, mechanicKey: raw.mechanicKey, formalIdPending: false };
    Object.assign(trait, { name: raw.trait.name, description: raw.trait.description,
      iconUrl: asset("traits", raw.trait.sourceId)?.localUrl, introducedSeason: "S5",
      previewIdentity: { ...trait.previewIdentity, ...identity } });
    required(trait.iconUrl, `特性图标未绑定：${raw.trait.name}`);
    mark(trait, raw.trait, "skills");
    const portrait = asset("spirits", raw.sourceId);
    Object.assign(spirit, { fullName: raw.name, baseName: raw.speciesName, variantName: null,
      dexNo: raw.dexNo, stage: raw.stage, types: [...raw.types],
      raceStats: { ...raw.raceStats, total: Object.values(raw.raceStats).reduce((sum, value) => sum + value, 0) },
      traitIds: [traitId], traitName: trait.name, traitDescription: trait.description,
      calculationStatus: "pending-s5-mechanics", formRole: raw.formRole,
      evolutionFamilyId: raw.familyId, formRoleEvidence: { kind: "candymo-reviewed", reviewId: evidence.id, sourceId: raw.sourceId, ...source(raw, "pets") },
      previewIdentity: { ...spirit.previewIdentity, ...identity, raceStatsPlaceholder: false,
        raceStatsEvidence: { kind: "candymo-reviewed", ...source(raw, "pets") } },
      ...(portrait ? { asset: { ...spirit.asset, localUrl: portrait.localUrl, sourceUrl: portrait.sourceUrl } } : {}) });
    if (raw.isLeaderForm) spirit.sourceCategory = "首领形态";
    else delete spirit.sourceCategory;
    mark(spirit, raw, "pets");
    markNew(spirit, "新增精灵");
    const family = evidence.pets.filter(pet => pet.familyId === raw.familyId);
    required(raw.evolvesFromSourceId == null || petsBySource.has(raw.evolvesFromSourceId), `进化前置缺失：${raw.name}`);
    spirit.evolutionChainIds = family.map(pet => pet.localId);
    spirit.evolutionChainNames = family.map(pet => pet.name);
    const acquisitions = {};
    for (const relation of raw.learningRelations) {
      const id = skillIds.get(relation.sourceSkillId);
      required(id && next.skills.find(skill => skill.id === id)?.name === relation.skillName,
        `学习技能身份缺失：${raw.name} / ${relation.skillName}`);
      const level = relation.learnLevel == null ? "" : ` Lv.${relation.learnLevel}`;
      required(["self", "stone", "bloodline"].includes(relation.method), `未知学习方式：${raw.name}`);
      if (relation.method === "bloodline") required(relation.bloodlineType && relation.bloodlineTypeId, `血脉属性缺失：${raw.name}`);
      const method = relation.method === "self" ? `默认学习${level}` : relation.method === "stone"
        ? "技能石" : `${relation.bloodlineType}系血脉${level}`;
      acquisitions[id] = unique([...(acquisitions[id] ?? []), method]);
    }
    const defaultSkillIds = raw.defaultSkillSourceIds.map(id => skillIds.get(id));
    required(defaultSkillIds.length === 4 && new Set(defaultSkillIds).size === 4 &&
      defaultSkillIds.every(id => acquisitions[id]), `默认四技能不合法：${raw.name}`);
    const pool = { spiritId: spirit.id, skillIds: Object.keys(acquisitions), acquisitions, defaultSkillIds,
      bloodlineSkillIds: Object.keys(acquisitions).filter(id => acquisitions[id].every(method => /血脉/u.test(method))),
      sources: [source(raw, "pets")] };
    required(pool.skillIds.length === raw.uniqueSkillCount, `学习面数量不完整：${raw.name}`);
    const poolIndex = next.learnsets.findIndex(item => item.spiritId === spirit.id);
    if (poolIndex < 0) next.learnsets.push(pool); else next.learnsets[poolIndex] = pool;
  }
  next.currentPatchChanges = { ...next.currentPatchChanges,
    spirits: next.spirits.map(entity => entity.changeInfo).filter(Boolean),
    skills: next.skills.map(entity => entity.changeInfo).filter(Boolean) };
  next.meta.s5CandymoSync = { id: evidence.id, authority: evidence.authority, retrievedAt: evidence.retrievedAt,
    counts: { spirits: evidence.pets.length, learningRelations: evidence.pets.reduce((sum, pet) => sum + pet.learningRelations.length, 0) } };
  return next;
}
