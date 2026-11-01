const FAIR_PIGEON_NAME = "公平鸽";
const BALANCE_TRAIT_NAME = "衡量";

function clampStage(value) {
  return Math.min(99, Math.max(-99, Math.floor(Number(value) || 0)));
}

export function hasFairPigeonBalance(spirit) {
  return spirit?.fullName === FAIR_PIGEON_NAME &&
    spirit?.traitName === BALANCE_TRAIT_NAME;
}

export function copyPositiveAbilityStages(source = {}, target = {}, { sourceIsDelta = false } = {}) {
  const sourceStage = value => sourceIsDelta ? Number(value) || 0 : clampStage(value);
  const attack = clampStage(
    Number(target.attack ?? 0) + Math.max(0, sourceStage(source.attack)),
  );
  const categoryStages = Object.fromEntries(["physicalAttack", "magicalAttack"]
    .filter(key => source[key] !== undefined || target[key] !== undefined)
    .map(key => [key, clampStage(
      clampStage(Number(target.attack ?? 0) + Number(target[key] ?? 0)) +
      Math.max(0, sourceStage(Number(source.attack ?? 0) + Number(source[key] ?? 0))),
    ) - attack]));
  return {
    attack,
    defense: clampStage(
      Number(target.defense ?? 0) + Math.max(0, Number(source.defense ?? 0)),
    ),
    ...categoryStages,
  };
}
