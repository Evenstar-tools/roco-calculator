import { normalizeNatureId } from "../shared/domain/natures.js";
import { damagePresentation } from "../shared/domain/result-presentation.js";
import { isValidBattleForm } from "../shared/domain/battle-form.js";
import { normalizeMarksState } from "../shared/domain/marks.js";
import { MOON_MEMORY_TRAIT_LIMIT } from "../shared/domain/moon-memory.js";
import { normalizeNegativeStatusState } from "../shared/domain/negative-status.js";
import { getSpiritSkillSlotCapacity } from "../shared/domain/skill-slot-capacity.js";
import { createInitialState } from "../shared/state/defaults.js";
import { extractTraitValues } from "../shared/state/trait-values.js";
import { sanitizePublicContext } from "./context-schema.js";

const SHARE_VERSION = 2;
const PARAMETER_SHARE_VERSION = 3;
const STATUS_PREVIEW_SHARE_VERSION = 4;
const STATUS_PREVIEW_CONTEXT_KEYS = [
  "negativeStatusRepeatSkillsBySlot", "negativeStatusCounterAttack",
  "negativeStatusCounterDefense", "negativeStatusCounterState",
  "previousTurnBothUsedLightSkill", "convertedBuffStacks",
];
const REQUIRED_CONTEXT_KEYS = [
  "negativeStatusUseCountsBySlot", "weatherRainTurns", "weatherTurns",
  "weatherThunder", "weatherSandstorm", "weatherBlizzard",
  "bloodlineMagicId", "bloodlineMagicTriggered",
  ...STATUS_PREVIEW_CONTEXT_KEYS,
];
const GLOBAL_WEATHER_CONTEXT_KEYS = [
  "weatherRainTurns", "weatherTurns", "weatherThunder", "weatherSandstorm",
  "weatherBlizzard", "blizzardWeather",
];
const MAX_ENCODED_LENGTH = 899;
const BASE64_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const STAT_KEYS = [
  "hp",
  "speed",
  "physicalAttack",
  "magicalAttack",
  "physicalDefense",
  "magicalDefense",
];
const CONTEXT_KEY_ALIASES = Object.freeze({
  donationHitBonus: "wh",
  donationPoisonCount: "wz",
  donationPowerCount: "wp",
  pressureValveUseCount: "pv",
  targetWeightTier: "wt",
  teamDonationCount: "wd",
  weightDifferenceTier: "ww",
  negativeStatusUseCountsBySlot: "nu",
  negativeStatusRepeatSkillsBySlot: "nr",
  negativeStatusCounterAttack: "na",
  negativeStatusCounterDefense: "nd",
  negativeStatusCounterState: "ns",
  previousTurnBothUsedLightSkill: "pl",
  convertedBuffStacks: "cv",
  weatherRainTurns: "wr",
  weatherTurns: "wn",
  weatherThunder: "wT",
  weatherSandstorm: "ws",
  weatherBlizzard: "wb",
  bloodlineMagicId: "bm",
  bloodlineMagicTriggered: "bt",
});
const CONTEXT_KEY_NAMES = Object.freeze(
  Object.fromEntries(
    Object.entries(CONTEXT_KEY_ALIASES).map(([name, alias]) => [alias, name]),
  ),
);
const ACQUIRED_TRAIT_ID_PATTERN =
  /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const TRAIT_VALUE_KEY_PATTERN =
  /^trait\.[A-Za-z][A-Za-z0-9]*\.[a-f0-9]{8}$/u;
const COMPACT_TRAIT_VALUE_KEY_PATTERN =
  /^[A-Za-z][A-Za-z0-9]*\.[a-f0-9]{8}$/u;

function safeIdentifier(value) {
  return typeof value === "string" &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/u.test(value)
    ? value
    : null;
}

function safeAcquiredTraitId(value) {
  return typeof value === "string" && ACQUIRED_TRAIT_ID_PATTERN.test(value)
    ? value
    : null;
}

function compactPublicContext(value, omittedKeys = []) {
  const sanitized = sanitizePublicContext(value);
  if (!sanitized) return undefined;
  const compact = Object.fromEntries(
    Object.entries(sanitized).filter(([key]) => !omittedKeys.includes(key)).map(([key, candidate]) => [
      CONTEXT_KEY_ALIASES[key] ?? key,
      candidate,
    ]),
  );
  return Object.keys(compact).length ? compact : undefined;
}

