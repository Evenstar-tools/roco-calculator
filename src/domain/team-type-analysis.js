import { ELEMENT_TYPES, getTypeMultiplier } from "./type-chart.js";

const ATTACKING_SKILL_CATEGORIES = new Set(["physical", "magical", "dual"]);
const BLOODLINE_TYPE_LABELS = new Map([
  ["normal", "普通"], ["grass", "草"], ["fire", "火"], ["water", "水"],
  ["light", "光"], ["ground", "地"], ["ice", "冰"], ["dragon", "龙"],
  ["electric", "电"], ["poison", "毒"], ["bug", "虫"], ["martial", "武"],
  ["wing", "翼"], ["moe", "萌"], ["ghost", "幽"], ["evil", "恶"],
  ["machine", "机械"], ["phantom", "幻"],
]);

function entryId(entry) {
  if (typeof entry === "string") return entry;
  return entry?.skillId ?? entry?.id ?? null;
}

function resolveAttackingSkills({
  defaultBloodlineType,
  includeWishPower,
  learnsetBySpiritId,
  member,
  skillById,
}) {
  const carriedSkills = (member.skills?.four ?? [])
    .map((entry) => skillById.get(entryId(entry)))
    .filter(
      (skill) =>
        skill?.type && ATTACKING_SKILL_CATEGORIES.has(skill.category),
    );
  if (!includeWishPower) return carriedSkills;

  const effectiveBloodlineType = member.bloodlineType ?? defaultBloodlineType;
  const bloodlineType = BLOODLINE_TYPE_LABELS.get(effectiveBloodlineType);
  if (bloodlineType) {
    return [
      ...carriedSkills,
      {
        id: `calculator_wish_power_${effectiveBloodlineType}`,
        name: "愿力冲击",
        sourceKind: "wish-power",
        type: bloodlineType,
      },
    ];
  }
  if (effectiveBloodlineType !== "boss") return carriedSkills;

  const bossWishPower = (
    learnsetBySpiritId.get(member.spiritId)?.skillIds ?? []
  )
    .map((skillId) => skillById.get(skillId))
    .find((skill) => skill?.id?.startsWith("calculator_wish_power_"));
  return bossWishPower
    ? [...carriedSkills, { ...bossWishPower, sourceKind: "wish-power" }]
    : carriedSkills;
}

function bestAttackAgainst(attackingSkills, defenderTypes, typeChart) {
  return attackingSkills
    .map((skill) => ({
      multiplier: getTypeMultiplier(skill.type, defenderTypes, typeChart),
      sourceKind: skill.sourceKind ?? "skill",
      skillId: skill.id,
      skillName: skill.name,
      skillType: skill.type,
    }))
    .sort((left, right) => right.multiplier - left.multiplier)[0];
}

function resolveMember(member, slotIndex, spiritById) {
  if (!member || member.needsRepair) return null;
  const spirit = spiritById.get(member.spiritId);
  if (!spirit || !Array.isArray(spirit.types) || spirit.types.length === 0) {
    return null;
  }
  return {
    assetUrl: spirit.asset?.localUrl ?? null,
    name: spirit.fullName ?? spirit.name ?? "未知精灵",
    slotIndex,
    spiritId: spirit.id,
    types: spirit.types,
  };
}

export function analyzeTeamDefensiveTypes({
  members = [],
  spirits = [],
  typeChart,
} = {}) {
  const spiritById = new Map(spirits.map((spirit) => [spirit.id, spirit]));
  const configuredMembers = members
    .map((member, index) => resolveMember(member, index, spiritById))
    .filter(Boolean);
  const occupiedCount = members.filter(Boolean).length;

  const rows = ELEMENT_TYPES.map((type, order) => {
    const matchups = configuredMembers.map((member) => ({
      ...member,
      multiplier: getTypeMultiplier(type, member.types, typeChart),
    }));
    const weakMembers = matchups.filter(({ multiplier }) => multiplier > 1);
    const resistantMembers = matchups.filter(
      ({ multiplier }) => multiplier > 0 && multiplier < 1,
    );
    const immuneMembers = matchups.filter(({ multiplier }) => multiplier === 0);

    return {
      immuneMembers,
      immunityCount: immuneMembers.length,
      neutralCount: matchups.filter(({ multiplier }) => multiplier === 1)
        .length,
      order,
      resistanceCount: resistantMembers.length,
      resistantMembers,
      type,
      weakCount: weakMembers.length,
      weakMembers,
    };
  });

  const riskRows = rows
    .filter(({ weakCount }) => weakCount > 0)
    .sort(
      (left, right) =>
        right.weakCount - left.weakCount ||
        right.weakMembers.filter(({ multiplier }) => multiplier === 3).length -
          left.weakMembers.filter(({ multiplier }) => multiplier === 3).length ||
        left.resistanceCount - right.resistanceCount ||
        left.order - right.order,
    );

  return {
    configuredCount: configuredMembers.length,
    riskRows,
    rows,
    skippedCount: occupiedCount - configuredMembers.length,
  };
}

