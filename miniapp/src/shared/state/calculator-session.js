import {
  getDefaultHitCount,
  getSkillEffectInputs,
} from "../domain/skill-effects.js";
import { getSkillStatusEffectInputs } from "../domain/skill-status-effects.js";
import { normalizeTriggerControls } from "../domain/trigger-controls.js";
import {
  chooseDefaultSkillIds,
  getSkillChoices,
} from "../domain/skill-loadout.js";
import {
  getSkill,
  getSpirit,
  getTraitView,
} from "../domain/calculator-view-model.js";
import { normalizeNatureId } from "../domain/natures.js";
import { createInitialState } from "./defaults.js";
import { calculatorReducer } from "./reducer.js";
import { materializeTraitContext } from "./trait-values.js";
import {
  removeTriggerControlValues,
  sanitizeTriggerContext,
  transitionTriggerContext,
} from "./trigger-context.js";
import { getChoiceTraitInput } from "../domain/choice-skill-sequence.js";
import { getGaleTurbineCompanionControl } from "../domain/wing-extension.js";
import { hasMoonMemoryTrait } from "../domain/moon-memory.js";
import { abilityLevelMultiplier as domainAbilityLevelMultiplier } from "../domain/skill-result/numeric.js";

const CONFIGURATION_SOURCES = new Set(["personal", "team", "share"]);
const REMEMBERED_SIDE_ACTIONS = new Set([
  "side/apply-preset",
  "side/set-four-skill",
  "side/set-iv",
  "side/set-nature",
  "side/set-single-skill",
]);
const ADJACENT_POWER_SKILLS = new Set(["六自由度", "钢钻"]);
const ADJACENT_POWER_CONTEXT_KEYS = [
  "adjacentLeftDisplayedPowerOverride",
  "adjacentRightDisplayedPowerOverride",
];

export function abilityLevelMultiplier(attackStage, defenseStage) {
  // 会话层输入先取整，公式本体以 domain/skill-result/numeric.js 为唯一权威。
  return domainAbilityLevelMultiplier(
    Math.floor(Number(attackStage) || 0),
    Math.floor(Number(defenseStage) || 0),
  );
}

export function sameConfigurationVersions(left, right) {
  return left.data === right.data && left.rules === right.rules;
}

export function shareHashFromInput(value) {
  const text = String(value ?? "").trim();
  if (text.startsWith("#v1.")) return text;
  try {
    const hash = new URL(text, globalThis.location?.href).hash;
    if (hash.startsWith("#v1.")) return hash;
  } catch {
    // 统一在下面给出用户可理解的错误。
  }
  throw new TypeError("分享链接格式无效");
}

export function migrateSharedConfiguration(sharedState, versions, snapshot) {
  const migrated = {
    ...sharedState,
    versions,
    sides: Object.fromEntries(
      Object.entries(sharedState.sides).map(([side, value]) => [
        side,
        { ...value, nature: normalizeNatureId(value.nature) },
      ]),
    ),
  };
  if (!snapshot) return migrated;
  const migrateEntry = (entry) => {
    if (!entry || typeof entry === "string") return entry;
    const memoryBySkill = Object.fromEntries(
      Object.entries(entry.memoryBySkill ?? {}).map(([skillId, memory]) => [
        skillId,
        {
          ...memory,
          context: migrateSkillContext(
            memory?.context,
            getSkill(snapshot, skillId),
          ),
        },
      ]),
    );
    return {
      ...entry,
      context: migrateSkillContext(
        entry.context,
        getSkill(snapshot, entrySkillId(entry)),
      ),
      ...(Object.keys(memoryBySkill).length > 0 ? { memoryBySkill } : {}),
    };
  };
  const sides = Object.fromEntries(
    Object.entries(migrated.sides).map(([side, value]) => [
      side,
      {
        ...value,
        skills: {
          four: value.skills.four.map(migrateEntry),
          single: migrateEntry(value.skills.single),
        },
      },
    ]),
  );
  const directions = { ...migrated.directions };
  for (const [side, direction] of [
    ["attacker", "forward"],
    ["defender", "reverse"],
  ]) {
    const skillContext = migrateSkillContext(
      directions[direction].context,
      getSkill(snapshot, entrySkillId(sides[side].skills.single)),
    );
    const traitControls = directionTraitControls(snapshot, sides, direction);
    directions[direction] = {
      ...directions[direction],
      context: replaceSlotControls(
        skillContext,
        traitControls,
        sanitizeTriggerContext(skillContext, traitControls),
      ),
    };
  }
  return { ...migrated, directions, sides };
}

