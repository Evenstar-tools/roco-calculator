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
  attackerCurrentHp,
  attackerMaximumHp,
  attackerTraits = [],
  context = {},
  mainDamage = 0,
  persistentLifestealPercent = 0,
  skill,
} = {}) {
  if (!hasBaronGreedTrait(attackerTraits)) {
    return {
      active: false,
      attackLevelStageAdd: 0,
      effectiveLifestealPercent: 0,
      lifestealLevels: 0,
      missingHp: 0,
      overflowHealing: 0,
      requestedHealing: 0,
      settlement: null,
    };
  }

  const capability = resolveLifestealCapability({
    persistentLifestealPercent,
    traits: attackerTraits,
  });
  const healing = resolveSkillHealing({
    attackerCurrentHp,
    attackerMaximumHp,
    baseLifestealPercent: capability.basePercent,
    context,
    mainDamage,
    persistentLifestealPercent,
    skill,
  });
  const overflowHealing = Math.max(
    0,
    healing.requestedHealing - healing.missingHp,
  );
  const attackLevelStageAdd = healing.maximumHp > 0
    ? Math.floor(overflowHealing * 20 / healing.maximumHp)
    : 0;
  const attackPercentAdd = attackLevelStageAdd * 10;
  const text = healing.requestedHealing > 0
    ? overflowHealing > 0
      ? `贪得无厌｜吸血 ${capability.levels}层 · ${capability.percent}%｜溢出回复 ${overflowHealing} → 后续物攻 +${attackPercentAdd}%`
      : `贪得无厌｜吸血 ${capability.levels}层 · ${capability.percent}%｜回复未溢出，物攻不增加`
    : `贪得无厌｜吸血 ${capability.levels}层 · ${capability.percent}%`;

  return {
    active: healing.requestedHealing > 0,
    attackLevelStageAdd,
    effectiveLifestealPercent: healing.lifestealPercent,
    lifestealLevels: capability.levels,
    missingHp: healing.missingHp,
    overflowHealing,
    requestedHealing: healing.requestedHealing,
    settlement: {
      side: "attacker",
      status: attackLevelStageAdd > 0 ? "applied" : "inactive",
      text,
      traitId: "reviewed-trait:baron-greed-v1",
    },
  };
}
