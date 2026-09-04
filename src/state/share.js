import { STATE_SCHEMA_VERSION } from "./defaults.js";
import { normalizeNatureId } from "../domain/natures.js";
import { MOON_MEMORY_TRAIT_LIMIT } from "../domain/moon-memory.js";
import {
  MARK_DEFINITIONS,
  normalizeMarksState,
} from "../domain/marks.js";
import {
  createNegativeStatusState,
  normalizeNegativeStatusState,
} from "../domain/negative-status.js";

const SHARE_FORMAT_VERSION = "v1";
const SHARE_PATTERN = /^#v1\.([A-Za-z0-9_-]+)\.([a-f0-9]{12})$/;
const STAT_KEYS = [
  "hp",
  "speed",
  "physicalAttack",
  "magicalAttack",
  "physicalDefense",
  "magicalDefense",
];
const TOP_LEVEL_KEYS = [
  "schemaVersion",
  "versions",
  "mode",
  "marks",
  "sides",
  "directions",
];
const LEGACY_TOP_LEVEL_KEYS = TOP_LEVEL_KEYS.filter((key) => key !== "marks");
const EXTENDED_TOP_LEVEL_KEYS = [
  ...TOP_LEVEL_KEYS,
  "calculationOptions",
  "negativeStatuses",
];
const EXTENDED_LEGACY_TOP_LEVEL_KEYS = EXTENDED_TOP_LEVEL_KEYS.filter(
  (key) => key !== "marks",
);
const SIDE_KEYS = ["spiritId", "nature", "displayIvs", "skills"];
const SIDE_OPTIONAL_KEYS = [
  "traitValues",
  "acquiredTraitIds",
  "acquiredTraitValues",
];
const SIDE_ALLOWED_KEYS = new Set([...SIDE_KEYS, ...SIDE_OPTIONAL_KEYS]);
const TRAIT_VALUE_KEY_PATTERN =
  /^trait\.[A-Za-z][A-Za-z0-9]*\.[a-f0-9]{8}$/u;
const ACQUIRED_TRAIT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const ACQUIRED_TRAIT_VALUE_KEY_PATTERN =
  /^trait\.[A-Za-z][A-Za-z0-9]*\.[a-f0-9]{8}$/u;
const DIRECTION_KEYS = [
  "selectedSkillIndex",
  "selectedDamageSource",
  "reduction",
  "hitCount",
  "statusTriggerCount",
  "traitDamageHitCount",
  "starfallStacks",
  "finalDamageMultiplier",
  "currentHp",
  "context",
  "overrides",
];
const LEGACY_DIRECTION_KEYS = DIRECTION_KEYS.filter(
  (key) => key !== "selectedDamageSource" &&
    key !== "statusTriggerCount" &&
    key !== "traitDamageHitCount",
);
const MARK_SLOT_KEYS = ["id", "stacks"];
const SKILL_INPUT_KEYS = [
  "skillId",
  "hitCount",
  "statusTriggerCount",
  "context",
  "overrides",
  "basePowerOverride",
  "fixedPowerAdd",
  "skillPowerPercentAdds",
  "otherPowerMultipliers",
  "memoryBySkill",
];
const SKILL_MEMORY_KEYS = [
  "context",
  "hitCount",
  "statusTriggerCount",
  "overrides",
];

function isPlainObject(value) {
  if (value === null || typeof value !== "object") {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(value, expectedKeys) {
  if (!isPlainObject(value)) {
    return false;
  }

  const actualKeys = Object.keys(value).sort();
  const sortedExpected = [...expectedKeys].sort();
  return (
    actualKeys.length === sortedExpected.length &&
    actualKeys.every((key, index) => key === sortedExpected[index])
  );
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.length > 0;
}

function isTraitValue(value) {
  return (
    typeof value === "boolean" ||
    typeof value === "string" ||
    (typeof value === "number" && Number.isFinite(value))
  );
}

function sanitizeTraitValues(value) {
  if (!isPlainObject(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      ([key, candidate]) =>
        TRAIT_VALUE_KEY_PATTERN.test(key) && isTraitValue(candidate),
    ),
  );
}

function sanitizeAcquiredTraitIds(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter(
    (traitId) =>
      typeof traitId === "string" && ACQUIRED_TRAIT_ID_PATTERN.test(traitId),
  ))].slice(0, MOON_MEMORY_TRAIT_LIMIT);
}