export function assertSnapshotReferences(sharedState, snapshot) {
  const spiritIds = new Set(snapshot.spirits.map((spirit) => spirit.id));
  const skillIds = new Set(snapshot.skills.map((skill) => skill.id));
  const traitsById = new Map(
    (snapshot.traits ?? []).map((trait) => [trait.id, trait]),
  );
  for (const side of Object.values(sharedState.sides)) {
    if (!side.spiritId || !spiritIds.has(side.spiritId)) {
      throw new TypeError("分享配置包含当前数据中不存在的精灵");
    }
    for (const input of [side.skills.single, ...side.skills.four]) {
      const skillId =
        typeof input === "string" ? input : input?.skillId ?? input?.id;
      if (skillId && !skillIds.has(skillId)) {
        throw new TypeError("分享配置包含当前数据中不存在的技能");
      }
      for (const rememberedSkillId of Object.keys(input?.memoryBySkill ?? {})) {
        if (!skillIds.has(rememberedSkillId)) {
          throw new TypeError("分享配置包含当前数据中不存在的技能");
        }
      }
    }
    const acquiredTraitIds = side.acquiredTraitIds ?? [];
    if (acquiredTraitIds.some((traitId) => !traitsById.has(traitId))) {
      throw new TypeError("分享配置包含当前数据中不存在的特性");
    }
    const spirit = snapshot.spirits.find(
      (candidate) => candidate.id === side.spiritId,
    );
    const nativeTraits = (spirit?.traitIds ?? [])
      .map((traitId) => traitsById.get(traitId))
      .filter(Boolean);
    if (acquiredTraitIds.length > 0 && !hasMoonMemoryTrait(nativeTraits)) {
      throw new TypeError("分享配置中的精灵不具备吞噬特性能力");
    }
    if (
      Object.keys(side.acquiredTraitValues ?? {}).some(
        (traitId) => !acquiredTraitIds.includes(traitId),
      )
    ) {
      throw new TypeError("分享配置包含未选中的吞噬特性参数");
    }
  }
}

export function createProductInitialState(snapshot) {
  const state = createInitialState(snapshot);
  const emptySkills = {
    single: null,
    four: [null, null, null, null],
  };

  return {
    ...state,
    mode: "four",
    sides: {
      attacker: {
        ...state.sides.attacker,
        spiritId: null,
        nature: "neutral",
        displayIvs: {
          hp: 60,
          speed: 60,
          physicalAttack: 60,
          magicalAttack: 60,
          physicalDefense: 60,
          magicalDefense: 60,
        },
        skills: { ...emptySkills, four: [...emptySkills.four] },
      },
      defender: {
        ...state.sides.defender,
        spiritId: null,
        nature: "neutral",
        displayIvs: {
          hp: 60,
          speed: 60,
          physicalAttack: 60,
          magicalAttack: 60,
          physicalDefense: 60,
          magicalDefense: 60,
        },
        skills: { ...emptySkills, four: [...emptySkills.four] },
      },
    },
    directions: {
      forward: { ...state.directions.forward, context: {} },
      reverse: { ...state.directions.reverse, context: {} },
    },
  };
}

function cloneDirection(direction) {
  return {
    ...direction,
    context: { ...(direction.context ?? {}) },
    overrides: { ...(direction.overrides ?? {}) },
  };
}

function cloneMarks(marks) {
  return Object.fromEntries(
    Object.entries(marks ?? {}).map(([side, slots]) => [
      side,
      Object.fromEntries(
        Object.entries(slots ?? {}).map(([polarity, slot]) => [
          polarity,
          slot && typeof slot === "object" ? { ...slot } : slot,
        ]),
      ),
    ]),
  );
}

function createDefaultSpiritSide(initialSide, snapshot, spiritId) {
  const four = chooseDefaultSkillIds(snapshot, spiritId);
  const previewDefaults = (snapshot.spirits ?? []).find(
    (spirit) => spirit.id === spiritId,
  )?.previewDefaults;
  return {
    ...initialSide,
    displayIvs: {
      ...(previewDefaults?.displayIvs ?? initialSide.displayIvs),
    },
    natureId: normalizeNatureId(
      previewDefaults?.natureId ?? initialSide.nature,
    ),
    skills: { four, single: four.find(Boolean) ?? null },
    spiritId,
  };
}

