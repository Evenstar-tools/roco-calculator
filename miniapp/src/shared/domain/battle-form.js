import { getSnapshotIndexes } from "./snapshot-indexes.js";
import { hasCompleteRaceStats } from "./stat.js";

function samePath(left, right) {
  return Boolean(left && right && (left.id === right.id ||
    left.evolutionChainIds?.includes(right.id) && right.evolutionChainIds?.includes(left.id)));
}

export function getBattleFormChoices(spirits, side) {
  const source = spirits.find((spirit) => spirit.id === side?.spiritId);
  const branch = spirits.find((spirit) => spirit.id === side?.battleForm?.branchId) ?? source;
  return spirits.filter((spirit) => samePath(source, spirit) && samePath(branch, spirit) && hasCompleteRaceStats(spirit.raceStats));
}

export function isValidBattleForm(snapshot, side) {
  const form = side?.battleForm;
  if (!form) return true;
  const spirits = getSnapshotIndexes(snapshot).spirits;
  const source = spirits[side.spiritId], branch = spirits[form.branchId], target = spirits[form.spiritId];
  return Boolean(samePath(source, branch) && samePath(source, target) && samePath(branch, target) && hasCompleteRaceStats(target.raceStats));
}

function equivalentTrait(left, right) {
  return left === right || [
    ["鼓气", "三鼓作气"],
    ["挺起胸脯", "“国王”的威严"],
  ].some((names) => names.includes(left) && names.includes(right));
}

export function resolveBattleSpirit(snapshot, side) {
  const spirits = getSnapshotIndexes(snapshot).spirits;
  const source = spirits[side?.spiritId];
  if (!source || !side.battleForm) return source;
  if (!isValidBattleForm(snapshot, side)) throw new TypeError("本场形态不属于当前精灵分支");
  const form = spirits[side.battleForm.spiritId];
  const equivalent = equivalentTrait(source.traitName, form.traitName);
  return {
    ...form,
    // 本场只换形态与种族值，不重新配招、换属性或触发入场。
    types: source.types,
    traitIds: equivalent ? form.traitIds : source.traitIds,
    traitName: equivalent ? form.traitName : source.traitName,
    traitDescription: equivalent ? form.traitDescription : source.traitDescription,
    traitSourceSpirit: source,
    battleFormTraitRetained: !equivalent,
  };
}
