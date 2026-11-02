import { querySeasonChangeInfo } from "./s5-announcement-catalog.js";

const STAGES = { 一阶: 1, 二阶: 2, 三阶: 3, 首领: 4 };

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => [key, canonical(child)]));
  }
  return value;
}
const signature = (value) => JSON.stringify(canonical(value));

function learningChangeInfo(season, changeInfo) {
  const current = querySeasonChangeInfo(season, changeInfo);
  const patches = new Map();
  for (const group of [current, ...(current?.history ?? [])]) {
    const items = group?.items?.filter(item => item.kind === "learnset") ?? [];
    if (!items.length) continue;
    const key = group.patch?.id ?? signature(group.patch ?? null);
    if (!patches.has(key)) {
      const { history: _history, ...entry } = group;
      patches.set(key, { ...entry, items: [] });
    }
    const entry = patches.get(key);
    const seen = new Set(entry.items.map(signature));
    for (const item of items) {
      const itemKey = signature(item);
      if (!seen.has(itemKey)) { entry.items.push(item); seen.add(itemKey); }
    }
  }
  const [latest, ...history] = patches.values();
  return latest ? { ...latest, history } : null;
}

function updateSignature(row, pool) {
  const changes = row.changeInfo ? [row.changeInfo, ...row.changeInfo.history] : [];
  return signature([
    [...row.skillIds].sort().map(id => [id, [...new Set(pool?.acquisitions?.[id] ?? [])].sort()]),
    changes.map(group => [group.patch, group.items.map(signature).sort()]),
  ]);
}

function hasLearningChanges(changeInfo, skillIds) {
  if (!changeInfo) return false;
  const added = new Set(skillIds);
  return [changeInfo, ...changeInfo.history].some(group => group.items.some(item =>
    !(item.label === "新增可学习技能" && (item.before == null || item.before === "") && added.has(item.skillId))));
}

/** Build complete learning updates before UI filters; partial families stay individual. */
export function buildLearningUpdates(season, changes, spiritsMetadata = []) {
  if (!season) return [];
  const metadata = new Map(spiritsMetadata.map(spirit => [spirit.id, spirit]));
  const skills = new Map((season.skills ?? []).map(skill => [skill.id, skill]));
  const pools = new Map((season.learnsets ?? []).map(pool => [pool.spiritId, pool]));
  const gains = new Map();
  for (const gain of changes?.gains ?? []) {
    if (!gains.has(gain.spiritId)) gains.set(gain.spiritId, new Set());
    for (const id of gain.skillIds ?? []) gains.get(gain.spiritId).add(id);
  }

  const families = new Map();
  const updates = new Map();
  const signatures = new Map();
  const sortValues = new Map();
  for (const [index, original] of (season.spirits ?? []).entries()) {
    const detail = metadata.get(original.id);
    const spirit = { ...detail, ...original,
      aliases: [...new Set([...(detail?.aliases ?? []), ...(original.aliases ?? [])])],
      ...(detail?.asset || original.asset ? { asset: { ...detail?.asset, ...original.asset } } : {}),
    };
    const parsedDex = String(spirit.dexNo ?? "").trim();
    const dex = parsedDex && Number.isFinite(Number(parsedDex)) ? Number(parsedDex) : Infinity;
    sortValues.set(spirit.id, { dex, index, stage: STAGES[spirit.stage] ?? 0 });
    // Only the season's explicit family identity can authorize grouping.
    const familyId = original.familyId || null;
    const familyKey = familyId ? `family:${familyId}` : `spirit:${spirit.id}`;
    if (!families.has(familyKey)) families.set(familyKey, []);
    families.get(familyKey).push(spirit);

    const skillIds = [...(gains.get(spirit.id) ?? [])];
    const changeInfo = learningChangeInfo(season, original.changeInfo);
    if (!skillIds.length && !changeInfo) continue;
    const row = {
      id: `spirit:${spirit.id}`, key: `spirit:${spirit.id}`, familyId,
      spiritId: spirit.id, spirit, members: [spirit], isFamily: false,
      skillIds, skills: skillIds.map(id => skills.get(id)).filter(Boolean), changeInfo,
      hasNewSkills: skillIds.length > 0, hasLearningChanges: hasLearningChanges(changeInfo, skillIds),
    };
    updates.set(spirit.id, row);
    signatures.set(spirit.id, updateSignature(row, pools.get(spirit.id)));
  }

  const compare = (a, b) => {
    const first = sortValues.get(a.id), second = sortValues.get(b.id);
    if (first.dex !== second.dex) return first.dex - second.dex;
    return (Number.isFinite(first.dex) ? first.stage - second.stage : 0) || first.index - second.index;
  };
  const rows = [];
  for (const [familyKey, family] of families) {
    const members = [...family].sort(compare);
    const entries = members.map(member => updates.get(member.id));
    const complete = entries.length > 1 && entries.every(Boolean) &&
      entries[0].familyId && entries.every(row =>
        signatures.get(row.spiritId) === signatures.get(entries[0].spiritId));
    if (!complete) { rows.push(...entries.filter(Boolean)); continue; }
    const ordinary = members.filter(member => member.stage !== "首领");
    const representative = (ordinary.length ? ordinary : members).reduce((best, member) =>
      (STAGES[member.stage] ?? 0) > (STAGES[best.stage] ?? 0) ? member : best);
    rows.push({ ...updates.get(representative.id), id: familyKey, key: familyKey, members, isFamily: true });
  }
  return rows.sort((a, b) => compare(a.members[0], b.members[0]));
}
