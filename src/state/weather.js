import { normalizeTriggerControls } from "../domain/trigger-controls.js";

const CONDITIONS = {
  rainWeather: "rain", blizzardWeather: "blizzard", sandstormWeather: "sandstorm",
  dreamWeather: "dream", attackerTraitS5DreamActive: "dream", defenderTraitS5DreamActive: "dream",
  attackerTraitS5SnowActive: "blizzard", defenderTraitS5SnowActive: "blizzard",
};
const GLOBAL_KEYS = ["weatherRainTurns", "weatherThunder", "weatherSandstorm", "weatherBlizzard", "weatherDream"];
const CONTROL_IDS = ["rainWeather", "blizzardWeather", "sandstormWeather", "dreamWeather"].flatMap((key) =>
  ["skill", "attackerTrait", "defenderTrait"].map((source) => {
    const [control] = normalizeTriggerControls([
      { key, label: key, type: "boolean", defaultValue: false,
        scope: source === "skill" ? "slot" : "battle" },
    ], { source });
    return [control.id, CONDITIONS[key]];
  }),
);
for (const source of ["attackerTrait", "defenderTrait"]) {
  const [control] = normalizeTriggerControls([{ key: `${source}S5DreamActive`,
    label: "萌系天气（占位）", type: "boolean", defaultValue: false, scope: "battle" }], { source });
  CONTROL_IDS.push([control.id, "dream"]);
  const [snowControl] = normalizeTriggerControls([{ key: `${source}S5SnowActive`,
    label: "暴风雪天气", type: "boolean", defaultValue: false, scope: "battle" }], { source });
  CONTROL_IDS.push([snowControl.id, "blizzard"]);
}

function conditionWeather(key) {
  return CONDITIONS[key.split(".").find((part) => Object.hasOwn(CONDITIONS, part))];
}

function snowTraitField(key, suffix) {
  return key.split(".").some(part => part === `attackerTraitS5${suffix}` || part === `defenderTraitS5${suffix}`);
}

function snowTraitRole(key) {
  return key.split(".").find(part => /^(?:attacker|defender)TraitS5/u.test(part))?.split("S5")[0];
}

function confirmedSnowTurns(context, sourceKey, fallback = 5) {
  const role = snowTraitRole(sourceKey);
  const value = Object.entries(context ?? {}).find(([key]) =>
    key.split(".").includes(`${role}S5SnowTurnsRemaining`))?.[1];
  return value === undefined ? fallback : Math.min(5, Math.max(0, Math.floor(Number(value) || 0)));
}

export function currentWeather(context = {}) {
  if (Number(context.weatherRainTurns) > 0) return "rain";
  if (context.weatherThunder === true) return "thunder";
  if (context.weatherSandstorm === true) return "sandstorm";
  if (context.weatherBlizzard === true) return "blizzard";
  if (context.weatherDream === true) return "dream";
  return "none";
}

function linkedContext(context = {}, weather, global) {
  const next = { ...context };
  for (const key of Object.keys(next)) {
    const condition = conditionWeather(key);
    if (condition) next[key] = condition === weather;
    if (Object.hasOwn(global, key)) next[key] = global[key];
  }
  for (const [key, condition] of Object.entries(CONDITIONS)) next[key] = condition === weather;
  for (const [key, condition] of CONTROL_IDS) next[key] = condition === weather;
  return next;
}

// 天气属于整场对战，不属于某只精灵或某个技能槽；旧槽位记忆也不能覆盖当前天气。
export function synchronizeWeather(state, weather, turns = 8) {
  // 萌系占位天气的时长未知，不套用已有天气的 8 回合规则。
  const duration = weather === "none" || weather === "dream" ? 0 : Math.min(8, Math.max(1, Number(turns) || 8));
  const global = {
    weatherRainTurns: weather === "rain" ? duration : 0,
    weatherThunder: weather === "thunder",
    weatherSandstorm: weather === "sandstorm",
    weatherBlizzard: weather === "blizzard",
    weatherDream: weather === "dream",
    weatherTurns: duration,
  };
  const entry = (value) => {
    if (!value) return value;
    if (typeof value === "string") value = { skillId: value };
    return {
      ...value,
      context: linkedContext(value.context, weather, global),
      ...(value.overrides?.context ? { overrides: { ...value.overrides,
        context: linkedContext(value.overrides.context, weather, global) } } : {}),
      ...(value.memoryBySkill ? { memoryBySkill: Object.fromEntries(
        Object.entries(value.memoryBySkill).map(([id, memory]) => [id, entry(memory)]),
      ) } : {}),
    };
  };
  return {
    ...state,
    directions: Object.fromEntries(Object.entries(state.directions).map(([key, value]) => [key, {
      ...value, context: { ...linkedContext(value.context, weather, global), ...global },
      ...(value.overrides?.context ? { overrides: { ...value.overrides,
        context: linkedContext(value.overrides.context, weather, global) } } : {}),
    }])),
    sides: Object.fromEntries(Object.entries(state.sides).map(([key, side]) => [key, {
      ...side, skills: { ...side.skills, single: entry(side.skills.single), four: side.skills.four.map(entry) },
    }])),
  };
}

