import { createSpiritSearchIndex } from "../../data/search-index.js";

export function matchesSource(text, source) {
  if (!source) return true;
  if (source === "default") return /默认学习|Lv\./i.test(text);
  return text.includes(source);
}

export function acquisitionSummary(methods) {
  if (!methods.length) return "途径待补充";
  return [...new Set(methods.map((text) => /等级待确认/.test(text) ? "等级待确认" : text.replace(/^解锁[：:]\s*/, "")))].join(" / ");
}

export function spiritSkills(season, spiritId) {
  const entries = season.learnsets.filter((entry) => entry.spiritId === spiritId);
  const methods = new Map();
  for (const entry of entries) for (const id of entry.skillIds) {
    if (!methods.has(id)) methods.set(id, new Set());
    for (const method of entry.acquisitions?.[id] ?? []) methods.get(id).add(method);
  }
  return season.skills.filter(({ id }) => methods.has(id)).map((skill) => ({
    ...skill, methods: [...methods.get(skill.id)],
  })).sort((a, b) => {
    const rank = (item) => item.methods.some((text) => matchesSource(text, "default")) ? 0
      : item.methods.some((text) => text.includes("血脉")) ? 1
        : item.methods.some((text) => text.includes("技能石")) ? 2 : 3;
    const level = (item) => Math.min(...item.methods.map((text) => Number(text.match(/Lv\.\s*(\d+)/i)?.[1] ?? Infinity)));
    return rank(a) - rank(b) || (level(a) - level(b) || 0);
  });
}

export function querySpiritFamilies(season, { skillIds = [], query = "", source = "", metadata = [] } = {}) {
  const details = new Map(metadata.map((spirit) => [spirit.id, spirit]));
  const spirits = season.spirits.map((spirit) => ({ ...details.get(spirit.id), ...spirit }));
  const matchedIds = new Set(createSpiritSearchIndex(spirits).search(query, Infinity).map(({ id }) => id));
  const matchingFamilies = new Set(spirits.filter(({ id }) => matchedIds.has(id)).map((spirit) => spirit.familyId ?? spirit.id));
  const learnsets = new Map(season.learnsets.map((entry) => [entry.spiritId, entry]));
  const groups = new Map();
  for (const spirit of spirits) {
    const familyId = spirit.familyId ?? spirit.id;
    if (!matchingFamilies.has(familyId)) continue;
    const entry = learnsets.get(spirit.id);
    // 先对具体形态求交集，再按家族收拢，不能合并不同形态的技能。
    if (skillIds.length && !skillIds.every((id) => entry?.skillIds.includes(id) &&
      (!source || entry.acquisitions?.[id]?.some((text) => matchesSource(text, source))))) continue;
    if (!groups.has(familyId)) groups.set(familyId, []);
    groups.get(familyId).push(spirit);
  }
  return [...groups].map(([id, members]) => ({
    id, members, representative: members.find((member) => matchedIds.has(member.id)) ?? members[0],
  }));
}