function singleSkillMemory(entry, controls = null) {
  if (!entry || typeof entry !== "object") return null;
  const memory = {
    context: controls
      ? sanitizeTriggerContext(entry.context ?? {}, controls)
      : { ...(entry.context ?? {}) },
    hitCount: Number.isFinite(Number(entry.hitCount))
      ? Number(entry.hitCount)
      : 1,
    overrides: { ...(entry.overrides ?? {}) },
  };
  if (
    Number.isInteger(entry.statusTriggerCount) &&
    entry.statusTriggerCount >= 1 &&
    entry.statusTriggerCount <= 99
  ) {
    memory.statusTriggerCount = entry.statusTriggerCount;
  }
  return memory;
}

function entrySkillId(entry) {
  if (typeof entry === "string") return entry;
  return entry?.skillId ?? entry?.id ?? null;
}

function skillTriggerControls(skill) {
  const choiceTraitInput = getChoiceTraitInput(skill);
  const galeTurbineInput = getGaleTurbineCompanionControl(skill);
  return normalizeTriggerControls([
    ...getSkillEffectInputs(skill),
    ...getSkillStatusEffectInputs(skill),
    ...(choiceTraitInput ? [choiceTraitInput] : []),
    ...(galeTurbineInput ? [galeTurbineInput] : []),
  ], { source: "skill" }).filter((control) => control.scope !== "battle");
}

function cloneSingleMemories(entry) {
  if (!entry || typeof entry !== "object") return {};
  return Object.fromEntries(
    Object.entries(entry.memoryBySkill ?? {}).map(([skillId, memory]) => {
      const cloned = {
        context: { ...(memory?.context ?? {}) },
        hitCount: Math.max(1, Math.floor(Number(memory?.hitCount) || 1)),
        overrides: { ...(memory?.overrides ?? {}) },
      };
      if (
        Number.isInteger(memory?.statusTriggerCount) &&
        memory.statusTriggerCount >= 1 &&
        memory.statusTriggerCount <= 99
      ) {
        cloned.statusTriggerCount = memory.statusTriggerCount;
      }
      return [skillId, cloned];
    }),
  );
}

function sanitizeStoredSkillEntry(
  entry,
  snapshot,
  additionalControls = [],
) {
  if (!entry || typeof entry === "string") return entry;
  const skillId = entrySkillId(entry);
  const skill = getSkill(snapshot, skillId);
  const controls = [
    ...skillTriggerControls(skill),
    ...additionalControls,
  ].filter((control) => control.scope !== "battle");
  const memoryBySkill = Object.fromEntries(
    Object.entries(entry.memoryBySkill ?? {}).map(([rememberedSkillId, memory]) => [
      rememberedSkillId,
      {
        ...memory,
        context: sanitizeTriggerContext(
          memory?.context ?? {},
          skillTriggerControls(getSkill(snapshot, rememberedSkillId)),
        ),
        overrides: { ...(memory?.overrides ?? {}) },
      },
    ]),
  );
  return {
    ...entry,
    context: {
      ...sanitizeTriggerContext(entry.context ?? {}, controls),
      ...preserveSkillRuleContext(entry.context, skill),
    },
    ...(Object.keys(memoryBySkill).length > 0 ? { memoryBySkill } : {}),
    overrides: { ...(entry.overrides ?? {}) },
  };
}

function sanitizePresetSkills(state, snapshot) {
  let nextState = state;
  for (const [side, direction] of [
    ["attacker", "forward"],
    ["defender", "reverse"],
  ]) {
    const traitControls = directionTraitControls(
      snapshot,
      nextState.sides,
      direction,
    );
    const current = nextState.sides[side];
    nextState = {
      ...nextState,
      sides: {
        ...nextState.sides,
        [side]: {
          ...current,
          skills: {
            four: current.skills.four.map((entry) =>
              sanitizeStoredSkillEntry(entry, snapshot),
            ),
            single: sanitizeStoredSkillEntry(
              current.skills.single,
              snapshot,
              traitControls,
            ),
          },
        },
      },
    };
  }
  return nextState;
}

