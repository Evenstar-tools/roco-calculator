import { SWEET_TRAP_ENERGY_RANGE } from "../shared/domain/skill-effects.js";

const BOOLEAN_FIELDS = [
  "actedAfterEnemy",
  "actedBeforeEnemy",
  "applyAttackBoost",
  "applyDefenseDrop",
  "applyDefenseReduction",
  "applyDefenseRise",
  "applySpeedBoost",
  "attackerDebuffed",
  "attackerHpAbove80",
  "attackerMoeActive",
  "blizzardWeather",
  "bugChirpSkill",
  "burstTriggered",
  "conditionTriggered",
  "counterAttackSucceeded",
  "counterDefenseSucceeded",
  "counterTriggered",
  "defeatedEnemy",
  "defenseCounterSucceeded",
  "defenderCarriesSameType",
  "enemyCarriesLightSkill",
  "enemyFrozen",
  "enemyHasMark",
  "enemyIsMixedBloodline",
  "enemyMoeActive",
  "enemyPoisoned",
  "enemySwitchedThisTurn",
  "enemySwitched",
  "enemyUsedStatusSkill",
  "energyDepletedAfterUse",
  "previousCounterSucceeded",
  "previousSkillWasStatus",
  "receivedSuperEffectiveDamage",
  "teamDonationActive",
  "traitActivated",
];

const NUMBER_FIELDS = {
  actedFirstCount: [0, 20],
  activeBurstKinds: [0, 20],
  actualSkillCost: [0, 20],
  attackerHpPercent: [0, 100],
  attackerSpeed: [0, 100000],
  attackerTraitEffect: [0, 500],
  attackerTraitStacks: [0, 100],
  conditionValue: [-10000, 10000],
  counterSuccessCount: [0, 20],
  currentHpPercent: [0, 100],
  defeatedEnemyCount: [0, 6],
  defenderHpPercent: [0, 100],
  defenderSpeed: [0, 100000],
  defenderTraitEffect: [0, 500],
  defenderTraitStacks: [0, 100],
  donationHitBonus: [0, 20],
  donationPoisonCount: [0, 20],
  donationPowerCount: [0, 20],
  dispelledMarkStacks: [0, 99],
  enemyBuffStacks: [0, 20],
  enemyEnergy: [0, 10],
  enemyExhaustedCount: [0, 6],
  enemyFreezeStacks: [0, 20],
  enemyMarkStacks: [0, 20],
  enemyPoisonStacks: [0, 20],
  enemySkillPower: [0, 10000],
  enemyStarfallMarks: [0, 20],
  enemyStarfallStacks: [0, 20],
  enemyTotalSkillCost: [0, 20],
  energy: SWEET_TRAP_ENERGY_RANGE,
  entryCount: [0, 20],
  growthCount: [0, 20],
  growthRoundCount: [0, 20],
  incomingHitCount: [0, 20],
  moeGainCount: [0, 20],
  nonAttackPreviousTurnCount: [0, 20],
  otherFireSkillUseCount: [0, 10],
  otherGrassSkillUseCount: [0, 20],
  otherTypeCount: [0, 17],
  positionChangeCount: [0, 20],
  poisonStacks: [0, 99],
  pressureValveUseCount: [0, 20],
  resistedAttackCount: [0, 20],
  skillPosition: [1, 4],
  skillSlot: [1, 4],
  skillUseCount: [0, 20],
  stackCount: [0, 100],
  teamBugChantCount: [0, 6],
  teamDonationCount: [0, 20],
  totalMoeStacks: [0, 20],
  zeroCostSkillCount: [0, 4],
};

const CHOICE_FIELDS = {
  betMode: ["fixed", "lowHp"],
  driveOutMode: ["steady", "counter"],
  flightMode: ["power", "hits"],
  flowerMode: ["power", "heal"],
  friendshipMode: ["growth", "counter"],
  shiftMode: ["power", "drive"],
  targetWeightTier: ["<4", "4~13", "14~29", "30~59", "60~119", "120+"],
  weightDifferenceTier: ["0~10", "11~20", "21~30", "31~60", "61~100", "101+"],
};

export const PUBLIC_CONTEXT_SCHEMA = Object.freeze({
  booleans: Object.freeze([...BOOLEAN_FIELDS]),
  choices: Object.freeze(
    Object.fromEntries(
      Object.entries(CHOICE_FIELDS).map(([key, values]) => [
        key,
        Object.freeze([...values]),
      ]),
    ),
  ),
  numbers: Object.freeze(
    Object.fromEntries(
      Object.entries(NUMBER_FIELDS).map(([key, range]) => [
        key,
        Object.freeze([...range]),
      ]),
    ),
  ),
});

export function sanitizePublicContext(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const sanitized = {};
  for (const key of BOOLEAN_FIELDS) {
    if (typeof value[key] === "boolean") sanitized[key] = value[key];
  }
  for (const [key, [minimum, maximum]] of Object.entries(
    NUMBER_FIELDS,
  )) {
    const candidate = value[key];
    if (
      typeof candidate === "number" &&
      Number.isFinite(candidate) &&
      candidate >= minimum &&
      candidate <= maximum
    ) {
      sanitized[key] = candidate;
    }
  }
  for (const [key, allowed] of Object.entries(CHOICE_FIELDS)) {
    if (allowed.includes(value[key])) sanitized[key] = value[key];
  }

  return Object.keys(sanitized).length ? sanitized : undefined;
}
