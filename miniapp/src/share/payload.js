import { normalizeNatureId } from "../shared/domain/natures.js";
import { normalizeMarksState } from "../shared/domain/marks.js";
import { normalizeNegativeStatusState } from "../shared/domain/negative-status.js";
import { getSpiritSkillSlotCapacity } from "../shared/domain/skill-slot-capacity.js";
import { createInitialState } from "../shared/state/defaults.js";
import { extractTraitValues } from "../shared/state/trait-values.js";
import { sanitizePublicContext } from "./context-schema.js";

const SHARE_VERSION = 2;
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

function safeIdentifier(value) {
  return typeof value === "string" &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/u.test(value)
    ? value
    : null;
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
  return Object.keys(compact).length ? compact : undefined;
}

function compactSkill(entry) {
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
  const context = sanitizePublicContext(entry.context);
  const overrides = compactOverrides(entry.overrides);
  if (hitCount !== undefined && hitCount !== 1) compact.h = hitCount;
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

function compactSide(side) {
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
    u: compactSkill(side?.skills?.single),
    k: Array.from({ length: capacity }, (_, index) =>
      compactSkill(side?.skills?.four?.[index]),
    ),
  };
  const traitValues = compactTraitValues(side?.traitValues);
  if (traitValues) compact.t = traitValues;
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
  const context = sanitizePublicContext(direction?.context);
  const overrides = compactOverrides(direction?.overrides);

  if (selectedSkillIndex !== 0) compact.x = selectedSkillIndex;
  if (reduction !== 1) compact.q = reduction;
  if (hitCount !== 1) compact.h = hitCount;
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
    delete direction.c;
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

  return {
    completeness: "minimal",
    encoded: toBase64Url(
      JSON.stringify({
      v: SHARE_VERSION,
      g: 2,
      m: payload.m,
      ...(payload.y ? { y: payload.y } : {}),
      a: {
        s: payload.a.s,
        n: payload.a.n,
        i: payload.a.i,
        ...(payload.a.t ? { t: payload.a.t } : {}),
      },
      d: {
        s: payload.d.s,
        n: payload.d.n,
        i: payload.d.i,
        ...(payload.d.t ? { t: payload.d.t } : {}),
      },
      z: payload.z,
      ...(payload.e ? { e: 1, w: payload.w } : {}),
      }),
    ),
  };
}

export function encodeSharePayloadWithMeta(state, { direction } = {}) {
  const payload = {
    v: SHARE_VERSION,
    m: state?.mode === "four" ? "four" : "single",
    ...(direction === "reverse" ? { y: "r" } : {}),
    a: compactSide(state?.sides?.attacker),
    d: compactSide(state?.sides?.defender),
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
  return fitPayloadWithMeta(payload);
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
  const context = sanitizePublicContext(entry?.c);
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

function expandSide(
  raw,
  fallback,
  snapshot,
  spiritIds,
  skillIds,
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
  return {
    ...expanded,
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
  return {
    ...fallback,
    selectedSkillIndex: integerInRange(raw?.x, 0, 6, 0),
    reduction: finiteInRange(raw?.q, 0, 1, 1),
    hitCount: integerInRange(raw?.h, 1, 100, 1),
    starfallStacks: integerInRange(raw?.s, 0, 100, 0),
    finalDamageMultiplier: finiteInRange(raw?.m, 0, 100, 1),
    currentHp,
    context: sanitizePublicContext(raw?.c) ?? {},
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
      (payload.v !== 1 && payload.v !== SHARE_VERSION)
    ) {
      return invalidDecodeResult();
    }

    const fallback = createInitialState(snapshot ?? {});
    const spiritIds = validIds(snapshot, "spirits");
    const skillIds = validIds(snapshot, "skills");
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
      marks: expandMarks(payload.v === 2 ? payload.z : undefined, directions),
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
          payload.v === SHARE_VERSION,
        ),
        defender: expandSide(
          payload.d,
          fallback.sides.defender,
          snapshot,
          spiritIds,
          skillIds,
          payload.v === SHARE_VERSION,
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
      status: payload.v === SHARE_VERSION ? "valid" : "repaired",
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
  const detail =
    view?.status === "exact" &&
    Number.isFinite(result?.totalDamage)
      ? `${titleText(result.skillName, "当前技能")} ${result.totalDamage}伤害${
          Number.isFinite(result?.hpPercent)
            ? `（${Number(result.hpPercent).toFixed(1)}% HP）`
            : ""
        }`
      : "计算配置";

  return {
    title: `${attacker} → ${defender}｜${detail}`.slice(0, 60),
    path: `/pages/index/index?share=${encoded}`,
  };
}