function expandPublicContext(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return sanitizePublicContext(
    Object.fromEntries(
      Object.entries(value).map(([key, candidate]) => [
        CONTEXT_KEY_NAMES[key] ?? key,
        candidate,
      ]),
    ),
  );
}

function isCompactTraitValue(value) {
  return (
    typeof value === "boolean" ||
    typeof value === "number" && Number.isFinite(value) ||
    typeof value === "string" && safeIdentifier(value) !== null
  );
}

function finiteInRange(value, minimum, maximum, fallback) {
  if (
    value === null ||
    value === undefined ||
    value === "" ||
    typeof value === "boolean"
  ) {
    return fallback;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) &&
    numeric >= minimum &&
    numeric <= maximum
    ? numeric
    : fallback;
}

function integerInRange(value, minimum, maximum, fallback) {
  if (
    value === null ||
    value === undefined ||
    value === "" ||
    typeof value === "boolean"
  ) {
    return fallback;
  }
  const numeric = Number(value);
  return Number.isInteger(numeric) &&
    numeric >= minimum &&
    numeric <= maximum
    ? numeric
    : fallback;
}

function compactOverrides(value) {
  const compact = {};
  const hitCount = integerInRange(value?.hitCount, 1, 99, undefined);
  if (hitCount !== undefined) compact.h = hitCount;
  const basePower = finiteInRange(
    value?.basePower,
    0,
    5000,
    undefined,
  );
  const attackLevelStage = integerInRange(
    value?.attackLevelStage,
    -6,
    6,
    undefined,
  );
  const defenseLevelStage = integerInRange(
    value?.defenseLevelStage,
    -6,
    6,
    undefined,
  );
  if (basePower !== undefined) compact.p = basePower;
  if (attackLevelStage !== undefined && attackLevelStage !== 0) {
    compact.a = attackLevelStage;
  }
  if (defenseLevelStage !== undefined && defenseLevelStage !== 0) {
    compact.d = defenseLevelStage;
  }
  const mode = value?.powerOverride?.mode;
  const power = integerInRange(
    value?.powerOverride?.value,
    0,
    9999,
    undefined,
  );
  if ((mode === "static" || mode === "panel") && power !== undefined) {
    compact.m = mode === "panel" ? "p" : "s";
    compact.v = power;
  }
  const cost = integerInRange(value?.costOverride, 0, 99, undefined);
  if (cost !== undefined) compact.c = cost;
  return Object.keys(compact).length ? compact : undefined;
}

function compactSkill(entry, globalWeatherContext = {}) {
  const skillId = safeIdentifier(
    typeof entry === "string"
      ? entry
      : entry?.skillId ?? entry?.id,
  );
  if (!skillId) return null;
  if (typeof entry === "string") return skillId;

  const compact = { s: skillId };
  const hitCount = integerInRange(
    entry.hitCount,
    1,
    100,
    undefined,
  );
  const statusTriggerCount = integerInRange(
    entry.statusTriggerCount,
    1,
    99,
    undefined,
  );
  const omittedKeys = GLOBAL_WEATHER_CONTEXT_KEYS.filter(key =>
    Object.hasOwn(globalWeatherContext, key) &&
    entry.context?.[key] === globalWeatherContext[key]);
  const context = compactPublicContext(entry.context, omittedKeys);
  const overrides = compactOverrides(entry.overrides);
  if (hitCount !== undefined && hitCount !== 1) compact.h = hitCount;
  if (statusTriggerCount !== undefined && statusTriggerCount !== 1) {
    compact.t = statusTriggerCount;
  }
  if (context) compact.c = context;
  if (overrides) compact.o = overrides;
  return Object.keys(compact).length === 1 ? skillId : compact;
}

function compactTraitValues(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const compact = {};
  for (const [key, candidate] of Object.entries(value)) {
    if (
      !/^trait\.[A-Za-z0-9_.:-]{1,63}$/u.test(key) ||
      !isCompactTraitValue(candidate)
    ) {
      continue;
    }
    compact[key.slice("trait.".length)] = candidate;
    if (Object.keys(compact).length === 16) break;
  }
  return Object.keys(compact).length ? compact : undefined;
}

function compactAcquiredTraitIds(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(safeAcquiredTraitId).filter(Boolean))]
    .slice(0, MOON_MEMORY_TRAIT_LIMIT);
}