function sanitizeAcquiredTraitValues(value, traitIds) {
  if (!isPlainObject(value)) return {};
  const allowedIds = new Set(traitIds);
  return Object.fromEntries(
    Object.entries(value)
      .filter(([traitId, values]) =>
        allowedIds.has(traitId) && isPlainObject(values)
      )
      .map(([traitId, values]) => [
        traitId,
        Object.fromEntries(
          Object.entries(values).filter(
            ([key, candidate]) =>
              ACQUIRED_TRAIT_VALUE_KEY_PATTERN.test(key) &&
              isTraitValue(candidate),
          ),
        ),
      ])
      .filter(([, values]) => Object.keys(values).length > 0),
  );
}

function isNullableId(value) {
  return value === null || isNonEmptyString(value);
}

function isFiniteNonNegative(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function assertJsonValue(value, path, ancestors = new Set()) {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError(`${path} 包含非有限数值`);
    }
    return;
  }

  if (typeof value !== "object") {
    throw new TypeError(`${path} 包含不可序列化值`);
  }

  if (ancestors.has(value)) {
    throw new TypeError(`${path} 包含循环引用`);
  }

  ancestors.add(value);
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      assertJsonValue(item, `${path}[${index}]`, ancestors);
    });
  } else if (isPlainObject(value)) {
    for (const [key, item] of Object.entries(value)) {
      assertJsonValue(item, `${path}.${key}`, ancestors);
    }
  } else {
    throw new TypeError(`${path} 必须是普通 JSON 对象`);
  }
  ancestors.delete(value);
}

function assertPowerOverride(overrides, path) {
  if (!Object.hasOwn(overrides, "powerOverride")) return;
  const powerOverride = overrides.powerOverride;
  if (powerOverride === null) return;
  if (
    !hasExactKeys(powerOverride, ["mode", "value"]) ||
    (powerOverride.mode !== "static" &&
      powerOverride.mode !== "actual" &&
      powerOverride.mode !== "panel")
  ) {
    throw new TypeError(`${path}.powerOverride 威力口径无效`);
  }
  if (
    typeof powerOverride.value !== "number" ||
    !Number.isFinite(powerOverride.value) ||
    powerOverride.value < 0 ||
    powerOverride.value > 9999
  ) {
    throw new TypeError(`${path}.powerOverride 威力必须在 0–9999`);
  }
  if (
    powerOverride.mode === "actual" &&
    Math.round(powerOverride.value * 1_000_000) / 1_000_000 !==
      powerOverride.value
  ) {
    throw new TypeError(`${path}.powerOverride 旧版威力覆盖值最多 6 位小数`);
  }
  if (
    (powerOverride.mode === "static" || powerOverride.mode === "panel") &&
    !Number.isInteger(powerOverride.value)
  ) {
    throw new TypeError(
      `${path}.powerOverride ${powerOverride.mode === "panel" ? "显示" : "静态"}威力必须为整数`,
    );
  }
}

function assertCostOverride(overrides, path) {
  if (!Object.hasOwn(overrides, "costOverride")) return;
  const costOverride = overrides.costOverride;
  if (costOverride === null) return;
  if (
    typeof costOverride !== "number" ||
    !Number.isInteger(costOverride) ||
    costOverride < 0 ||
    costOverride > 99
  ) {
    throw new TypeError(`${path}.costOverride 能耗必须为 0–99 的整数`);
  }
}

function isFiniteNumberOrArray(value) {
  if (typeof value === "number") {
    return Number.isFinite(value);
  }
  return (
    Array.isArray(value) &&
    value.every((item) => typeof item === "number" && Number.isFinite(item))
  );
}