function singlePowerOverrides(overrides = {}, { includeTemporary = true } = {}) {
  const selected = {
    basePower: overrides.basePower ?? null,
    displayedPower: overrides.displayedPower ?? null,
    powerMode: overrides.powerMode ?? "base",
  };
  if (
    includeTemporary &&
    Number.isInteger(Number(overrides.costOverride)) &&
    Number(overrides.costOverride) >= 0 &&
    Number(overrides.costOverride) <= 99
  ) {
    selected.costOverride = Number(overrides.costOverride);
  }
  if (
    includeTemporary &&
    overrides.powerOverride &&
    (overrides.powerOverride.mode === "static" ||
      overrides.powerOverride.mode === "actual" ||
      overrides.powerOverride.mode === "panel") &&
    Number.isFinite(Number(overrides.powerOverride.value))
  ) {
    selected.powerOverride = {
      mode: overrides.powerOverride.mode,
      value: Number(overrides.powerOverride.value),
    };
  }
  return selected;
}

function replaceSlotControls(context, previousControls, nextValues) {
  return {
    ...removeTriggerControlValues(context, previousControls),
    ...nextValues,
  };
}

function preserveTraitSlotContext(context = {}) {
  return Object.fromEntries(
    Object.entries(context).filter(([key]) =>
      key.startsWith("attackerTrait.") || key.startsWith("defenderTrait."),
    ),
  );
}

function preserveSkillRuleContext(context = {}, skill) {
  if (!ADJACENT_POWER_SKILLS.has(skill?.name)) return {};
  return Object.fromEntries(
    ADJACENT_POWER_CONTEXT_KEYS.flatMap((key) => {
      const value = Number(context[key]);
      return Number.isFinite(value) && value >= 0 && value <= 9999
        ? [[key, value]]
        : [];
    }),
  );
}

function directionTraitControls(snapshot, sides, direction) {
  const attackerSide = direction === "forward" ? sides.attacker : sides.defender;
  const defenderSide = direction === "forward" ? sides.defender : sides.attacker;
  const attacker = getSpirit(snapshot, attackerSide);
  const defender = getSpirit(snapshot, defenderSide);
  return [
    ...(attacker ? getTraitView(
      snapshot,
      attacker,
      "attacker",
    )?.inputs ?? [] : []),
    ...(defender ? getTraitView(
      snapshot,
      defender,
      "defender",
    )?.inputs ?? [] : []),
  ];
}

function applyMatchupTraitDefaults(state, snapshot) {
  let nextState = state;
  for (const direction of ["forward", "reverse"]) {
    const attackerSide =
      direction === "forward"
        ? nextState.sides.attacker
        : nextState.sides.defender;
    const defenderSide =
      direction === "forward"
        ? nextState.sides.defender
        : nextState.sides.attacker;
    const attacker = getSpirit(snapshot, attackerSide);
    const defender = getSpirit(snapshot, defenderSide);
    const trait = attacker
      ? getTraitView(snapshot, attacker, "attacker")
      : null;
    if (trait?.name !== "月光审判") continue;
    const activation = trait.inputs.find(
      (control) => control.contextKey === "traitActivated",
    );
    if (!activation) continue;
    nextState = calculatorReducer(nextState, {
      direction,
      type: "direction/update",
      value: {
        context: {
          [activation.id]: defender?.stage === "首领",
        },
      },
    });
  }
  return nextState;
}

function migrateSkillContext(context, skill) {
  const controls = skillTriggerControls(skill);
  return replaceSlotControls(
    context ?? {},
    controls,
    sanitizeTriggerContext(context ?? {}, controls),
  );
}

function persistence(rememberSide = null) {
  return { rememberSide };
}

export function reduceSessionAction(state, action) {
  const nextState = calculatorReducer(state, action);
  const rememberSide =
    action.remember !== false &&
    action.side &&
    REMEMBERED_SIDE_ACTIONS.has(action.type)
      ? action.side
      : null;
  return { persistence: persistence(rememberSide), state: nextState };
}