function compactAcquiredTraitValues(value, traitIds) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const allowedTraitIds = new Set(traitIds);
  const compact = Object.fromEntries(
    Object.entries(value)
      .filter(([traitId, values]) =>
        allowedTraitIds.has(traitId) &&
        values &&
        typeof values === "object" &&
        !Array.isArray(values)
      )
      .map(([traitId, values]) => [
        traitId,
        Object.fromEntries(
          Object.entries(values)
            .filter(
              ([key, candidate]) =>
                TRAIT_VALUE_KEY_PATTERN.test(key) &&
                isCompactTraitValue(candidate),
            )
            .map(([key, candidate]) => [
              key.slice("trait.".length),
              candidate,
            ]),
        ),
      ])
      .filter(([, values]) => Object.keys(values).length > 0),
  );
  return Object.keys(compact).length ? compact : undefined;
}

function compactSide(side, globalWeatherContext) {
  const ivs = STAT_KEYS.map((key) =>
    integerInRange(side?.displayIvs?.[key], 0, 60, 60),
  );
  const capacity = Math.min(
    7,
    Math.max(4, Number(side?.skills?.four?.length) || 4),
  );
  const compact = {
    s: safeIdentifier(side?.spiritId),
    n: safeIdentifier(side?.nature) ?? "neutral",
    i: ivs,
    u: compactSkill(side?.skills?.single, globalWeatherContext),
    k: Array.from({ length: capacity }, (_, index) =>
      compactSkill(side?.skills?.four?.[index], globalWeatherContext),
    ),
  };
  const traitValues = compactTraitValues(side?.traitValues);
  if (side?.battleForm) compact.f = [side.battleForm.spiritId, side.battleForm.branchId];
  if (traitValues) compact.t = traitValues;
  const acquiredTraitIds = compactAcquiredTraitIds(side?.acquiredTraitIds);
  if (acquiredTraitIds.length) {
    compact.r = acquiredTraitIds;
    const acquiredTraitValues = compactAcquiredTraitValues(
      side?.acquiredTraitValues,
      acquiredTraitIds,
    );
    if (acquiredTraitValues) compact.v = acquiredTraitValues;
  }
  return compact;
}

function compactMarks(value, legacyDirections) {
  const marks = normalizeMarksState(value, legacyDirections);
  return ["attacker", "defender"].map((side) => [
    marks[side].positive.id,
    marks[side].positive.stacks,
    marks[side].negative.id,
    marks[side].negative.stacks,
  ]);
}

function compactNegativeStatuses(value) {
  const statuses = normalizeNegativeStatusState(value);
  return ["attacker", "defender"].map((side) => [
    statuses[side].burn,
    statuses[side].freeze,
    statuses[side].parasitism,
    statuses[side].poison,
    statuses[side].electrified,
  ]);
}

function compactDirection(direction) {
  const compact = {};
  const selectedSkillIndex = integerInRange(
    direction?.selectedSkillIndex,
    0,
    6,
    0,
  );
  const reduction = finiteInRange(direction?.reduction, 0, 1, 1);
  const hitCount = integerInRange(
    direction?.hitCount,
    1,
    100,
    1,
  );
  const statusTriggerCount = integerInRange(
    direction?.statusTriggerCount,
    1,
    99,
    undefined,
  );
  const starfallStacks = integerInRange(
    direction?.starfallStacks,
    0,
    100,
    0,
  );
  const finalDamageMultiplier = finiteInRange(
    direction?.finalDamageMultiplier,
    0,
    100,
    1,
  );
  const currentHp =
    direction?.currentHp === null ||
    direction?.currentHp === undefined
      ? null
      : finiteInRange(direction.currentHp, 0, 99999, null);
  const sourceContext = direction?.context ?? {};
  const omittedKeys = [];
  if (["weatherRainTurns", "weatherThunder", "weatherSandstorm", "weatherBlizzard"]
    .some(key => Object.hasOwn(sourceContext, key))) {
    if (Object.hasOwn(sourceContext, "weatherBlizzard") &&
      sourceContext.blizzardWeather === sourceContext.weatherBlizzard) {
      omittedKeys.push("blizzardWeather");
    }
    if (sourceContext.weatherTurns === sourceContext.weatherRainTurns) {
      omittedKeys.push("weatherTurns");
    }
  }
  const context = compactPublicContext(sourceContext, omittedKeys);
  const overrides = compactOverrides(direction?.overrides);

  if (selectedSkillIndex !== 0) compact.x = selectedSkillIndex;
  if (reduction !== 1) compact.q = reduction;
  if (hitCount !== 1) compact.h = hitCount;
  if (statusTriggerCount !== undefined && statusTriggerCount !== 1) {
    compact.t = statusTriggerCount;
  }
  if (starfallStacks !== 0) compact.s = starfallStacks;
  if (finalDamageMultiplier !== 1) compact.m = finalDamageMultiplier;
  if (currentHp !== null) compact.p = currentHp;
  if (context) compact.c = context;
  if (overrides) compact.o = overrides;
  return compact;
}