function assertSkillInput(skill, path) {
  if (isNullableId(skill)) {
    return;
  }
  if (
    !isPlainObject(skill) ||
    !Object.keys(skill).every((key) => SKILL_INPUT_KEYS.includes(key)) ||
    !isNonEmptyString(skill.skillId)
  ) {
    throw new TypeError(`${path} 结构无效`);
  }
  if (
    Object.hasOwn(skill, "hitCount") &&
    (!Number.isInteger(skill.hitCount) || skill.hitCount < 1)
  ) {
    throw new TypeError(`${path}.hitCount 无效`);
  }
  if (
    Object.hasOwn(skill, "statusTriggerCount") &&
    (!Number.isInteger(skill.statusTriggerCount) ||
      skill.statusTriggerCount < 1 ||
      skill.statusTriggerCount > 99)
  ) {
    throw new TypeError(`${path}.statusTriggerCount 无效`);
  }
  for (const key of ["basePowerOverride", "fixedPowerAdd"]) {
    if (
      Object.hasOwn(skill, key) &&
      (typeof skill[key] !== "number" || !Number.isFinite(skill[key]))
    ) {
      throw new TypeError(`${path}.${key} 无效`);
    }
  }
  for (const key of ["skillPowerPercentAdds", "otherPowerMultipliers"]) {
    if (Object.hasOwn(skill, key) && !isFiniteNumberOrArray(skill[key])) {
      throw new TypeError(`${path}.${key} 无效`);
    }
  }
  for (const key of ["context", "overrides"]) {
    if (Object.hasOwn(skill, key)) {
      if (!isPlainObject(skill[key])) {
        throw new TypeError(`${path}.${key} 无效`);
      }
      assertJsonValue(skill[key], `${path}.${key}`);
      if (key === "overrides") {
        assertPowerOverride(skill[key], `${path}.${key}`);
        assertCostOverride(skill[key], `${path}.${key}`);
      }
    }
  }
  if (Object.hasOwn(skill, "memoryBySkill")) {
    if (!isPlainObject(skill.memoryBySkill)) {
      throw new TypeError(`${path}.memoryBySkill 无效`);
    }
    for (const [skillId, memory] of Object.entries(skill.memoryBySkill)) {
      if (
        !isNonEmptyString(skillId) ||
        !isPlainObject(memory) ||
        !Object.keys(memory).every((key) => SKILL_MEMORY_KEYS.includes(key))
      ) {
        throw new TypeError(`${path}.memoryBySkill.${skillId} 结构无效`);
      }
      if (
        Object.hasOwn(memory, "hitCount") &&
        (!Number.isInteger(memory.hitCount) || memory.hitCount < 1)
      ) {
        throw new TypeError(`${path}.memoryBySkill.${skillId}.hitCount 无效`);
      }
      if (
        Object.hasOwn(memory, "statusTriggerCount") &&
        (!Number.isInteger(memory.statusTriggerCount) ||
          memory.statusTriggerCount < 1 ||
          memory.statusTriggerCount > 99)
      ) {
        throw new TypeError(
          `${path}.memoryBySkill.${skillId}.statusTriggerCount 无效`,
        );
      }
      for (const key of ["context", "overrides"]) {
        if (Object.hasOwn(memory, key)) {
          if (!isPlainObject(memory[key])) {
            throw new TypeError(`${path}.memoryBySkill.${skillId}.${key} 无效`);
          }
          assertJsonValue(memory[key], `${path}.memoryBySkill.${skillId}.${key}`);
          if (key === "overrides") {
            assertPowerOverride(
              memory[key],
              `${path}.memoryBySkill.${skillId}.${key}`,
            );
          }
        }
      }
    }
  }
}

