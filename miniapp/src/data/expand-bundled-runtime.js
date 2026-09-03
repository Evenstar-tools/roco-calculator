export function expandBundledRuntime(payload) {
  if (!Array.isArray(payload?.learnsetSkillIndexes)) return payload;

  const { defaultSkillIndexes = {}, learnsetSkillIndexes, ...snapshot } = payload;
  const skills = snapshot.skills ?? [];
  const spirits = snapshot.spirits ?? [];

  if (learnsetSkillIndexes.length !== spirits.length) {
    throw new Error("内置技能表与精灵数量不一致");
  }

  function skillIndexesToIds(skillIndexes) {
    return skillIndexes.map((skillIndex) => {
      const skillId = skills[skillIndex]?.id;
      if (!skillId) throw new Error(`内置技能索引无效：${skillIndex}`);
      return skillId;
    });
  }

  const learnsets = learnsetSkillIndexes.map((skillIndexes, spiritIndex) => {
    const defaultIndexes = defaultSkillIndexes[spiritIndex];
    return {
      spiritId: spirits[spiritIndex].id,
      skillIds: skillIndexesToIds(skillIndexes),
      ...(Array.isArray(defaultIndexes)
        ? { defaultSkillIds: skillIndexesToIds(defaultIndexes) }
        : {}),
    };
  });

  return { ...snapshot, learnsets };
}
