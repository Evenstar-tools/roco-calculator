// The wire payload shares repeated history records and uses the existing skill
// order for learning relations. Restore the public snapshot shape before use.
export function packS5RuntimeRelations(snapshot) {
  const patches = [], items = [], patchIds = new Map(), itemIds = new Map();
  const intern = (value, ids, values) => {
    const key = JSON.stringify(value);
    if (!ids.has(key)) { ids.set(key, values.length); values.push(value); }
    return ids.get(key);
  };
  const packEntity = entity => {
    if (!entity.changeInfo) return entity;
    const { changeInfo, ...rest } = entity;
    return { ...rest, changeGroups: [changeInfo, ...(changeInfo.history ?? [])].map(group => {
      const { patch, items: changes, history: _history, ...metadata } = group;
      return [intern(patch, patchIds, patches), metadata,
        (changes ?? []).map(item => intern(item, itemIds, items))];
    }) };
  };
  const skillIndices = new Map(snapshot.skills.map((skill, index) => [skill.id, index]));
  const indexOf = id => {
    if (id === null) return null;
    if (!skillIndices.has(id)) throw new Error(`Unresolved S5 learning relation: ${id}`);
    return skillIndices.get(id);
  };
  return { ...snapshot,
    spirits: snapshot.spirits.map(packEntity), skills: snapshot.skills.map(packEntity),
    learnsets: snapshot.learnsets.map(pool => ({ ...pool,
      skillIds: pool.skillIds.map(indexOf),
      ...(pool.defaultSkillIds ? { defaultSkillIds: pool.defaultSkillIds.map(indexOf) } : {}),
      ...(pool.bloodlineSkillIds ? { bloodlineSkillIds: pool.bloodlineSkillIds.map(indexOf) } : {}),
    })), s5CompactRelations: { version: 1, patches, items } };
}

export function restoreS5RuntimeRelations(snapshot) {
  const table = snapshot.s5CompactRelations;
  if (!table) return snapshot;
  if (table.version !== 1) throw new Error("S5 数据格式已更新，请刷新页面");
  const restoreEntity = entity => {
    if (!entity.changeGroups) return entity;
    const { changeGroups, ...rest } = entity;
    const [current, ...history] = changeGroups.map(([patch, metadata, itemIds]) => ({
      patch: table.patches[patch], ...metadata,
      items: itemIds.map(index => table.items[index]),
    }));
    return { ...rest, changeInfo: { ...current, ...(history.length ? { history } : {}) } };
  };
  const skillId = index => {
    if (index === null) return null;
    const id = snapshot.skills[index]?.id;
    if (!id) throw new Error("S5 技能数据不完整，请刷新页面");
    return id;
  };
  const { s5CompactRelations: _table, ...rest } = snapshot;
  return { ...rest,
    spirits: snapshot.spirits.map(restoreEntity), skills: snapshot.skills.map(restoreEntity),
    learnsets: snapshot.learnsets.map(pool => ({ ...pool,
      skillIds: pool.skillIds.map(skillId),
      ...(pool.defaultSkillIds ? { defaultSkillIds: pool.defaultSkillIds.map(skillId) } : {}),
      ...(pool.bloodlineSkillIds ? { bloodlineSkillIds: pool.bloodlineSkillIds.map(skillId) } : {}),
    })),
  };
}
