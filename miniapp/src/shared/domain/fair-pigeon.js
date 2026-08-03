const FAIR_PIGEON_NAME = "公平鸽";
const BALANCE_TRAIT_NAME = "衡量";

function clampStage(value) {
  return Math.min(50, Math.max(-50, Math.floor(Number(value) || 0)));
}

export function hasFairPigeonBalance(spirit) {
  return spirit?.fullName === FAIR_PIGEON_NAME &&
    spirit?.traitName === BALANCE_TRAIT_NAME;
}

export function copyPositiveAbilityStages(source = {}, target = {}) {
  return {
    attack: clampStage(
      Number(target.attack ?? 0) + Math.max(0, Number(source.attack ?? 0)),
    ),
    defense: clampStage(
      Number(target.defense ?? 0) + Math.max(0, Number(source.defense ?? 0)),
    ),
  };
}