export function analyzeTeamTypes({
  includeWishPower = false,
  learnsets = [],
  members = [],
  skills = [],
  spirits = [],
  typeChart,
} = {}) {
  const spiritById = new Map(spirits.map((spirit) => [spirit.id, spirit]));
  const skillById = new Map(skills.map((skill) => [skill.id, skill]));
  const learnsetBySpiritId = new Map(
    learnsets.map((learnset) => [learnset.spiritId, learnset]),
  );
  const configuredMembers = members
    .map((member, index) => {
      const resolved = resolveMember(member, index, spiritById);
      if (!resolved) return null;
      const attackingSkills = resolveAttackingSkills({
        defaultBloodlineType:
          spiritById.get(member.spiritId)?.stage === "首领" ? "boss" : "normal",
        includeWishPower,
        learnsetBySpiritId,
        member,
        skillById,
      });
      return {
        ...resolved,
        defense: ELEMENT_TYPES.map((type) => ({
          multiplier: getTypeMultiplier(type, resolved.types, typeChart),
          type,
        })),
        offense: ELEMENT_TYPES.map((type) => {
          const best = bestAttackAgainst(attackingSkills, [type], typeChart);
          return best ? { ...best, type } : {
            multiplier: null,
            skillId: null,
            skillName: null,
            skillType: null,
            type,
          };
        }),
      };
    })
    .filter(Boolean);

  return {
    configuredCount: configuredMembers.length,
    members: configuredMembers,
    skippedCount: members.filter(Boolean).length - configuredMembers.length,
    types: ELEMENT_TYPES,
  };
}

export function analyzeTeamMatchups({
  attackers = [],
  defenders = [],
  includeWishPower = false,
  learnsets = [],
  skills = [],
  spirits = [],
  typeChart,
} = {}) {
  const spiritById = new Map(spirits.map((spirit) => [spirit.id, spirit]));
  const skillById = new Map(skills.map((skill) => [skill.id, skill]));
  const learnsetBySpiritId = new Map(
    learnsets.map((learnset) => [learnset.spiritId, learnset]),
  );
  const resolvedAttackers = attackers
    .map((member, index) => ({
      member,
      resolved: resolveMember(member, index, spiritById),
    }))
    .filter(({ resolved }) => resolved);
  const resolvedDefenders = defenders
    .map((member, index) => resolveMember(member, index, spiritById))
    .filter(Boolean);

  const cells = resolvedAttackers.map(({ member, resolved: attacker }) => {
    const attackingSkills = resolveAttackingSkills({
      defaultBloodlineType:
        spiritById.get(member.spiritId)?.stage === "首领" ? "boss" : "normal",
      includeWishPower,
      learnsetBySpiritId,
      member,
      skillById,
    });
    return resolvedDefenders.map((defender) => {
      const best = bestAttackAgainst(
        attackingSkills,
        defender.types,
        typeChart,
      );
      return {
        attackerSlotIndex: attacker.slotIndex,
        defenderSlotIndex: defender.slotIndex,
        multiplier: best?.multiplier ?? null,
        skillId: best?.skillId ?? null,
        skillName: best?.skillName ?? null,
        skillType: best?.skillType ?? null,
        sourceKind: best?.sourceKind ?? null,
      };
    });
  });

  return {
    attackers: resolvedAttackers.map(({ resolved }) => resolved),
    cells,
    defenders: resolvedDefenders,
  };
}
