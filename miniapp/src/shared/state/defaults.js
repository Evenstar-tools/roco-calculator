import { createMarksState } from "../domain/marks.js";

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

function createSide(spiritId, defaultSkillIds) {
  return {
    spiritId: spiritId ?? null,
    nature: "neutral",
    displayIvs: createDisplayIvs(),
    skills: {
      single: defaultSkillIds[0],
      four: [...defaultSkillIds],
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
    marks: createMarksState(),
    sides: {
      attacker: createSide(spirits[0]?.id, defaultSkillIds),
      defender: createSide(spirits[1]?.id ?? spirits[0]?.id, defaultSkillIds),
    },
    directions: {
      forward: createDirection(),
      reverse: createDirection(),
    },
  };
}