function toBase64Url(ascii) {
  let base64 = "";
  for (let index = 0; index < ascii.length; index += 3) {
    const first = ascii.charCodeAt(index);
    const second =
      index + 1 < ascii.length ? ascii.charCodeAt(index + 1) : 0;
    const third =
      index + 2 < ascii.length ? ascii.charCodeAt(index + 2) : 0;
    const bits = first << 16 | second << 8 | third;
    base64 += BASE64_ALPHABET[(bits >> 18) & 63];
    base64 += BASE64_ALPHABET[(bits >> 12) & 63];
    base64 +=
      index + 1 < ascii.length
        ? BASE64_ALPHABET[(bits >> 6) & 63]
        : "=";
    base64 +=
      index + 2 < ascii.length ? BASE64_ALPHABET[bits & 63] : "=";
  }
  return base64
    .replace(/\+/gu, "-")
    .replace(/\//gu, "_")
    .replace(/=+$/gu, "");
}

function fromBase64Url(encoded) {
  if (
    typeof encoded !== "string" ||
    encoded.length === 0 ||
    encoded.length > 2048 ||
    !/^[A-Za-z0-9_-]+$/u.test(encoded)
  ) {
    return null;
  }
  const padded = encoded
    .replace(/-/gu, "+")
    .replace(/_/gu, "/")
    .padEnd(Math.ceil(encoded.length / 4) * 4, "=");
  let ascii = "";
  for (let index = 0; index < padded.length; index += 4) {
    const values = padded
      .slice(index, index + 4)
      .split("")
      .map((character) =>
        character === "="
          ? 0
          : BASE64_ALPHABET.indexOf(character),
      );
    if (values.some((value) => value < 0)) return null;
    const bits =
      values[0] << 18 |
      values[1] << 12 |
      values[2] << 6 |
      values[3];
    ascii += String.fromCharCode((bits >> 16) & 255);
    if (padded[index + 2] !== "=") {
      ascii += String.fromCharCode((bits >> 8) & 255);
    }
    if (padded[index + 3] !== "=") {
      ascii += String.fromCharCode(bits & 255);
    }
  }
  return ascii;
}

function stripOptionalInputs(payload) {
  for (const side of [payload.a, payload.d]) {
    side.k = side.k.map((entry) =>
      entry && typeof entry === "object" ? entry.s : entry,
    );
  }
  for (const direction of [payload.f, payload.r]) {
    const context = expandPublicContext(direction.c);
    direction.c = compactPublicContext(Object.fromEntries(
      REQUIRED_CONTEXT_KEYS.filter(key => Object.hasOwn(context ?? {}, key))
        .map(key => [key, context[key]]),
    ));
    if (!direction.c) delete direction.c;
    delete direction.o;
  }
}

function fitPayloadWithMeta(payload) {
  let encoded = toBase64Url(JSON.stringify(payload));
  if (encoded.length <= MAX_ENCODED_LENGTH) {
    return { completeness: "full", encoded };
  }

  payload.g = 1;
  stripOptionalInputs(payload);
  encoded = toBase64Url(JSON.stringify(payload));
  if (encoded.length <= MAX_ENCODED_LENGTH) {
    return { completeness: "reduced", encoded };
  }

  if (payload.m === "four") {
    delete payload.a.u;
    delete payload.d.u;
  } else {
    delete payload.a.k;
    delete payload.d.k;
  }
  encoded = toBase64Url(JSON.stringify(payload));
  if (encoded.length <= MAX_ENCODED_LENGTH) {
    return { completeness: "reduced", encoded };
  }

  for (const side of [payload.a, payload.d]) {
    if (!Array.isArray(side.k)) continue;
    for (let index = side.k.length - 1; index >= 0; index -= 1) {
      side.k[index] = null;
      encoded = toBase64Url(JSON.stringify(payload));
      if (encoded.length <= MAX_ENCODED_LENGTH) {
        return { completeness: "reduced", encoded };
      }
    }
  }

  for (const side of [payload.a, payload.d]) {
    for (const key of Object.keys(side.t ?? {}).reverse()) {
      delete side.t[key];
      if (Object.keys(side.t).length === 0) delete side.t;
      encoded = toBase64Url(JSON.stringify(payload));
      if (encoded.length <= MAX_ENCODED_LENGTH) {
        return { completeness: "reduced", encoded };
      }
    }
  }

  for (const side of [payload.a, payload.d]) {
    for (const [traitId, values] of Object.entries(side.v ?? {}).reverse()) {
      for (const key of Object.keys(values).reverse()) {
        delete values[key];
        if (Object.keys(values).length === 0) delete side.v[traitId];
        if (Object.keys(side.v).length === 0) delete side.v;
        encoded = toBase64Url(JSON.stringify(payload));
        if (encoded.length <= MAX_ENCODED_LENGTH) {
          return { completeness: "reduced", encoded };
        }
      }
    }
  }

  for (const side of [payload.a, payload.d]) {
    while (side.r?.length) {
      const traitId = side.r.pop();
      if (side.v) {
        delete side.v[traitId];
        if (Object.keys(side.v).length === 0) delete side.v;
      }
      if (side.r.length === 0) delete side.r;
      encoded = toBase64Url(JSON.stringify(payload));
      if (encoded.length <= MAX_ENCODED_LENGTH) {
        return { completeness: "reduced", encoded };
      }
    }
  }

  const minimal = {
      v: payload.v,
      g: 2,
      m: payload.m,
      ...(payload.y ? { y: payload.y } : {}),
      a: {
        s: payload.a.s,
        n: payload.a.n,
        i: payload.a.i,
        ...(payload.a.t ? { t: payload.a.t } : {}),
        ...(payload.a.r ? { r: payload.a.r } : {}),
        ...(payload.a.v ? { v: payload.a.v } : {}),
      },
      d: {
        s: payload.d.s,
        n: payload.d.n,
        i: payload.d.i,
        ...(payload.d.t ? { t: payload.d.t } : {}),
        ...(payload.d.r ? { r: payload.d.r } : {}),
        ...(payload.d.v ? { v: payload.d.v } : {}),
      },
      z: payload.z,
      f: payload.f,
      r: payload.r,
      ...(payload.e ? { e: 1, w: payload.w } : {}),
  };
  encoded = toBase64Url(JSON.stringify(minimal));
  if (encoded.length > MAX_ENCODED_LENGTH) {
    // 极端输入先舍弃配点；关键新参数及目标当前 HP 始终保留。
    for (const side of [minimal.a, minimal.d]) {
      delete side.n;
      delete side.i;
    }
    encoded = toBase64Url(JSON.stringify(minimal));
  }
  if (encoded.length > MAX_ENCODED_LENGTH) {
    for (const direction of [minimal.f, minimal.r]) {
      for (const key of ["q", "h", "t", "s", "m"]) delete direction[key];
    }
    encoded = toBase64Url(JSON.stringify(minimal));
  }
  return { completeness: "minimal", encoded };
}

export function encodeSharePayloadWithMeta(state, { direction } = {}) {
  const contexts = [state?.directions?.forward, state?.directions?.reverse,
    ...Object.values(state?.sides ?? {}).flatMap(side =>
      [side?.skills?.single, ...(side?.skills?.four ?? [])])];
  const requiresStatusPreviewClient = state?.calculationOptions?.includeNegativeStatusSettlement === true || contexts.some(value => {
    const context = sanitizePublicContext(value?.context) ?? {};
    return STATUS_PREVIEW_CONTEXT_KEYS.some(key => key === "negativeStatusRepeatSkillsBySlot"
      ? Object.hasOwn(context, key)
      : context[key] === true || Number(context[key]) > 0) ||
      Object.keys(context.negativeStatusUseCountsBySlot ?? {}).some(slot => /^(?:[5-7]|single)$/u.test(slot));
  });
  const requiresLatestClient = requiresStatusPreviewClient || contexts
    .some(value => {
      const context = sanitizePublicContext(value?.context) ?? {};
      return REQUIRED_CONTEXT_KEYS.some(key => key === "negativeStatusUseCountsBySlot"
        ? Object.values(context[key] ?? {}).some(count => count > 0)
        : key === "bloodlineMagicId" ? context[key] && context[key] !== "none"
          : typeof context[key] === "number" ? context[key] > 0 : context[key] === true);
    });
  const payload = {
    v: requiresStatusPreviewClient ? STATUS_PREVIEW_SHARE_VERSION
      : requiresLatestClient ? PARAMETER_SHARE_VERSION : SHARE_VERSION,
    m: state?.mode === "four" ? "four" : "single",
    ...(direction === "reverse" ? { y: "r" } : {}),
    a: compactSide(state?.sides?.attacker, state?.directions?.forward?.context),
    d: compactSide(state?.sides?.defender, state?.directions?.reverse?.context),
    f: compactDirection(state?.directions?.forward),
    r: compactDirection(state?.directions?.reverse),
    z: compactMarks(state?.marks, state?.directions),
    ...(state?.calculationOptions?.includeNegativeStatusSettlement === true
      ? {
          e: 1,
          w: compactNegativeStatuses(state?.negativeStatuses),
        }
      : {}),
  };
  return { ...fitPayloadWithMeta(payload), requiresLatestClient };
}

export function encodeSharePayload(state, options) {
  return encodeSharePayloadWithMeta(state, options).encoded;
}

function validIds(snapshot, collection) {
  return new Set(
    (snapshot?.[collection] ?? [])
      .map((entry) => entry?.id)
      .filter(Boolean),
  );
}

function legalSkillIds(snapshot, spiritId, allSkillIds) {
  const learnset = (snapshot?.learnsets ?? []).find(
    (entry) => entry.spiritId === spiritId,
  );
  return learnset
    ? new Set(
        (learnset.skillIds ?? []).filter((skillId) =>
          allSkillIds.has(skillId),
        ),
      )
    : allSkillIds;
}

function expandOverrides(value) {
  const expanded = {};
  const hitCount = integerInRange(value?.h, 1, 99, undefined);
  if (hitCount !== undefined) expanded.hitCount = hitCount;
  const basePower = finiteInRange(value?.p, 0, 5000, undefined);
  const attackLevelStage = integerInRange(value?.a, -6, 6, undefined);
  const defenseLevelStage = integerInRange(value?.d, -6, 6, undefined);
  if (basePower !== undefined) expanded.basePower = basePower;
  if (attackLevelStage !== undefined && attackLevelStage !== 0) {
    expanded.attackLevelStage = attackLevelStage;
  }
  if (defenseLevelStage !== undefined && defenseLevelStage !== 0) {
    expanded.defenseLevelStage = defenseLevelStage;
  }
  const mode = value?.m === "p"
    ? "panel"
    : value?.m === "s"
      ? "static"
      : undefined;
  const power = integerInRange(value?.v, 0, 9999, undefined);
  if (mode && power !== undefined) {
    expanded.powerOverride = { mode, value: power };
  }
  const cost = integerInRange(value?.c, 0, 99, undefined);
  if (cost !== undefined) expanded.costOverride = cost;
  return Object.keys(expanded).length ? expanded : undefined;
}

function expandSkill(entry, allowedSkillIds) {
  const skillId = safeIdentifier(
    typeof entry === "string" ? entry : entry?.s,
  );
  if (!skillId || !allowedSkillIds.has(skillId)) return null;
  if (typeof entry === "string") return skillId;

  const result = { skillId };
  if (Object.hasOwn(entry ?? {}, "h")) {
    result.hitCount = integerInRange(entry.h, 1, 100, 1);
  }
  if (Object.hasOwn(entry ?? {}, "t")) {
    result.statusTriggerCount = integerInRange(entry.t, 1, 99, 1);
  }
  const context = expandPublicContext(entry?.c);
  const overrides = expandOverrides(entry?.o);
  if (context) result.context = context;
  if (overrides) result.overrides = overrides;
  return Object.keys(result).length === 1 ? skillId : result;
}

function expandTraitValues(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value)
      .filter(
        ([key, candidate]) =>
          /^[A-Za-z0-9_.:-]{1,63}$/u.test(key) &&
          isCompactTraitValue(candidate),
      )
      .map(([key, candidate]) => [`trait.${key}`, candidate]),
  );
}

