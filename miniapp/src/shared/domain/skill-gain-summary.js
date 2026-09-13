import { gainSourcesFor, sanitizeGainSources, sourceLabel } from "./gain-provenance.js";
import { markDefinition } from "./marks.js";

const signed = (value) => `${value > 0 ? "+" : ""}${Number(value.toFixed(2))}`;
const directionFor = (side) => side === "attacker" ? "forward" : "reverse";

export function sanitizeSkillActivations(value) {
  return Object.fromEntries(Object.entries(value ?? {}).filter(([, entry]) =>
    entry && Number.isSafeInteger(entry.count) && entry.count > 0 &&
    Number.isSafeInteger(entry.successCount) && entry.successCount >= 0 && entry.successCount <= entry.count,
  ).map(([id, { count, successCount, marks, weather, reduction }]) => [id, { count, successCount,
    ...(Number.isFinite(reduction) && reduction > 0 && reduction <= 100 ? { reduction } : {}),
    ...(Array.isArray(marks) ? { marks: marks.filter((mark) => ["attacker", "defender"].includes(mark?.side) && ["positive", "negative"].includes(mark?.polarity) && markDefinition(mark.id) && Number.isFinite(mark.stacks)) } : {}),
    ...(["rain", "thunder", "sandstorm", "blizzard"].includes(weather) ? { weather } : {}),
  }]));
}

// 点击次数与连击数分开，撤回沿用整个战斗快照；不再执行任何增益。
export function recordSkillActivation(state, side, skill, context = {}, operations = {}, count = 1) {
  const overrides = state.directions[directionFor(side)].overrides;
  const records = sanitizeSkillActivations(overrides.skillActivations);
  const previous = records[skill.id] ?? { count: 0, successCount: 0 };
  for (const record of Object.values(records)) delete record.reduction;
  records[skill.id] = {
    ...previous,
    count: previous.count + count,
    successCount: previous.successCount + (skill.category === "defense" && context.defenseCounterSucceeded === true ? count : 0),
  };
  const applications = [...(operations.markApplications ?? [])];
  if (operations.targetStarfallStacks) applications.push({ target: "opponent", polarity: "negative" });
  if (applications.length) records[skill.id].marks = applications.map((application) => {
    const targetSide = application.target === "self" ? side : side === "attacker" ? "defender" : "attacker";
    return { ...state.marks?.[targetSide]?.[application.polarity], side: targetSide, polarity: application.polarity };
  });
  if (operations.weather) records[skill.id].weather = operations.weather;
  if (operations.defenseReductionPercent > 0) records[skill.id].reduction = operations.defenseReductionPercent;
  overrides.skillActivations = records;
  return state;
}

function activeContributions(direction, side, skillId) {
  const overrides = direction?.overrides ?? {};
  return Object.keys(sanitizeGainSources(overrides.gainSources)).flatMap((field) => {
    const [key, slot] = field.split(".");
    const value = Number(slot ? overrides[key]?.[slot] : overrides[key]) || 0;
    return gainSourcesFor(overrides, field, value)
      .filter((source) => source.kind === "skill" && source.id === `${side}:${skillId}`)
      .map((source) => ({ ...source, field, slot }));
  });
}

function effectLabel(source, opposite) {
  const prefix = opposite ? "敌方" : "";
  const field = source.field.split(".")[0];
  const label = {
    fixedPowerAdd: `${prefix}威力`,
    fixedPowerAddsBySlot: `${prefix}第${source.slot}技能威力`,
    skillPowerPercentAddsBySlot: `${prefix}第${source.slot}技能威力`,
    attackLevelStage: `${prefix}攻击`,
    defenseLevelStage: opposite ? "防御" : "敌方防御",
    magicalDefenseLevelStageAdd: opposite ? "魔防" : "敌方魔防",
    attackerSpeedFlat: `${prefix}速度`,
    hitCountAdd: `${prefix}连击`,
    hitCountPercentAdd: `${prefix}连击`,
    lifestealPercent: `${prefix}吸血`,
  }[field];
  if (!label) return null; // defenderSpeedFlat 是另一方向速度的镜像，不重复列出。
  const percent = ["skillPowerPercentAddsBySlot", "hitCountPercentAdd"].includes(field);
  const stage = field.includes("LevelStage");
  return `${label}${signed(source.amount * (percent ? 100 : 1))}${stage ? "层" : percent || field === "lifestealPercent" ? "%" : ""}`;
}

export function attachSkillGainSummaries(result, state, side, skills) {
  const selfKey = directionFor(side);
  const oppositeKey = selfKey === "forward" ? "reverse" : "forward";
  const self = state.directions?.[selfKey] ?? {};
  const opposite = state.directions?.[oppositeKey] ?? {};
  const records = sanitizeSkillActivations(self.overrides?.skillActivations);
  for (const row of result.results ?? []) {
    const skill = skills.find((item) => item.id === row.skillId);
    if (!skill) continue;
    const record = records[skill.id];
    const ownSources = activeContributions(self, side, skill.id);
    const otherSources = activeContributions(opposite, side, skill.id);
    const effects = [...ownSources.map((source) => effectLabel(source, false)),
      ...otherSources.map((source) => effectLabel(source, true))].filter(Boolean);
    for (const mark of record?.marks ?? []) {
      const current = state.marks?.[mark.side]?.[mark.polarity];
      if (current?.id === mark.id && current.stacks === mark.stacks && mark.stacks > 0) {
        effects.push(`${mark.side === side ? "" : "敌方"}${markDefinition(mark.id).name}${mark.stacks}层`);
      }
    }
    const weather = record?.weather;
    const weatherActive = weather === "rain" ? self.context?.weatherRainTurns > 0
      : self.context?.[{ thunder: "weatherThunder", sandstorm: "weatherSandstorm", blizzard: "weatherBlizzard" }[weather]] === true;
    if (weatherActive) effects.push({ rain: "雨天", thunder: "雷鸣", sandstorm: "沙暴", blizzard: "暴风雪" }[weather]);
    if (record?.reduction && Math.abs(Number(opposite.reduction) - (1 - record.reduction / 100)) < 1e-8) {
      effects.push(`减伤${Math.round((1 - opposite.reduction) * 100)}%`);
    }
    if (record && row.usageSummary?.scope !== "skill") {
      row.usageSummary = {
        ...row.usageSummary,
        count: record.count,
        successCount: skill.category === "defense" ? record.successCount : undefined,
        appliedEffects: [...new Set(effects)],
      };
    }
    // 非伤害技能也保留已生效来源，不以伤害是否可计算作为展示条件。
    if (skill.category === "status" || skill.category === "defense") {
      const sources = [self, opposite].flatMap((direction) => {
        const overrides = direction.overrides ?? {};
        return Object.keys(sanitizeGainSources(overrides.gainSources)).flatMap((field) => {
          const [key, slot] = field.split(".");
          if (direction === opposite ? !["defenseLevelStage", "magicalDefenseLevelStageAdd"].includes(key)
            : ["defenseLevelStage", "magicalDefenseLevelStageAdd", "defenderSpeedFlat"].includes(key)) return [];
          return gainSourcesFor(overrides, field, Number(slot ? overrides[key]?.[slot] : overrides[key]) || 0);
        });
      });
      row.gainSummary = [...new Set(sources.map(sourceLabel))].join(" · ");
    }
  }
  return result;
}
