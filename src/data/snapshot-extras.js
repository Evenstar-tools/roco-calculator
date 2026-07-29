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
    cost: 3,
    description:
      "取物攻与魔攻中较高的一项；目标本回合使用状态技能时，威力×2.5且必定先手。",
    id: `calculator_wish_power_${suffix}`,
    name: "愿力冲击",
    searchText: "愿力冲击|yuanlichongji|ylcj",
    provenance: {
      ruleId: "rock-calculator:reviewed-special-skill-2026-07-24",
    },
    ruleId: null,
    type,
  })),
);

export function withCalculatorExtras(snapshot) {
  const skills = snapshot?.skills ?? [];
  const existingIds = new Set(skills.map((skill) => skill.id));
  const missing = WISH_POWER_SKILLS.filter(
    (skill) => !existingIds.has(skill.id),
  );
  if (missing.length === 0) return snapshot;
  return {
    ...snapshot,
    skills: [...skills, ...missing],
  };
}
