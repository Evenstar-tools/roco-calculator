import { resolveSkillHealing } from "./clown-trick.js";

const BARON_GREED_TRAIT_NAME = "贪得无厌";
const BARON_BASE_LIFESTEAL_PERCENT = 50;
const LIFESTEAL_PERCENT_PER_LEVEL = 10;

function traitName(trait) {
  return String(trait?.displayName ?? trait?.name ?? "").trim();
}

export function hasBaronGreedTrait(traits = []) {
  return traits.some((trait) => traitName(trait) === BARON_GREED_TRAIT_NAME);
}

export function resolveLifestealCapability({
  persistentLifestealPercent = 0,
  traits = [],
} = {}) {
  const basePercent = hasBaronGreedTrait(traits)
    ? BARON_BASE_LIFESTEAL_PERCENT
    : 0;
  const percent = basePercent +
    Math.max(0, Number(persistentLifestealPercent) || 0);
  return {
    basePercent,
    levels: percent / LIFESTEAL_PERCENT_PER_LEVEL,
    percent,
  };
}

export function resolveBaronGreed({
  applySelfDamage = true,
  attackerCurrentHp,
  attackerMaximumHp,
  attackerTraits = [],
  context = {},
  includeDirectHealing = true,
  mainDamage = 0,
  persistentLifestealPercent = 0,
  skill,
  targetCurrentHp,
} = {}) {
  if (!hasBaronGreedTrait(attackerTraits)) {
    return {
      active: false,
      actualHealing: 0,
      attackLevelStageAdd: 0,
      currentHpAfterHealing: 0,
      currentHpAfterSettlement: 0,
      effectiveLifestealPercent: 0,
      lifestealLevels: 0,
      missingHp: 0,
      overflowHealing: 0,
      requestedHealing: 0,
      selfDamageAfterHealing: 0,
      selfDamageBeforeHealing: 0,
      settlement: null,
    };
  }

  const capability = resolveLifestealCapability({
    persistentLifestealPercent,
    traits: attackerTraits,
  });
  const healing = resolveSkillHealing({
    applySelfDamage,
    attackerCurrentHp,
    attackerMaximumHp,
    baseLifestealPercent: capability.basePercent,
    context,
    includeDirectHealing,
    mainDamage,
    persistentLifestealPercent,
    skill,
    targetCurrentHp,
  });
  const overflowHealing = Math.max(
    0,
    healing.requestedHealing - healing.missingHp,
  );
  const actualHealing = healing.actualHealing;
  const currentHpAfterHealing = healing.currentHpAfterHealing;
  const currentHpAfterSettlement = healing.currentHpAfterSettlement;
  const attackLevelStageAdd = healing.maximumHp > 0
    ? Math.floor(overflowHealing * 20 / healing.maximumHp)
    : 0;
  const attackPercentAdd = attackLevelStageAdd * 10;
  const lines = [
    `吸血${capability.percent}%`,
    actualHealing > 0 ? `回复${actualHealing}` : null,
    `溢出${overflowHealing}`,
    `本次加攻+${attackPercentAdd}%`,
    healing.selfDamageAfterHealing > 0
      ? `吸血后自损${healing.selfDamageAfterHealing}`
      : null,
  ].filter(Boolean);

  return {
    active:
      healing.requestedHealing > 0 || healing.selfDamageAfterHealing > 0,
    actualHealing,
    attackLevelStageAdd,
    currentHpAfterHealing,
    currentHpAfterSettlement,
    effectiveLifestealPercent: healing.lifestealPercent,
    lifestealLevels: capability.levels,
    missingHp: healing.missingHp,
    overflowHealing,
    requestedHealing: healing.requestedHealing,
    selfDamageAfterHealing: healing.selfDamageAfterHealing,
    selfDamageBeforeHealing: 0,
    settlement: {
      kind: "baron-greed",
      lines: [lines.join(" · ")],
      side: "attacker",
      status: attackLevelStageAdd > 0 ? "applied" : "inactive",
      text: lines.join("｜"),
      traitId: "reviewed-trait:baron-greed-v2",
    },
  };
}