function assertSide(side, path) {
  if (
    !isPlainObject(side) ||
    !SIDE_KEYS.every((key) => Object.hasOwn(side, key)) ||
    !Object.keys(side).every((key) => SIDE_ALLOWED_KEYS.has(key))
  ) {
    throw new TypeError(`${path} 结构无效`);
  }
  if (!isNullableId(side.spiritId)) {
    throw new TypeError(`${path}.spiritId 无效`);
  }
  if (!isNonEmptyString(side.nature)) {
    throw new TypeError(`${path}.nature 无效`);
  }
  if (!hasExactKeys(side.displayIvs, STAT_KEYS)) {
    throw new TypeError(`${path}.displayIvs 结构无效`);
  }
  for (const stat of STAT_KEYS) {
    const value = side.displayIvs[stat];
    if (!Number.isInteger(value) || value < 0 || value > 60) {
      throw new TypeError(`${path}.displayIvs.${stat} 无效`);
    }
  }
  if (!hasExactKeys(side.skills, ["single", "four"])) {
    throw new TypeError(`${path}.skills 结构无效`);
  }
  assertSkillInput(side.skills.single, `${path}.skills.single`);
  if (
    !Array.isArray(side.skills.four) ||
    (side.skills.four.length !== 4 && side.skills.four.length !== 7)
  ) {
    throw new TypeError(`${path}.skills.four 无效`);
  }
  side.skills.four.forEach((skill, index) => {
    assertSkillInput(skill, `${path}.skills.four[${index}]`);
  });
  if (Object.hasOwn(side, "traitValues")) {
    if (!isPlainObject(side.traitValues)) {
      throw new TypeError(`${path}.traitValues 无效`);
    }
    for (const [key, value] of Object.entries(side.traitValues)) {
      if (!TRAIT_VALUE_KEY_PATTERN.test(key) || !isTraitValue(value)) {
        throw new TypeError(`${path}.traitValues.${key} 无效`);
      }
    }
  }
  if (Object.hasOwn(side, "acquiredTraitIds")) {
    const sanitizedIds = sanitizeAcquiredTraitIds(side.acquiredTraitIds);
    if (
      !Array.isArray(side.acquiredTraitIds) ||
      sanitizedIds.length !== side.acquiredTraitIds.length ||
      sanitizedIds.some((traitId, index) => traitId !== side.acquiredTraitIds[index])
    ) {
      throw new TypeError(`${path}.acquiredTraitIds 无效`);
    }
  }
  if (Object.hasOwn(side, "acquiredTraitValues")) {
    const sanitizedValues = sanitizeAcquiredTraitValues(
      side.acquiredTraitValues,
      side.acquiredTraitIds ?? [],
    );
    if (stableStringify(sanitizedValues) !== stableStringify(side.acquiredTraitValues)) {
      throw new TypeError(`${path}.acquiredTraitValues 无效`);
    }
  }
}

function assertMarks(marks) {
  if (!hasExactKeys(marks, ["attacker", "defender"])) {
    throw new TypeError("分享配置印记结构无效");
  }
  for (const side of ["attacker", "defender"]) {
    if (!hasExactKeys(marks[side], ["positive", "negative"])) {
      throw new TypeError(`marks.${side} 结构无效`);
    }
    for (const polarity of ["positive", "negative"]) {
      const slot = marks[side][polarity];
      if (!hasExactKeys(slot, MARK_SLOT_KEYS)) {
        throw new TypeError(`marks.${side}.${polarity} 结构无效`);
      }
      const allowed = new Set(
        MARK_DEFINITIONS[polarity].map((mark) => mark.id),
      );
      if (slot.id !== null && !allowed.has(slot.id)) {
        throw new TypeError(`marks.${side}.${polarity}.id 无效`);
      }
      if (
        !Number.isInteger(slot.stacks) ||
        slot.stacks < 0 ||
        slot.stacks > 99 ||
        (slot.id === null && slot.stacks !== 0)
      ) {
        throw new TypeError(`marks.${side}.${polarity}.stacks 无效`);
      }
    }
  }
}

function assertDirection(direction, path) {
  if (
    !LEGACY_DIRECTION_KEYS.every((key) => Object.hasOwn(direction, key)) ||
    !Object.keys(direction).every((key) => DIRECTION_KEYS.includes(key))
  ) {
    throw new TypeError(`${path} 结构无效`);
  }
  if (
    !Number.isInteger(direction.selectedSkillIndex) ||
    direction.selectedSkillIndex < 0 ||
    direction.selectedSkillIndex > 3
  ) {
    throw new TypeError(`${path}.selectedSkillIndex 无效`);
  }
  if (
    Object.hasOwn(direction, "selectedDamageSource") &&
    direction.selectedDamageSource !== "skill" &&
    direction.selectedDamageSource !== "trait" &&
    direction.selectedDamageSource !== "bloodline"
  ) {
    throw new TypeError(`${path}.selectedDamageSource 无效`);
  }
  if (!isFiniteNonNegative(direction.reduction)) {
    throw new TypeError(`${path}.reduction 无效`);
  }
  if (!Number.isInteger(direction.hitCount) || direction.hitCount < 1) {
    throw new TypeError(`${path}.hitCount 无效`);
  }
  if (
    Object.hasOwn(direction, "statusTriggerCount") &&
    (!Number.isInteger(direction.statusTriggerCount) ||
      direction.statusTriggerCount < 1 ||
      direction.statusTriggerCount > 99)
  ) {
    throw new TypeError(`${path}.statusTriggerCount 无效`);
  }
  if (
    Object.hasOwn(direction, "traitDamageHitCount") &&
    (!Number.isInteger(direction.traitDamageHitCount) ||
      direction.traitDamageHitCount < 1 ||
      direction.traitDamageHitCount > 99)
  ) {
    throw new TypeError(`${path}.traitDamageHitCount 无效`);
  }
  if (
    !Number.isInteger(direction.starfallStacks) ||
    direction.starfallStacks < 0
  ) {
    throw new TypeError(`${path}.starfallStacks 无效`);
  }
  if (!isFiniteNonNegative(direction.finalDamageMultiplier)) {
    throw new TypeError(`${path}.finalDamageMultiplier 无效`);
  }
  if (
    direction.currentHp !== null &&
    !isFiniteNonNegative(direction.currentHp)
  ) {
    throw new TypeError(`${path}.currentHp 无效`);
  }
  if (!isPlainObject(direction.context)) {
    throw new TypeError(`${path}.context 无效`);
  }
  if (!isPlainObject(direction.overrides)) {
    throw new TypeError(`${path}.overrides 无效`);
  }
  assertJsonValue(direction.context, `${path}.context`);
  assertJsonValue(direction.overrides, `${path}.overrides`);
  assertPowerOverride(direction.overrides, `${path}.overrides`);
  assertCostOverride(direction.overrides, `${path}.overrides`);
}

