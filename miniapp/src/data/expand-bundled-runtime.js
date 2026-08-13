export function expandBundledRuntime(payload) {
  if (!Array.isArray(payload?.learnsetSkillIndexes)) return payload;

  const { learnsetSkillIndexes, ...snapshot } = payload;
  const skills = snapshot.skills ?? [];
  const spirits = snapshot.spirits ?? [];

  if (learnsetSkillIndexes.length !== spirits.length) {
    throw new Error("内置技能表与精灵数量不一致");
  }

  const learnsets = learnsetSkillIndexes.map((skillIndexes, spiritIndex) => ({
    spiritId: spirits[spiritIndex].id,
    skillIds: skillIndexes.map((skillIndex) => {
      const skillId = skills[skillIndex]?.id;
      if (!skillId) throw new Error(`内置技能索引无效：${skillIndex}`);
      return skillId;
    }),
  }));

  return { ...snapshot, learnsets };
}