function expandAcquiredTraitIds(value, traitIds) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(safeAcquiredTraitId).filter(
    (traitId) => traitId && traitIds.has(traitId),
  ))].slice(0, MOON_MEMORY_TRAIT_LIMIT);
}

function expandAcquiredTraitValues(value, acquiredTraitIds) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const allowedTraitIds = new Set(acquiredTraitIds);
  return Object.fromEntries(
    Object.entries(value)
      .filter(([traitId, values]) =>
        allowedTraitIds.has(traitId) &&
        values &&
        typeof values === "object" &&
        !Array.isArray(values)
      )
      .map(([traitId, values]) => [
        traitId,
        Object.fromEntries(
          Object.entries(values)
            .filter(
              ([key, candidate]) =>
                COMPACT_TRAIT_VALUE_KEY_PATTERN.test(key) &&
                isCompactTraitValue(candidate),
            )
            .map(([key, candidate]) => [`trait.${key}`, candidate]),
        ),
      ])
      .filter(([, values]) => Object.keys(values).length > 0),
  );
}

function expandSide(
  raw,
  fallback,
  snapshot,
  spiritIds,
  skillIds,
  traitIds,
  includeTraitValues,
) {
  const requestedSpiritId = safeIdentifier(raw?.s);
  const spiritId =
    requestedSpiritId && spiritIds.has(requestedSpiritId)
      ? requestedSpiritId
      : fallback.spiritId;
  const allowedSkillIds = legalSkillIds(
    snapshot,
    spiritId,
    skillIds,
  );
  const capacity = getSpiritSkillSlotCapacity(snapshot, spiritId);
  const ivs = Array.isArray(raw?.i) ? raw.i : [];
  const four = Array.isArray(raw?.k)
    ? Array.from({ length: capacity }, (_, index) =>
        expandSkill(raw.k[index], allowedSkillIds),
      )
    : [...fallback.skills.four];
  const single = Object.hasOwn(raw ?? {}, "u")
    ? expandSkill(raw.u, allowedSkillIds)
    : fallback.skills.single;

  const expanded = {
    ...fallback,
    displayIvs: Object.fromEntries(
      STAT_KEYS.map((key, index) => [
        key,
        integerInRange(
          ivs[index],
          0,
          60,
          fallback.displayIvs[key],
        ),
      ]),
    ),
    nature: normalizeNatureId(raw?.n),
    skills: { four, single },
    spiritId,
  };
  if (Array.isArray(raw?.f) && raw.f.length === 2) {
    const battleForm = { spiritId: safeIdentifier(raw.f[0]), branchId: safeIdentifier(raw.f[1]) };
    if (isValidBattleForm(snapshot, { ...expanded, battleForm })) expanded.battleForm = battleForm;
  }
  const acquiredTraitIds = expandAcquiredTraitIds(
    includeTraitValues ? raw?.r : undefined,
    traitIds,
  );
  return {
    ...expanded,
    acquiredTraitIds,
    acquiredTraitValues: expandAcquiredTraitValues(
      includeTraitValues ? raw?.v : undefined,
      acquiredTraitIds,
    ),
    traitValues: extractTraitValues(
      {
        ...expanded,
        traitValues: expandTraitValues(
          includeTraitValues ? raw?.t : undefined,
        ),
      },
      snapshot,
    ),
  };
}

