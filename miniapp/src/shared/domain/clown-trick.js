export const CLOWN_TRICK_ENABLED = true;

const CLOWN_TRICK_TRAIT_NAME = "戏耍";

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function traitName(trait) {
  return String(trait?.displayName ?? trait?.name ?? "").trim();
}

function parsePercent(description, pattern) {
  const match = String(description ?? "").match(pattern);
  return match ? Math.max(0, Number(match[1]) || 0) : 0;
}

export function inherentLifestealPercent(skill, context, currentHpPercent) {
  const description = String(skill?.description ?? "");
  const lifesteal = parsePercent(
    description,
    /吸血\s*(\d+(?:\.\d+)?)\s*[%％]/,
  );
  if (lifesteal <= 0) return 0;

  const lifestealIndex = description.search(/吸血\s*\d/);
  const responseIndex = description.search(/应对(?:状态|攻击|技能|防御)/);
  if (
    responseIndex >= 0 &&
    responseIndex < lifestealIndex &&
    context?.counterTriggered !== true
  ) return 0;
  if (
    /若自己生命低于\s*50\s*[%％]/.test(description) &&
    currentHpPercent >= 50
  ) return 0;
  return lifesteal;
}

export function directHealingPercent(skill, context) {
  const description = String(skill?.description ?? "");
  const healing = parsePercent(
    description,
    /自己回复\s*(\d+(?:\.\d+)?)\s*[%％]\s*生命/,
  );
  if (healing <= 0) return 0;

  const healingIndex = description.search(/自己回复\s*\d/);
  const responseIndex = description.search(/应对(?:状态|攻击|技能|防御)/);
  if (
    responseIndex >= 0 &&
    responseIndex < healingIndex &&
    context?.counterTriggered !== true
  ) return 0;
  return healing;
}

export function hasClownTrickTrait(traits = []) {
  return CLOWN_TRICK_ENABLED && traits.some(
    (trait) => traitName(trait) === CLOWN_TRICK_TRAIT_NAME,
  );
}

export function resolveSkillHealing({
  attackerCurrentHp,
  attackerMaximumHp,
  baseLifestealPercent = 0,
  context = {},
  externalHealingSources = [],
  mainDamage = 0,
  persistentLifestealPercent = 0,
  skill,
} = {}) {
  const maximumHp = Math.max(0, Math.round(Number(attackerMaximumHp) || 0));
  const currentHp = clamp(
    Math.round(Number(attackerCurrentHp) || 0),
    0,
    maximumHp,
  );
  const missingHp = maximumHp - currentHp;
  const currentHpPercent = maximumHp > 0 ? currentHp / maximumHp * 100 : 0;
  const lifestealPercent =
    Math.max(0, Number(baseLifestealPercent) || 0) +
    Math.max(0, Number(persistentLifestealPercent) || 0) +
    inherentLifestealPercent(skill, context, currentHpPercent);
  const healPercent = directHealingPercent(skill, context);
  const lifestealHealing = Math.floor(
    Math.max(0, Number(mainDamage) || 0) * lifestealPercent / 100,
  );
  const directHealing = Math.round(maximumHp * healPercent / 100);
  const normalizedExternalSources = externalHealingSources
    .map((source) => ({
      amount: Math.max(0, Math.round(Number(source?.amount) || 0)),
      label: String(source?.label ?? "").trim(),
    }))
    .filter((source) => source.amount > 0 && source.label.length > 0);
  const externalHealing = normalizedExternalSources.reduce(
    (sum, source) => sum + source.amount,
    0,
  );
  const healingSources = [
    lifestealHealing > 0
      ? { amount: lifestealHealing, label: "吸血" }
      : null,
    directHealing > 0
      ? { amount: directHealing, label: "回复" }
      : null,
    ...normalizedExternalSources,
  ].filter(Boolean);
  return {
    currentHp,
    directHealing,
    externalHealing,
    healPercent,
    healingSources,
    lifestealHealing,
    lifestealPercent,
    maximumHp,
    missingHp,
    requestedHealing: lifestealHealing + directHealing + externalHealing,
  };
}

export function resolveClownTrickDamage({
  attackerTraits = [],
  attackerCurrentHp,
  attackerMaximumHp,
  context = {},
  externalHealingSources = [],
  mainDamage = 0,
  persistentLifestealPercent = 0,
  skill,
} = {}) {
  if (!hasClownTrickTrait(attackerTraits)) {
    return {
      active: false,
      actualHealing: 0,
      damage: 0,
      healPercent: 0,
      lifestealPercent: 0,
      missingHp: 0,
      requestedHealing: 0,
      settlement: null,
    };
  }

  const healing = resolveSkillHealing({
    attackerCurrentHp,
    attackerMaximumHp,
    context,
    externalHealingSources,
    mainDamage,
    persistentLifestealPercent,
    skill,
  });
  const {
    healPercent,
    healingSources,
    lifestealPercent,
    missingHp,
    requestedHealing,
  } = healing;
  const actualHealing = Math.min(missingHp, requestedHealing);
  const sourceLabels = healingSources.map(
    (source) => `${source.label} ${source.amount}`,
  );
  const text = requestedHealing > 0
    ? actualHealing > 0
      ? `戏耍｜${sourceLabels.join(" + ")}，实际回复 ${actualHealing} → 追加 ${actualHealing} 真实伤害`
      : `戏耍｜当前满血，溢出治疗不计伤害`
    : null;

  return {
    active: requestedHealing > 0,
    actualHealing,
    damage: actualHealing,
    healPercent,
    lifestealPercent,
    missingHp,
    requestedHealing,
    settlement: text
      ? {
          side: "attacker",
          status: actualHealing > 0 ? "applied" : "inactive",
          text,
          traitId: "reviewed-trait:clown-trick-v1",
        }
      : null,
  };
}