export function applyConfiguration(
  state,
  configuration,
  { initialState, remember, side, snapshot, source } = {},
) {
  if (!CONFIGURATION_SOURCES.has(source)) {
    throw new TypeError("configuration source 必须是 personal、team 或 share");
  }
  if (typeof remember !== "boolean") {
    throw new TypeError("configuration remember 必须显式指定");
  }
  if (side !== "attacker" && side !== "defender") {
    throw new TypeError("configuration side 必须是 attacker 或 defender");
  }
  if (!initialState?.directions) {
    throw new TypeError("configuration initialState 无效");
  }

  let nextState = {
    ...state,
    marks: cloneMarks(initialState.marks),
    directions: {
      forward: cloneDirection(initialState.directions.forward),
      reverse: cloneDirection(initialState.directions.reverse),
    },
  };
  nextState = calculatorReducer(nextState, {
    side,
    type: "side/apply-preset",
    value: configuration,
  });
  if (snapshot) {
    nextState = sanitizePresetSkills(nextState, snapshot);
  }
  for (const [configuredSide, direction] of [
    ["attacker", "forward"],
    ["defender", "reverse"],
  ]) {
    const entry = nextState.sides[configuredSide].skills.single;
    const controls = snapshot
      ? [
          ...skillTriggerControls(getSkill(snapshot, entrySkillId(entry))),
          ...directionTraitControls(snapshot, nextState.sides, direction),
        ].filter((control) => control.scope !== "battle")
      : null;
    const rememberedSingle = singleSkillMemory(entry, controls);
    if (rememberedSingle) {
      nextState = calculatorReducer(nextState, {
        direction,
        type: "direction/update",
        value: rememberedSingle,
      });
    }
  }
  if (snapshot && configuration.traitValues) {
    for (const direction of ["forward", "reverse"]) {
      const role = direction === "forward"
        ? side === "attacker" ? "attacker" : "defender"
        : side === "attacker" ? "defender" : "attacker";
      const traitContext = materializeTraitContext(
        configuration.traitValues,
        snapshot,
        configuration.spiritId,
        role,
      );
      nextState = calculatorReducer(nextState, {
        direction,
        type: "direction/update",
        value: { context: traitContext },
      });
    }
  }
  if (snapshot) {
    nextState = applyMatchupTraitDefaults(nextState, snapshot);
  }

  return {
    activeDirection: "forward",
    persistence: persistence(remember ? side : null),
    source,
    state: nextState,
  };
}

export function selectSpirit(
  state,
  { initialState, personalConfiguration, side, snapshot, spiritId },
) {
  const configuration = personalConfiguration ??
    createDefaultSpiritSide(initialState.sides[side], snapshot, spiritId);
  return applyConfiguration(state, configuration, {
    initialState,
    remember: false,
    side,
    snapshot,
    source: "personal",
  });
}

export function replaceConfiguration(state, configuration, { remember, source } = {}) {
  if (source !== "share") {
    throw new TypeError("完整 configuration source 必须是 share");
  }
  if (remember !== false) {
    throw new TypeError("share configuration remember 必须是 false");
  }
  return {
    persistence: persistence(),
    source,
    state: calculatorReducer(state, {
      type: "state/replace",
      value: configuration,
    }),
  };
}

export function patchFourSkill(state, { index, patch, side, snapshot }) {
  const current = state.sides[side].skills.four[index];
  const skillId =
    typeof current === "string" ? current : current?.skillId ?? current?.id;
  const details = current && typeof current === "object" ? current : { skillId };
  let value = {
    ...details,
    ...patch,
    skillId,
    context: { ...(details.context ?? {}), ...(patch.context ?? {}) },
    overrides: { ...(details.overrides ?? {}), ...(patch.overrides ?? {}) },
  };
  if (snapshot && patch.context) {
    const skill = getSkill(snapshot, entrySkillId(value));
    const controls = skillTriggerControls(skill);
    value = {
      ...value,
      context: {
        ...preserveTraitSlotContext(value.context),
        ...sanitizeTriggerContext(value.context, controls),
        ...preserveSkillRuleContext(value.context, skill),
      },
    };
  }
  return reduceSessionAction(state, {
    index,
    side,
    type: "side/set-four-skill",
    value,
  });
}