function expandDirection(raw, fallback) {
  const currentHp =
    raw?.p === null || raw?.p === undefined
      ? null
      : finiteInRange(raw.p, 0, 99999, null);
  const context = expandPublicContext(raw?.c) ?? {};
  if (typeof context.weatherRainTurns === "number" &&
    context.weatherTurns === undefined) {
    context.weatherTurns = context.weatherRainTurns;
  }
  return {
    ...fallback,
    selectedSkillIndex: integerInRange(raw?.x, 0, 6, 0),
    reduction: finiteInRange(raw?.q, 0, 1, 1),
    hitCount: integerInRange(raw?.h, 1, 100, 1),
    ...(Object.hasOwn(raw ?? {}, "t")
      ? { statusTriggerCount: integerInRange(raw.t, 1, 99, 1) }
      : {}),
    starfallStacks: integerInRange(raw?.s, 0, 100, 0),
    finalDamageMultiplier: finiteInRange(raw?.m, 0, 100, 1),
    currentHp,
    context,
    overrides: expandOverrides(raw?.o) ?? {},
  };
}

function expandMarks(raw, legacyDirections) {
  if (!Array.isArray(raw)) {
    return normalizeMarksState(undefined, legacyDirections);
  }
  const value = Object.fromEntries(
    ["attacker", "defender"].map((side, index) => {
      const compact = Array.isArray(raw[index]) ? raw[index] : [];
      return [
        side,
        {
          positive: { id: compact[0], stacks: compact[1] },
          negative: { id: compact[2], stacks: compact[3] },
        },
      ];
    }),
  );
  return normalizeMarksState(value, legacyDirections);
}