function assertShareState(state) {
  if (
    !hasExactKeys(state, TOP_LEVEL_KEYS) &&
    !hasExactKeys(state, EXTENDED_TOP_LEVEL_KEYS)
  ) {
    throw new TypeError("分享配置结构无效");
  }
  if (state.schemaVersion !== STATE_SCHEMA_VERSION) {
    throw new TypeError("分享配置 schema 版本不受支持");
  }
  if (!hasExactKeys(state.versions, ["data", "rules"])) {
    throw new TypeError("分享配置版本结构无效");
  }
  if (!isNonEmptyString(state.versions.data)) {
    throw new TypeError("分享配置数据版本无效");
  }
  if (!isNonEmptyString(state.versions.rules)) {
    throw new TypeError("分享配置规则版本无效");
  }
  if (state.mode !== "single" && state.mode !== "four") {
    throw new TypeError("分享配置技能模式无效");
  }
  assertMarks(state.marks);
  if (Object.hasOwn(state, "calculationOptions")) {
    if (
      !hasExactKeys(state.calculationOptions, [
        "includeNegativeStatusSettlement",
      ]) ||
      typeof state.calculationOptions.includeNegativeStatusSettlement !== "boolean"
    ) {
      throw new TypeError("分享配置负面状态开关无效");
    }
  }
  if (Object.hasOwn(state, "negativeStatuses")) {
    if (!hasExactKeys(state.negativeStatuses, ["attacker", "defender"])) {
      throw new TypeError("分享配置负面状态结构无效");
    }
    const normalized = normalizeNegativeStatusState(state.negativeStatuses);
    for (const side of ["attacker", "defender"]) {
      const input = state.negativeStatuses[side];
      if (!input || typeof input !== "object" || Array.isArray(input)) {
        throw new TypeError("分享配置负面状态层数无效");
      }
      for (const [key, value] of Object.entries(input)) {
        if (!Object.hasOwn(normalized[side], key) || normalized[side][key] !== value) {
          throw new TypeError("分享配置负面状态层数无效");
        }
      }
    }
  }
  if (!hasExactKeys(state.sides, ["attacker", "defender"])) {
    throw new TypeError("分享配置双方结构无效");
  }
  assertSide(state.sides.attacker, "sides.attacker");
  assertSide(state.sides.defender, "sides.defender");
  if (!hasExactKeys(state.directions, ["forward", "reverse"])) {
    throw new TypeError("分享配置方向结构无效");
  }
  assertDirection(state.directions.forward, "directions.forward");
  assertDirection(state.directions.reverse, "directions.reverse");
}

function selectSkillInput(skill) {
  if (skill === null || typeof skill === "string") {
    return skill;
  }

  const selected = {
    skillId: skill.skillId ?? skill.id,
  };
  for (const key of SKILL_INPUT_KEYS.slice(1)) {
    if (Object.hasOwn(skill, key)) {
      selected[key] = key === "memoryBySkill"
        ? Object.fromEntries(
            Object.entries(skill[key]).map(([skillId, memory]) => [
              skillId,
              Object.fromEntries(
                SKILL_MEMORY_KEYS.filter((memoryKey) =>
                  Object.hasOwn(memory, memoryKey),
                ).map((memoryKey) => [memoryKey, memory[memoryKey]]),
              ),
            ]),
          )
        : skill[key];
    }
  }
  return selected;
}

