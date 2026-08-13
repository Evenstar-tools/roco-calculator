export const ELEMENT_TYPES = Object.freeze([
  "普通",
  "草",
  "火",
  "水",
  "光",
  "地",
  "冰",
  "龙",
  "电",
  "毒",
  "虫",
  "武",
  "翼",
  "萌",
  "幽",
  "恶",
  "机械",
  "幻",
]);

const BUILTIN_RELATIONS = Object.freeze({
  普通: { strongAgainst: [], resistedBy: ["地", "幽", "机械"] },
  草: {
    strongAgainst: ["水", "光", "地"],
    resistedBy: ["火", "龙", "毒", "虫", "翼", "机械"],
  },
  火: {
    strongAgainst: ["草", "冰", "虫", "机械"],
    resistedBy: ["水", "地", "龙"],
  },
  水: {
    strongAgainst: ["火", "地", "机械"],
    resistedBy: ["草", "冰", "龙"],
  },
  光: { strongAgainst: ["幽", "恶"], resistedBy: ["草", "冰"] },
  地: {
    strongAgainst: ["火", "冰", "电", "毒"],
    resistedBy: ["草", "武"],
  },
  冰: {
    strongAgainst: ["草", "地", "龙", "翼"],
    resistedBy: ["火", "冰", "机械"],
  },
  龙: { strongAgainst: ["龙"], resistedBy: ["机械"] },
  电: {
    strongAgainst: ["水", "翼"],
    resistedBy: ["草", "地", "龙", "电"],
  },
  毒: {
    strongAgainst: ["草", "萌"],
    resistedBy: ["地", "毒", "幽", "机械"],
  },
  虫: {
    strongAgainst: ["草", "恶", "幻"],
    resistedBy: ["火", "毒", "武", "翼", "萌", "幽", "机械"],
  },
  武: {
    strongAgainst: ["普通", "地", "冰", "恶", "机械"],
    resistedBy: ["毒", "虫", "翼", "萌", "幽", "幻"],
  },
  翼: {
    strongAgainst: ["草", "虫", "武"],
    resistedBy: ["地", "龙", "电", "机械"],
  },
  萌: {
    strongAgainst: ["龙", "武", "恶"],
    resistedBy: ["火", "毒", "机械"],
  },
  幽: {
    strongAgainst: ["光", "幽", "幻"],
    resistedBy: ["普通", "恶"],
  },
  恶: {
    strongAgainst: ["毒", "萌", "幽"],
    resistedBy: ["光", "武", "恶"],
  },
  机械: {
    strongAgainst: ["地", "冰", "萌"],
    resistedBy: ["火", "水", "电", "机械"],
  },
  幻: {
    strongAgainst: ["毒", "武"],
    resistedBy: ["光", "机械", "幻"],
  },
});

function getBuiltinSingleMultiplier(attackType, defenderType) {
  const relation = BUILTIN_RELATIONS[attackType];
  if (!relation || !BUILTIN_RELATIONS[defenderType]) return 1;
  if (relation.strongAgainst.includes(defenderType)) return 2;
  if (relation.resistedBy.includes(defenderType)) return 0.5;
  return 1;
}

function getMatrixSingleMultiplier(attackType, defenderType, chart) {
  const attackIndex = chart.types.indexOf(attackType);
  const defenderIndex = chart.types.indexOf(defenderType);
  const value = chart.matrix?.[attackIndex]?.[defenderIndex];

  return Number.isFinite(value) && value >= 0 ? value : 1;
}

export function getTypeMultiplier(
  attackType,
  defenderTypes,
  chart = undefined,
) {
  const uniqueDefenderTypes = [
    ...new Set((Array.isArray(defenderTypes) ? defenderTypes : [defenderTypes]).filter(Boolean)),
  ];
  const usesMatrix =
    Array.isArray(chart?.types) && Array.isArray(chart?.matrix);
  const rawMultiplier = uniqueDefenderTypes.reduce((multiplier, defenderType) => {
    const singleMultiplier = usesMatrix
      ? getMatrixSingleMultiplier(attackType, defenderType, chart)
      : getBuiltinSingleMultiplier(attackType, defenderType);
    return multiplier * singleMultiplier;
  }, 1);

  if (rawMultiplier === 0) return 0;
  if (rawMultiplier >= 4) return 3;
  if (rawMultiplier <= 0.25) return 0.25;
  return rawMultiplier;
}

const ATTACKING_SKILL_CATEGORIES = new Set(["physical", "magical", "dual"]);

export function analyzeDefensiveTypes(defenderTypes, chart = undefined) {
  const matchups = ELEMENT_TYPES.map((type) => ({
    type,
    multiplier: getTypeMultiplier(type, defenderTypes, chart),
  }));
  return {
    weaknesses: matchups.filter(({ multiplier }) => multiplier > 1),
    resistances: matchups.filter(({ multiplier }) => multiplier < 1),
  };
}

export function analyzeSkillTypeCoverage(skills, chart = undefined) {
  const attackingTypes = [
    ...new Set(
      (Array.isArray(skills) ? skills : [])
        .filter(
          (skill) =>
            skill?.type && ATTACKING_SKILL_CATEGORIES.has(skill.category),
        )
        .map((skill) => skill.type),
    ),
  ];
  if (attackingTypes.length === 0) {
    return { attackingTypes, blindSpots: [], coverage: [] };
  }

  const matchups = ELEMENT_TYPES.map((type) => {
    const multipliers = attackingTypes.map((attackType) =>
      getTypeMultiplier(attackType, [type], chart),
    );
    const hasCoverage = multipliers.some((multiplier) => multiplier > 1);
    const isBlindSpot = multipliers.every((multiplier) => multiplier < 1);
    return {
      type,
      coverageMultiplier: hasCoverage ? 2 : 1,
      blindSpotMultiplier: isBlindSpot ? 0.5 : 1,
    };
  });
  return {
    attackingTypes,
    blindSpots: matchups
      .filter(({ blindSpotMultiplier }) => blindSpotMultiplier < 1)
      .map(({ type, blindSpotMultiplier: multiplier }) => ({ type, multiplier })),
    coverage: matchups
      .filter(({ coverageMultiplier }) => coverageMultiplier > 1)
      .map(({ type, coverageMultiplier: multiplier }) => ({ type, multiplier })),
  };
}