function expandNegativeStatuses(raw) {
  if (!Array.isArray(raw)) return normalizeNegativeStatusState(undefined);
  const expanded = Object.fromEntries(
    ["attacker", "defender"].map((side, index) => {
      const values = Array.isArray(raw[index]) ? raw[index] : [];
      return [side, {
        burn: values[0],
        freeze: values[1],
        parasitism: values[2],
        poison: values[3],
        electrified: values[4],
      }];
    }),
  );
  return normalizeNegativeStatusState(expanded);
}

function invalidDecodeResult() {
  return {
    completeness: "minimal",
    state: null,
    status: "invalid",
  };
}

export function decodeSharePayloadResult(encoded, snapshot) {
  try {
    const json = fromBase64Url(encoded);
    if (!json || /[^\u0000-\u007f]/u.test(json)) {
      return invalidDecodeResult();
    }
    const payload = JSON.parse(json);
    if (
      !payload ||
      typeof payload !== "object" ||
      Array.isArray(payload) ||
      ![1, SHARE_VERSION, PARAMETER_SHARE_VERSION, STATUS_PREVIEW_SHARE_VERSION].includes(payload.v)
    ) {
      return invalidDecodeResult();
    }

    const fallback = createInitialState(snapshot ?? {});
    const spiritIds = validIds(snapshot, "spirits");
    const skillIds = validIds(snapshot, "skills");
    const traitIds = validIds(snapshot, "traits");
    const directions = {
      forward: expandDirection(
        payload.f,
        fallback.directions.forward,
      ),
      reverse: expandDirection(
        payload.r,
        fallback.directions.reverse,
      ),
    };
    const state = {
      ...fallback,
      mode: payload.m === "four" ? "four" : "single",
      marks: expandMarks(payload.v >= 2 ? payload.z : undefined, directions),
      calculationOptions: {
        includeNegativeStatusSettlement: payload.e === 1,
      },
      negativeStatuses: expandNegativeStatuses(payload.e === 1 ? payload.w : undefined),
      sides: {
        attacker: expandSide(
          payload.a,
          fallback.sides.attacker,
          snapshot,
          spiritIds,
          skillIds,
          traitIds,
          payload.v >= 2,
        ),
        defender: expandSide(
          payload.d,
          fallback.sides.defender,
          snapshot,
          spiritIds,
          skillIds,
          traitIds,
          payload.v >= 2,
        ),
      },
      directions,
    };
    return {
      completeness: payload.g === 2
        ? "minimal"
        : payload.g === 1
          ? "reduced"
          : "full",
      direction: payload.y === "r" ? "reverse" : "forward",
      state,
      status: payload.v >= 2 ? "valid" : "repaired",
    };
  } catch {
    return invalidDecodeResult();
  }
}