export function resolveBaronGreedHitSequence({
  attackerCurrentHp,
  attackerMaximumHp,
  attackerTraits = [],
  calculateHit,
  context = {},
  hitCount = 1,
  persistentLifestealPercent = 0,
  skill,
  targetCurrentHp,
} = {}) {
  const normalizedHitCount = Math.max(
    1,
    Math.floor(Number(hitCount) || 1),
  );
  if (
    !hasBaronGreedTrait(attackerTraits) ||
    typeof calculateHit !== "function"
  ) {
    return { hitDamages: [] };
  }

  const maximumHp = Math.max(0, Math.round(Number(attackerMaximumHp) || 0));
  let currentHp = Math.min(
    maximumHp,
    Math.max(0, Math.round(Number(attackerCurrentHp) || 0)),
  );
  const parsedTargetHp = Number(targetCurrentHp);
  let targetHp = Number.isFinite(parsedTargetHp)
    ? Math.max(0, Math.round(parsedTargetHp))
    : undefined;
  let attackLevelStageAdd = 0;
  let currentHpAfterHealing = currentHp;
  let overflowHealing = 0;
  let requestedHealing = 0;
  let selfDamageAfterHealing = 0;
  const hitDamages = [];
  const capability = resolveLifestealCapability({
    persistentLifestealPercent,
    traits: attackerTraits,
  });

  for (let index = 0; index < normalizedHitCount; index += 1) {
    const calculated = calculateHit({
      attackLevelStageAdd,
      hitIndex: index,
    });
    const damage = Math.max(
      0,
      Math.floor(Number(calculated?.total ?? calculated) || 0),
    );
    const hitHealing = resolveSkillHealing({
      applySelfDamage: index === normalizedHitCount - 1,
      attackerCurrentHp: currentHp,
      attackerMaximumHp: maximumHp,
      baseLifestealPercent: capability.basePercent,
      context,
      includeDirectHealing: index === normalizedHitCount - 1,
      mainDamage: damage,
      persistentLifestealPercent,
      skill,
      targetCurrentHp: targetHp,
    });

    const actualHealing = hitHealing.actualHealing;
    requestedHealing += hitHealing.requestedHealing;
    overflowHealing += Math.max(
      0,
      hitHealing.requestedHealing - hitHealing.missingHp,
    );
    attackLevelStageAdd = maximumHp > 0
      ? Math.floor(overflowHealing * 20 / maximumHp)
      : 0;
    currentHpAfterHealing = hitHealing.currentHpAfterHealing;
    selfDamageAfterHealing += hitHealing.selfDamageAfterHealing;
    currentHp = hitHealing.currentHpAfterSettlement;
    if (targetHp !== undefined) targetHp = Math.max(0, targetHp - damage);
    hitDamages.push(damage);
  }

  const attackPercentAdd = attackLevelStageAdd * 10;
  const lines = [
    `逐击 ${hitDamages.join("/")}`,
    [
      `吸血${capability.percent}%`,
      `溢出${overflowHealing}`,
      `本次加攻+${attackPercentAdd}%`,
      selfDamageAfterHealing > 0
        ? `吸血后自损${selfDamageAfterHealing}`
        : null,
    ].filter(Boolean).join(" · "),
  ];

  return {
    active: requestedHealing > 0 || selfDamageAfterHealing > 0,
    attackLevelStageAdd,
    currentHpAfterHealing,
    currentHpAfterSettlement: currentHp,
    effectiveLifestealPercent: capability.percent,
    hitDamages,
    missingHp: Math.max(0, maximumHp - currentHp),
    overflowHealing,
    requestedHealing,
    selfDamageAfterHealing,
    settlement: {
      kind: "baron-greed",
      lines,
      side: "attacker",
      status: attackLevelStageAdd > 0 ? "applied" : "inactive",
      text: lines.join("｜"),
      traitId: "reviewed-trait:baron-greed-v2",
    },
    totalDamage: hitDamages.reduce((sum, damage) => sum + damage, 0),
  };
}