export function reconcileWeatherAction(previous, next, action) {
  if (next === previous) return next;
  const context = next.directions?.forward?.context ?? {};
  let weather = currentWeather(context);
  let turns = context.weatherRainTurns || context.weatherTurns || 8;
  let patch;
  let before;
  if (action.type === "direction/update" || action.type === "direction/set-context") {
    patch = action.type === "direction/update" ? action.value.context : action.value;
    before = previous.directions[action.direction].context;
  } else if (action.type === "battle/set-trait-control") {
    patch = { [action.key]: action.value };
    before = previous.directions[action.direction].context;
  } else if (action.type === "side/set-four-skill") {
    const old = previous.sides[action.side].skills.four[action.index];
    const oldId = typeof old === "string" ? old : old?.skillId ?? old?.id;
    const newId = typeof action.value === "string" ? action.value : action.value?.skillId ?? action.value?.id;
    if (oldId === newId) {
      patch = action.value?.context;
      before = old?.context;
    }
  }
  const explicitGlobal = GLOBAL_KEYS.some((key) => Object.hasOwn(patch ?? {}, key) && patch[key] !== before?.[key]);
  if (explicitGlobal) {
    const merged = { ...before, ...patch };
    // 单独勾选另一种天气时，以这次勾选为准，而非旧天气的优先级。
    const activated = GLOBAL_KEYS.find((key) => Object.hasOwn(patch, key) &&
      (key === "weatherRainTurns" ? Number(patch[key]) > 0 : patch[key] === true));
    weather = activated ? currentWeather({ [activated]: patch[activated] }) : currentWeather(merged);
    turns = merged.weatherRainTurns || merged.weatherTurns || 8;
  } else {
    const snowTrigger = Object.entries(patch ?? {}).find(([key, value]) =>
      snowTraitField(key, "SnowTriggered") && typeof value === "boolean" && value !== before?.[key]);
    const snowTurns = Object.entries(patch ?? {}).find(([key, value]) =>
      snowTraitField(key, "SnowTurnsRemaining") && value !== before?.[key]);
    if (snowTrigger) {
      if (snowTrigger[1]) {
        turns = confirmedSnowTurns({ ...before, ...patch }, snowTrigger[0]);
        weather = turns > 0 ? "blizzard" : "none";
      } else if (weather === "blizzard") weather = "none";
      return synchronizeWeather(next, weather, turns);
    }
    const resumeSnow = snowTurns && weather === "none" && confirmedSnowTurns(before, snowTurns[0]) === 0 &&
      confirmedSnowTurns({ ...before, ...patch }, snowTurns[0]) > 0;
    if (snowTurns && (weather === "blizzard" || resumeSnow) && Object.entries({ ...before, ...patch }).some(([key, value]) =>
      key.split(".").includes(`${snowTraitRole(snowTurns[0])}S5SnowTriggered`) && value === true)) {
      turns = confirmedSnowTurns({ ...before, ...patch }, snowTurns[0]);
      return synchronizeWeather(next, turns > 0 ? "blizzard" : "none", turns);
    }
    const changed = Object.entries(patch ?? {}).find(([key, value]) =>
      conditionWeather(key) && typeof value === "boolean" && value !== before?.[key],
    );
    if (changed) {
      const [key, value] = changed;
      const selected = conditionWeather(key);
      if (value) { weather = selected; turns = 8; }
      else if (weather === selected) weather = "none";
    } else if (!GLOBAL_KEYS.some((key) => Object.hasOwn(context, key))) return next;
  }
  return synchronizeWeather(next, weather, turns);
}