function selectSide(side) {
  const selected = {
    spiritId: side.spiritId,
    nature: side.nature,
    displayIvs: Object.fromEntries(
      STAT_KEYS.map((key) => [key, side.displayIvs[key]]),
    ),
    skills: {
      single: selectSkillInput(side.skills.single),
      four: side.skills.four.map(selectSkillInput),
    },
  };
  const traitValues = sanitizeTraitValues(side.traitValues);
  if (Object.keys(traitValues).length > 0) {
    selected.traitValues = traitValues;
  }
  const acquiredTraitIds = sanitizeAcquiredTraitIds(side.acquiredTraitIds);
  if (acquiredTraitIds.length > 0) {
    selected.acquiredTraitIds = acquiredTraitIds;
    const acquiredTraitValues = sanitizeAcquiredTraitValues(
      side.acquiredTraitValues,
      acquiredTraitIds,
    );
    if (Object.keys(acquiredTraitValues).length > 0) {
      selected.acquiredTraitValues = acquiredTraitValues;
    }
  }
  return selected;
}

function migrateSides(sides) {
  if (!isPlainObject(sides)) return sides;
  return Object.fromEntries(
    Object.entries(sides).map(([side, value]) => [
      side,
      isPlainObject(value)
        ? (() => {
            const acquiredTraitIds = sanitizeAcquiredTraitIds(
              value.acquiredTraitIds,
            );
            return {
              ...value,
              acquiredTraitIds,
              acquiredTraitValues: sanitizeAcquiredTraitValues(
                value.acquiredTraitValues,
                acquiredTraitIds,
              ),
              traitValues: sanitizeTraitValues(value.traitValues),
            };
          })()
        : value,
    ]),
  );
}

function selectDirection(direction) {
  const selected = {
    selectedSkillIndex: direction.selectedSkillIndex,
    reduction: direction.reduction,
    hitCount: direction.hitCount,
    starfallStacks: direction.starfallStacks,
    finalDamageMultiplier: direction.finalDamageMultiplier,
    currentHp: direction.currentHp,
    context: direction.context,
    overrides: direction.overrides,
  };
  if (
    Object.hasOwn(direction, "selectedDamageSource") &&
    direction.selectedDamageSource !== "skill"
  ) {
    selected.selectedDamageSource = direction.selectedDamageSource;
  }
  if (
    Object.hasOwn(direction, "traitDamageHitCount") &&
    direction.traitDamageHitCount !== 1
  ) {
    selected.traitDamageHitCount = direction.traitDamageHitCount;
  }
  if (
    Object.hasOwn(direction, "statusTriggerCount") &&
    direction.statusTriggerCount !== 1
  ) {
    selected.statusTriggerCount = direction.statusTriggerCount;
  }
  return selected;
}

export function selectShareableInputs(state) {
  const selected = {
    schemaVersion: state.schemaVersion,
    versions: {
      data: state.versions?.data,
      rules: state.versions?.rules,
    },
    mode: state.mode,
    marks: normalizeMarksState(state.marks, state.directions),
    sides: {
      attacker: selectSide(state.sides?.attacker ?? {}),
      defender: selectSide(state.sides?.defender ?? {}),
    },
    directions: {
      forward: selectDirection(state.directions?.forward ?? {}),
      reverse: selectDirection(state.directions?.reverse ?? {}),
    },
  };
  const negativeStatuses = normalizeNegativeStatusState(state.negativeStatuses);
  const hasNegativeStatuses = Object.values(negativeStatuses).some((side) =>
    Object.values(side).some((value) => value > 0),
  );
  const includeNegativeStatusSettlement =
    state.calculationOptions?.includeNegativeStatusSettlement === true;
  if (hasNegativeStatuses || includeNegativeStatusSettlement) {
    selected.calculationOptions = { includeNegativeStatusSettlement };
    selected.negativeStatuses = negativeStatuses;
  }
  return selected;
}

