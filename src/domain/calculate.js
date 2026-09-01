import { RULES_VERSION } from "./constants.js";
import { getSnapshotIndexes } from "./snapshot-indexes.js";
import {
  calculateDirection,
  selectedAttackForCounter,
  withListenBridgeCounters,
} from "./skill-result/direction.js";
import { resolveCombatant } from "./skill-result/loadout.js";
import { finiteNumber } from "./skill-result/numeric.js";

export function calculateMatchup(snapshot, battleInput) {
  const mode = battleInput.mode === "four" ? "four" : "single";
  const sides = battleInput.sides ?? {
    attacker: battleInput.attacker,
    defender: battleInput.defender,
  };
  const directions = battleInput.directions ?? {
    forward: battleInput.forward,
    reverse: battleInput.reverse,
  };
  const indexes = getSnapshotIndexes(snapshot);
  const attacker = resolveCombatant(
    snapshot,
    sides.attacker,
    mode,
    indexes,
  );
  const defender = resolveCombatant(
    snapshot,
    sides.defender,
    mode,
    indexes,
  );
  const level = finiteNumber(battleInput.level) ?? 60;
  const marks = battleInput.marks ?? null;
  const baseForward = calculateDirection({
    snapshot,
    mode,
    direction: directions.forward ?? {},
    attackerSide: sides.attacker,
    attacker,
    attackerCurrentHp: directions.reverse?.currentHp,
    attackerHpPercent: directions.reverse?.context?.currentHpPercent,
    defender,
    defenderCurrentHp: directions.forward?.currentHp,
    defenderHpPercent: directions.forward?.context?.currentHpPercent,
    skillsById: indexes.skills,
    level,
    sourceMarks: marks?.attacker,
    sourceSide: "attacker",
    targetMarks: marks?.defender,
    targetSide: "defender",
  });
  const baseReverse = calculateDirection({
    snapshot,
    mode,
    direction: directions.reverse ?? {},
    attackerSide: sides.defender,
    attacker: defender,
    attackerCurrentHp: directions.forward?.currentHp,
    attackerHpPercent: directions.forward?.context?.currentHpPercent,
    defender: attacker,
    defenderCurrentHp: directions.reverse?.currentHp,
    defenderHpPercent: directions.reverse?.context?.currentHpPercent,
    skillsById: indexes.skills,
    level,
    sourceMarks: marks?.defender,
    sourceSide: "defender",
    targetMarks: marks?.attacker,
    targetSide: "attacker",
  });

  const forwardSourceAttack = mode === "four" ? selectedAttackForCounter({
    direction: directions.forward ?? {},
    directionResult: baseForward,
    side: sides.attacker,
    skillsById: indexes.skills,
  }) : null;
  const reverseSourceAttack = mode === "four" ? selectedAttackForCounter({
    direction: directions.reverse ?? {},
    directionResult: baseReverse,
    side: sides.defender,
    skillsById: indexes.skills,
  }) : null;
  const forward = withListenBridgeCounters({
    snapshot,
    direction: directions.forward ?? {},
    directionResult: baseForward,
    ownerSide: sides.attacker,
    owner: attacker,
    ownerCurrentHp: directions.reverse?.currentHp,
    ownerHpPercent: directions.reverse?.context?.currentHpPercent,
    opponent: defender,
    opponentCurrentHp: directions.forward?.currentHp,
    opponentHpPercent: directions.forward?.context?.currentHpPercent,
    sourceAttack: reverseSourceAttack,
    skillsById: indexes.skills,
    level,
    sourceMarks: marks?.attacker,
    sourceSide: "attacker",
    targetMarks: marks?.defender,
    targetSide: "defender",
  });
  const reverse = withListenBridgeCounters({
    snapshot,
    direction: directions.reverse ?? {},
    directionResult: baseReverse,
    ownerSide: sides.defender,
    owner: defender,
    ownerCurrentHp: directions.forward?.currentHp,
    ownerHpPercent: directions.forward?.context?.currentHpPercent,
    opponent: attacker,
    opponentCurrentHp: directions.reverse?.currentHp,
    opponentHpPercent: directions.reverse?.context?.currentHpPercent,
    sourceAttack: forwardSourceAttack,
    skillsById: indexes.skills,
    level,
    sourceMarks: marks?.defender,
    sourceSide: "defender",
    targetMarks: marks?.attacker,
    targetSide: "attacker",
  });

  return {
    forward,
    reverse,
    versions: {
      data: snapshot.meta.id,
      rules: snapshot.meta.rulesVersion ?? RULES_VERSION,
    },
  };
}
