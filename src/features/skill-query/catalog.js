export function unpackCatalog(data) {
  if (data.schemaVersion !== 1) throw new Error("技能资料版本暂不支持");
  if (data.sharedSkills) data = { ...data, seasons: data.seasons.map((season) => ({ ...season,
    methodTexts: data.methodTexts,
    skills: season.skills.map((index) => data.sharedSkills[index]),
    spirits: data.sharedSpirits ? season.spirits.map((index) => {
      const entry = data.sharedSpirits[index];
      if (!Array.isArray(entry)) return entry;
      const [id, fullName, types, stage, familyId] = entry;
      return { id, fullName, types, stage, familyId };
    }) : season.spirits,
    relations: season.relations.map((index) => data.sharedRelations[index]),
  })) };
  return { ...data, seasons: data.seasons.map((season) => ({ ...season,
    learnsets: season.relations.map(([spiritIndex, entries]) => ({
      spiritId: season.spirits[spiritIndex].id,
      skillIds: entries.map(([index]) => season.skills[index].id),
      acquisitions: Object.fromEntries(entries.map(([index, ...methods]) => [season.skills[index].id, methods.map((method) => season.methodTexts[method])])),
    })),
  })) };
}

export function seasonChanges(previous, next) {
  const skills = new Set(previous.skills.map(({ id }) => id));
  const oldSpirits = new Set(previous.spirits.map(({ id }) => id));
  const oldSets = new Map(previous.learnsets.map(({ spiritId, skillIds }) => [spiritId, new Set(skillIds)]));
  return {
    newSkillIds: new Set(next.skills.filter(({ id }) => !skills.has(id)).map(({ id }) => id)),
    gains: next.learnsets.filter(({ spiritId }) => oldSpirits.has(spiritId) && oldSets.has(spiritId))
      .map(({ spiritId, skillIds }) => ({ spiritId, skillIds: skillIds.filter((id) => !oldSets.get(spiritId).has(id)) }))
      .filter(({ skillIds }) => skillIds.length),
  };
}

export function skillLearners(season, skillId) {
  const spirits = new Map(season.spirits.map((spirit) => [spirit.id, spirit]));
  return season.learnsets.filter(({ skillIds }) => skillIds.includes(skillId)).map((entry) => ({
    ...spirits.get(entry.spiritId), methods: entry.acquisitions?.[skillId] ?? ["学习途径待补充"],
  })).filter(({ id }) => id);
}

export const categoryNames = { physical: "物攻", magical: "魔攻", status: "状态", defense: "防御" };

// 用明确进化关系合并，不能靠相似名称判断家族；关系允许仅由一端提供。
export function familyIds(spirits) {
  const names = new Map(spirits.map((spirit) => [spirit.fullName, spirit.id]));
  const parents = new Map(spirits.map(({ id }) => [id, id]));
  const variants = new Map();
  const find = (id) => {
    if (parents.get(id) !== id) parents.set(id, find(parents.get(id)));
    return parents.get(id);
  };
  // 同一基础精灵的形态分支可能各有独立进化链，使用显式身份字段连接。
  for (const spirit of spirits) {
    if (!spirit.baseName) continue;
    const previous = variants.get(spirit.baseName);
    if (previous && (previous.variantName || spirit.variantName)) {
      const roots = [find(previous.id), find(spirit.id)].sort();
      parents.set(roots[1], roots[0]);
    } else variants.set(spirit.baseName, spirit);
  }
  for (const spirit of spirits) for (const name of spirit.evolutionChainNames ?? []) {
    if (names.has(name)) {
      const roots = [find(names.get(name)), find(spirit.id)].sort();
      parents.set(roots[1], roots[0]);
    }
  }
  return new Map(spirits.map(({ id }) => [id, find(id)]));
}

const familyCache = new WeakMap();
export function learnerFamilies(season, skillId, query = "", method = "") {
  if (!familyCache.has(season)) familyCache.set(season, new Map());
  const cache = familyCache.get(season);
  if (!cache.has(skillId)) {
    const groups = new Map();
    const ranks = { 一阶: 1, 二阶: 2, 三阶: 3, 首领: 4 };
    for (const spirit of skillLearners(season, skillId)) {
      const id = spirit.familyId ?? spirit.id;
      if (!groups.has(id)) groups.set(id, []);
      groups.get(id).push(spirit);
    }
    cache.set(skillId, [...groups].map(([id, members]) => ({ id,
      members: members.sort((a, b) => (ranks[a.stage] ?? 99) - (ranks[b.stage] ?? 99)),
      names: season.spirits.filter((spirit) => (spirit.familyId ?? spirit.id) === id).map((spirit) => spirit.fullName),
    })));
  }
  return cache.get(skillId).flatMap(({ id, members, names }) => {
    const matched = members.filter((spirit) => !method || spirit.methods.some((text) => method === "default" ? /默认学习|Lv\./.test(text) : text.includes(method)));
    if (!matched.length || !names.some((name) => name.includes(query.trim()))) return [];
    const representative = matched[0];
    return [{ id, representative, members: matched }];
  });
}
