import { createMarksState } from "../domain/marks.js";
import { createNegativeStatusState } from "../domain/negative-status.js";
import { getSpiritSkillSlotCapacity } from "../domain/skill-slot-capacity.js";

export const STATE_SCHEMA_VERSION = 1;

const STAT_KEYS = [
  "hp",
  "speed",
  "physicalAttack",
  "magicalAttack",
  "physicalDefense",
  "magicalDefense",
];

function createDisplayIvs() {
  return Object.fromEntries(STAT_KEYS.map((key) => [key, 60]));
}

function getDefaultSkillIds(snapshot) {
  const skillIds = (snapshot.skills ?? [])
    .slice(0, 4)
    .map((skill) => skill.id ?? null);

  while (skillIds.length < 4) {
    skillIds.push(null);
  }

  return skillIds;
}

function createSide(spiritId, defaultSkillIds, capacity = 4) {
  return {
    spiritId: spiritId ?? null,
    nature: "neutral",
    displayIvs: createDisplayIvs(),
    traitValues: {},
    skills: {
      single: defaultSkillIds[0],
      four: Array.from(
        { length: capacity },
        (_, index) => defaultSkillIds[index] ?? null,
      ),
    },
  };
}

function createDirection() {
  return {
    selectedSkillIndex: 0,
    selectedDamageSource: "skill",
    reduction: 1,
    hitCount: 1,
    traitDamageHitCount: 1,
    starfallStacks: 0,
    finalDamageMultiplier: 1,
    currentHp: null,
    context: {},
    overrides: {},
  };
}

export function createInitialState(snapshot) {
  const meta = snapshot?.meta ?? {};
  const defaultSkillIds = getDefaultSkillIds(snapshot ?? {});
  const spirits = snapshot?.spirits ?? [];

  return {
    schemaVersion: STATE_SCHEMA_VERSION,
    versions: {
      data: meta.id ?? meta.dataVersion ?? meta.version ?? null,
      rules: meta.rulesVersion ?? meta.ruleVersion ?? null,
    },
    mode: "single",
    calculationOptions: {
      includeNegativeStatusSettlement: false,
    },
    marks: createMarksState(),
    negativeStatuses: createNegativeStatusState(),
    sides: {
      attacker: createSide(
        spirits[0]?.id,
        defaultSkillIds,
        getSpiritSkillSlotCapacity(snapshot, spirits[0]?.id),
      ),
      defender: createSide(
        spirits[1]?.id ?? spirits[0]?.id,
        defaultSkillIds,
        getSpiritSkillSlotCapacity(
          snapshot,
          spirits[1]?.id ?? spirits[0]?.id,
        ),
      ),
    },
    directions: {
      forward: createDirection(),
      reverse: createDirection(),
    },
  };
}