export function decodeSharePayload(encoded, snapshot) {
  return decodeSharePayloadResult(encoded, snapshot).state ?? {};
}

function titleText(value, fallback) {
  const normalized =
    typeof value === "string"
      ? value.replace(/[\r\n\t]/gu, " ").trim()
      : "";
  return normalized ? normalized.slice(0, 24) : fallback;
}

export function createShareMessage(view, state, direction = "forward") {
  const encoded = encodeSharePayload(state, { direction });
  const attacker = titleText(view?.attackerName, "攻击方");
  const defender = titleText(view?.defenderName, "防守方");
  const result = view?.selectedResult;
  const presentation = damagePresentation(result);
  const damageLabel = result?.statusOnly && presentation.damage === null
    ? presentation.freezePercent > 0 ? presentation.freezeLethal ? "冻结击倒" : "冻结斩杀线" : "无扣血"
    : `${presentation.damage ?? 0}伤害`;
  const detail =
    view?.status === "exact" &&
    Number.isFinite(result?.totalDamage)
      ? `${titleText(result.skillName, "当前技能")} ${damageLabel}${
          Number.isFinite(result?.hpPercent)
            ? `（${presentation.percent.toFixed(1)}%${presentation.freezePercent > 0 ? "" : " HP"}）`
            : ""
        }`
      : "计算配置";

  return {
    title: `${attacker} → ${defender}｜${detail}`.slice(0, 60),
    path: `/pages/index/index?share=${encoded}`,
  };
}
