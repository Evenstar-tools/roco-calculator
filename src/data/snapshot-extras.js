const WISH_POWER_TYPES = Object.freeze([
  ["normal", "普通"],
  ["grass", "草"],
  ["fire", "火"],
  ["water", "水"],
  ["light", "光"],
  ["ground", "地"],
  ["ice", "冰"],
  ["dragon", "龙"],
  ["electric", "电"],
  ["poison", "毒"],
  ["bug", "虫"],
  ["martial", "武"],
  ["wing", "翼"],
  ["moe", "萌"],
  ["ghost", "幽"],
  ["evil", "恶"],
  ["machine", "机械"],
  ["phantom", "幻"],
]);

const WISH_POWER_SKILLS = Object.freeze(
  WISH_POWER_TYPES.map(([suffix, type]) => ({
    basePower: 80,
    category: "dual",
    cost: 2,
    description:
      "取物攻与魔攻中较高的一项；目标本回合使用状态技能时，威力×2.5且必定先手。",
    id: `calculator_wish_power_${suffix}`,
    name: "愿力冲击",
    pickerVisibility: "search-only",
    searchText: "愿力冲击|yuanlichongji|ylcj",
    provenance: {
      ruleId: "rock-calculator:reviewed-special-skill-2026-07-24",
    },
    ruleId: null,
    type,
  })),
);

const WISH_POWER_ID_BY_TYPE = new Map(
  WISH_POWER_SKILLS.map((skill) => [skill.type, skill.id]),
);

function bossWishPowerIds(spirit, traitsById) {
  const descriptions = (spirit.traitIds ?? [])
    .map((traitId) => traitsById.get(traitId)?.description ?? "")
    .join("\n");
  const type = descriptions.match(/替换为([^，。；\s]+)系愿力冲击/)?.[1];
  const skillId = WISH_POWER_ID_BY_TYPE.get(type);
  return skillId ? [skillId] : [];
}

export function withCalculatorExtras(snapshot) {
  const skills = snapshot?.skills ?? [];
  const existingIds = new Set(skills.map((skill) => skill.id));
  const missing = WISH_POWER_SKILLS.filter(
    (skill) => !existingIds.has(skill.id),
  );
  const wishPowerIds = WISH_POWER_SKILLS.map((skill) => skill.id);
  const spiritsById = new Map(
    (snapshot?.spirits ?? []).map((spirit) => [spirit.id, spirit]),
  );
  const traitsById = new Map(
    (snapshot?.traits ?? []).map((trait) => [trait.id, trait]),
  );
  let learnsetsChanged = false;
  const learnsets = (snapshot?.learnsets ?? []).map((learnset) => {
    const spirit = spiritsById.get(learnset.spiritId);
    if (!spirit || spirit.calculationStatus === "pending-race-stats") {
      return learnset;
    }

    const currentSkillIds = learnset.skillIds ?? [];
    const currentSet = new Set(currentSkillIds);
    const learnableWishPowerIds = spirit.stage === "首领"
      ? bossWishPowerIds(spirit, traitsById)
      : wishPowerIds;
    const missingWishPowerIds = learnableWishPowerIds.filter(
      (skillId) => !currentSet.has(skillId),
    );
    if (missingWishPowerIds.length === 0) return learnset;

    learnsetsChanged = true;
    return {
      ...learnset,
      skillIds: [...currentSkillIds, ...missingWishPowerIds],
    };
  });

  if (missing.length === 0 && !learnsetsChanged) return snapshot;
  return {
    ...snapshot,
    skills: [...skills, ...missing],
    learnsets,
  };
}