export function selectFourSkill(
  state,
  { index, side, skillId, snapshot },
) {
  const current = state.sides[side].skills.four[index];
  const currentSkillId = entrySkillId(current);
  if (currentSkillId === skillId) {
    return { persistence: persistence(side), state };
  }
  const currentSkill = getSkill(snapshot, currentSkillId);
  const nextSkill = getSkill(snapshot, skillId);
  const previousControls = skillTriggerControls(currentSkill);
  const nextControls = skillTriggerControls(nextSkill);
  const currentContext =
    current && typeof current === "object" ? current.context ?? {} : {};
  const context = {
    ...preserveTraitSlotContext(currentContext),
    ...transitionTriggerContext(
      currentContext,
      previousControls,
      nextControls,
    ),
  };
  const selected = reduceSessionAction(state, {
    index,
    side,
    type: "side/set-four-skill",
    value: {
      context,
      hitCount: getDefaultHitCount(nextSkill),
      overrides: {},
      skillId,
    },
  });
  const direction = side === "attacker" ? "forward" : "reverse";
  const counts = {
    ...(selected.state.directions[direction].context
      ?.negativeStatusUseCountsBySlot ?? {}),
  };
  delete counts[index + 1];
  return {
    ...selected,
    state: calculatorReducer(selected.state, {
      direction,
      type: "direction/update",
      value: {
        context: { negativeStatusUseCountsBySlot: counts },
      },
    }),
  };
}

export function updateGlobalRain(state, value) {
  const weatherRainTurns = Math.min(
    8,
    Math.max(0, Math.floor(Number(value) || 0)),
  );
  let nextState = state;
  for (const direction of ["forward", "reverse"]) {
    nextState = calculatorReducer(nextState, {
      direction,
      type: "direction/update",
      value: { context: { weatherRainTurns } },
    });
  }
  return { persistence: persistence(), state: nextState };
}

export function updateGlobalWeather(state, weather) {
  const nextWeather = ["rain", "thunder"].includes(weather) ? weather : "none";
  let nextState = state;
  for (const direction of ["forward", "reverse"]) {
    nextState = calculatorReducer(nextState, {
      direction,
      type: "direction/update",
      value: {
        context: {
          weatherRainTurns: nextWeather === "rain" ? 8 : 0,
          weatherThunder: nextWeather === "thunder",
        },
      },
    });
  }
  return { persistence: persistence(), state: nextState };
}

export function updateMirroredTraitContext(state, { direction, key, value }) {
  let nextState = calculatorReducer(state, {
    direction,
    type: "direction/update",
    value: { context: { [key]: value } },
  });
  const source = key.startsWith("attackerTrait")
    ? "attackerTrait"
    : key.startsWith("defenderTrait")
      ? "defenderTrait"
      : null;
  const target = source === "attackerTrait"
    ? "defenderTrait"
    : source === "defenderTrait"
      ? "attackerTrait"
      : null;
  const separatorIndex = key.indexOf(".");
  const stableContextKey = separatorIndex >= 0
    ? key.slice(separatorIndex + 1)
    : null;
  const mirroredContextKey = stableContextKey?.startsWith(source)
    ? `${target}${stableContextKey.slice(source.length)}`
    : stableContextKey;
  const mirroredKey = target
    ? stableContextKey
      ? `${target}.${mirroredContextKey}`
      : key.replace(source, target)
    : null;
  if (mirroredKey) {
    nextState = calculatorReducer(nextState, {
      direction: direction === "forward" ? "reverse" : "forward",
      type: "direction/update",
      value: { context: { [mirroredKey]: value } },
    });
  }
  return { persistence: persistence(), state: nextState };
}