export function stableStringify(value, ancestors = new Set()) {
  if (value === null || typeof value !== "object") {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) {
      throw new TypeError("分享配置包含不可序列化值");
    }
    return serialized;
  }

  if (ancestors.has(value)) {
    throw new TypeError("分享配置包含循环引用");
  }
  ancestors.add(value);

  let serialized;
  if (Array.isArray(value)) {
    serialized = `[${value
      .map((item) => stableStringify(item, ancestors))
      .join(",")}]`;
  } else {
    serialized = `{${Object.keys(value)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${stableStringify(value[key], ancestors)}`,
      )
      .join(",")}}`;
  }

  ancestors.delete(value);
  return serialized;
}

function bytesToBase64(bytes) {
  const chunkSize = 0x8000;
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(
      ...bytes.subarray(offset, offset + chunkSize),
    );
  }
  return btoa(binary);
}

function toBase64Url(value) {
  return bytesToBase64(new TextEncoder().encode(value))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

function fromBase64Url(value) {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const paddingLength = (4 - (base64.length % 4)) % 4;
  const binary = atob(`${base64}${"=".repeat(paddingLength)}`);
  const bytes = Uint8Array.from(binary, (character) =>
    character.charCodeAt(0),
  );
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

async function sha256Hex(value) {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error("当前浏览器不支持 Web Crypto");
  }

  const digest = await subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function assertExpectedVersions(state, expectedVersions) {
  if (!expectedVersions) {
    return;
  }
  if (
    expectedVersions.data !== undefined &&
    state.versions.data !== expectedVersions.data
  ) {
    throw new TypeError("分享配置数据版本不匹配");
  }
  if (
    expectedVersions.rules !== undefined &&
    state.versions.rules !== expectedVersions.rules
  ) {
    throw new TypeError("分享配置规则版本不匹配");
  }
}

export async function encodeShareState(state) {
  const shareableState = selectShareableInputs(state);
  assertShareState(shareableState);
  const payload = stableStringify(shareableState);
  const body = toBase64Url(payload);
  const checksum = (await sha256Hex(payload)).slice(0, 12);
  return `#${SHARE_FORMAT_VERSION}.${body}.${checksum}`;
}

export async function decodeShareState(hash, expectedVersions) {
  const match = SHARE_PATTERN.exec(hash);
  if (!match) {
    throw new TypeError("分享链接格式无效");
  }

  let payload;
  try {
    payload = fromBase64Url(match[1]);
  } catch {
    throw new TypeError("分享配置编码无效");
  }

  const checksum = (await sha256Hex(payload)).slice(0, 12);
  if (checksum !== match[2]) {
    throw new TypeError("分享配置校验失败");
  }

  let state;
  try {
    state = JSON.parse(payload);
  } catch {
    throw new TypeError("分享配置 JSON 无效");
  }

  if (
    !hasExactKeys(state, TOP_LEVEL_KEYS) &&
    !hasExactKeys(state, LEGACY_TOP_LEVEL_KEYS) &&
    !hasExactKeys(state, EXTENDED_TOP_LEVEL_KEYS) &&
    !hasExactKeys(state, EXTENDED_LEGACY_TOP_LEVEL_KEYS)
  ) {
    throw new TypeError("分享配置结构无效");
  }
  const migratedState = {
    ...state,
    marks: normalizeMarksState(state.marks, state.directions),
    sides: migrateSides(state.sides),
  };
  assertShareState(migratedState);
  const normalizedState = {
    ...migratedState,
    calculationOptions: {
      includeNegativeStatusSettlement:
        migratedState.calculationOptions?.includeNegativeStatusSettlement === true,
    },
    negativeStatuses: Object.hasOwn(migratedState, "negativeStatuses")
      ? normalizeNegativeStatusState(migratedState.negativeStatuses)
      : createNegativeStatusState(),
    directions: Object.fromEntries(
      Object.entries(migratedState.directions).map(([direction, value]) => [
        direction,
        {
          ...value,
          selectedDamageSource: value.selectedDamageSource ?? "skill",
          traitDamageHitCount: value.traitDamageHitCount ?? 1,
        },
      ]),
    ),
    sides: Object.fromEntries(
      Object.entries(migratedState.sides).map(([side, value]) => [
        side,
        {
          ...value,
          nature: normalizeNatureId(value.nature),
        },
      ]),
    ),
  };
  assertExpectedVersions(normalizedState, expectedVersions);
  return normalizedState;
}
