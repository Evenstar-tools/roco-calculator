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

const SPIRIT_COMMUNITY_ALIASES_BY_ID = Object.freeze({
  spirit_07cdb4d4a94ac1bd: Object.freeze(["马头"]),
  spirit_6a95a48463d87bef: Object.freeze(["马头"]),
  spirit_77c2085d2f6e8e87: Object.freeze(["塑料袋", "大牌姐"]),
  spirit_8e02f5b94a74428b: Object.freeze(["教练"]),
  spirit_dcb0504a22dc89a2: Object.freeze(["毛豆"]),
  spirit_b5f7f523f4cb4178: Object.freeze(["毛豆"]),
  spirit_d345729d1593bff7: Object.freeze(["胖猫"]),
  spirit_d7a201531161488e: Object.freeze(["胖猫"]),
  spirit_e926effbf164759a: Object.freeze(["马超"]),
  spirit_552a95c89d0867e1: Object.freeze(["凶", "区", "蛆"]),
  spirit_9dd866cafbbf24f3: Object.freeze(["凶", "区", "蛆"]),
  spirit_30c4c0a5620c04b2: Object.freeze(["凶", "区", "蛆"]),
  spirit_aab4cd6a788bef56: Object.freeze(["凶", "区", "蛆"]),
  spirit_7ec0b892b12a44fc: Object.freeze(["凶", "区", "蛆"]),
  spirit_56b76e5cddf39081: Object.freeze(["uu"]),
  spirit_3fb98e0a461b35c8: Object.freeze(["石王", "布莱克岩"]),
  spirit_b75ef6a541e92530: Object.freeze(["书王"]),
  spirit_7c31fbd89f093c5d: Object.freeze(["我红"]),
  spirit_c43a0b85bf30c248: Object.freeze(["科比"]),
  spirit_3a0b383ca1a11675: Object.freeze(["火狗"]),
  spirit_17446a2b41bf4052: Object.freeze(["电羊"]),
  spirit_563a4e078a1d8cba: Object.freeze(["莎莎"]),
  spirit_4bc9a982e5888257: Object.freeze(["菠萝"]),
  spirit_cd669a9720f51fe4: Object.freeze(["UFO", "扫地机器人"]),
});

function addSpiritCommunityAliases(spirits) {
  let changed = false;
  const enriched = spirits.map((spirit) => {
    const aliases = SPIRIT_COMMUNITY_ALIASES_BY_ID[spirit.id];
    if (!aliases) return spirit;

    const currentAliases = Array.isArray(spirit.aliases)
      ? spirit.aliases
      : [];
    const knownAliases = new Set(currentAliases);
    const missingAliases = aliases.filter((alias) => !knownAliases.has(alias));
    if (missingAliases.length === 0) return spirit;

    changed = true;
    return {
      ...spirit,
      aliases: [...currentAliases, ...missingAliases],
    };
  });
  return { changed, spirits: enriched };
}

function bossWishPowerIds(spirit, traitsById) {
  const descriptions = (spirit.traitIds ?? [])
    .map((traitId) => traitsById.get(traitId)?.description ?? "")
    .join("\n");
  const type = descriptions.match(/替换为([^，。；\s]+)系愿力冲击/)?.[1];
  const skillId = WISH_POWER_ID_BY_TYPE.get(type);
  return skillId ? [skillId] : [];
}

export function withCalculatorExtras(snapshot) {
  const aliasResult = addSpiritCommunityAliases(snapshot?.spirits ?? []);
  const skills = snapshot?.skills ?? [];
  const existingIds = new Set(skills.map((skill) => skill.id));
  const missing = WISH_POWER_SKILLS.filter(
    (skill) => !existingIds.has(skill.id),
  );
  const wishPowerIds = WISH_POWER_SKILLS.map((skill) => skill.id);
  const spiritsById = new Map(
    aliasResult.spirits.map((spirit) => [spirit.id, spirit]),
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

  if (missing.length === 0 && !learnsetsChanged && !aliasResult.changed) {
    return snapshot;
  }
  return {
    ...snapshot,
    spirits: aliasResult.spirits,
    skills: [...skills, ...missing],
    learnsets,
  };
}