export function rememberSingleSkill(
  state,
  { direction, side, skillId = null, snapshot },
) {
  const latestDirection = state.directions[direction];
  const currentEntry = state.sides[side].skills.single;
  const currentSkillId =
    typeof currentEntry === "string"
      ? currentEntry
      : currentEntry?.skillId ?? currentEntry?.id;
  const resolvedSkillId = skillId ?? currentSkillId ?? null;
  const controls = snapshot
    ? skillTriggerControls(getSkill(snapshot, resolvedSkillId))
    : [];
  const skillContext = controls.length > 0
    ? sanitizeTriggerContext(latestDirection.context, controls)
    : {};
  const context = {
    ...preserveTraitSlotContext(latestDirection.context),
    ...skillContext,
  };
  const overrides = singlePowerOverrides(latestDirection.overrides);
  const memoryBySkill = cloneSingleMemories(currentEntry);
  if (resolvedSkillId) {
    memoryBySkill[resolvedSkillId] = {
      context: skillContext,
      hitCount: latestDirection.hitCount,
      overrides: singlePowerOverrides(latestDirection.overrides, {
        includeTemporary: false,
      }),
      ...(Number.isInteger(latestDirection.statusTriggerCount) &&
        latestDirection.statusTriggerCount >= 1 &&
        latestDirection.statusTriggerCount <= 99
        ? { statusTriggerCount: latestDirection.statusTriggerCount }
        : {}),
    };
  }
  return reduceSessionAction(state, {
    side,
    type: "side/set-single-skill",
    value: {
      context,
      hitCount: latestDirection.hitCount,
      memoryBySkill,
      overrides,
      skillId: resolvedSkillId,
      ...(Number.isInteger(latestDirection.statusTriggerCount) &&
        latestDirection.statusTriggerCount >= 1 &&
        latestDirection.statusTriggerCount <= 99
        ? { statusTriggerCount: latestDirection.statusTriggerCount }
        : {}),
    },
  });
}

export function selectSingleSkill(
  state,
  { direction, side, skillId, snapshot },
) {
  const currentEntry = state.sides[side].skills.single;
  const currentSkill =
    getSkill(snapshot, currentEntry) ??
    (state.sides[side].spiritId
      ? getSkillChoices(snapshot, state.sides[side].spiritId)[0]
      : null) ??
    snapshot.skills[0];
  const nextSkill = getSkill(snapshot, skillId);
  const currentControls = skillTriggerControls(currentSkill);
  const nextControls = skillTriggerControls(nextSkill);
  const currentDirection = state.directions[direction];
  const currentMemories = cloneSingleMemories(currentEntry);
  const currentSkillId = entrySkillId(currentEntry) ?? currentSkill?.id;
  if (currentSkillId) {
    currentMemories[currentSkillId] = {
      context: sanitizeTriggerContext(currentDirection.context, currentControls),
      hitCount: currentDirection.hitCount,
      overrides: singlePowerOverrides(currentDirection.overrides, {
        includeTemporary: false,
      }),
      ...(Number.isInteger(currentDirection.statusTriggerCount) &&
        currentDirection.statusTriggerCount >= 1 &&
        currentDirection.statusTriggerCount <= 99
        ? { statusTriggerCount: currentDirection.statusTriggerCount }
        : {}),
    };
  }
  const remembered = currentMemories[skillId];
  const nextSlotContext = remembered
    ? sanitizeTriggerContext(remembered.context, nextControls)
    : transitionTriggerContext(
        currentDirection.context,
        currentControls,
        nextControls,
      );
  const nextContext = replaceSlotControls(
    currentDirection.context,
    [...currentControls, ...nextControls],
    nextSlotContext,
  );
  const nextOverrides = remembered
    ? {
        ...singlePowerOverrides(remembered.overrides, {
          includeTemporary: false,
        }),
        powerOverride: null,
      }
    : {
        basePower: null,
        displayedPower: null,
        powerMode: "base",
        powerOverride: null,
      };
  let nextState = calculatorReducer(state, {
    direction,
    type: "direction/set-context",
    value: nextContext,
  });
  nextState = calculatorReducer(nextState, {
    direction,
    type: "direction/update",
    value: {
      hitCount: getDefaultHitCount(nextSkill),
      statusTriggerCount: undefined,
      overrides: nextOverrides,
    },
  });
  if (remembered) {
    nextState = calculatorReducer(nextState, {
      direction,
      type: "direction/update",
      value: {
        hitCount: remembered.hitCount,
        statusTriggerCount: remembered.statusTriggerCount,
      },
    });
  }
  const result = rememberSingleSkill(nextState, {
    direction,
    side,
    skillId,
    snapshot,
  });
  const selectedEntry = result.state.sides[side].skills.single;
  return {
    ...result,
    state: calculatorReducer(result.state, {
      side,
      type: "side/set-single-skill",
      value: {
        ...selectedEntry,
        memoryBySkill: {
          ...(selectedEntry.memoryBySkill ?? {}),
          ...currentMemories,
        },
      },
    }),
  };
}

export function toggleDirection(direction) {
  return direction === "forward" ? "reverse" : "forward";
}
