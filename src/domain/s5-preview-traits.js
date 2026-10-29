import { getS5PreviewTurnEndInputs } from "../features/s5-preview/turn-end-inputs.js";
import { normalizeTriggerControls } from "./trigger-controls.js";
import { projectTraitRuntimeContext } from "./trait-runtime.js";
import { currentWeather } from "../state/weather.js";
import { getLegacyMinggulongLevelInputs } from "../features/s5-preview/level-input-migration.js";
import { getGoldChargeCountInput, getLegacyGoldChargeInputs } from "../features/s5-preview/charge-input-migration.js";
import { getSilverEnergySpentInput, readSilverEnergySpent } from "../features/s5-preview/energy-input-migration.js";
import { readS5SixFaceDiceInput } from "../features/s5-preview/dice-input-migration.js";

const ABU_KEYS = new Set(["abu", "boss-abu", "super-abu"]);

// Shared by the battle resolver and standard level-specific rankings.
export function getS5LevelIncomingDamagePercent(level) {
  return level < 80 ? 40 : 0;
}

const KNOWN_KEYS = new Set([
  "minggulong", "abu", "underground-silver-dragon", "gold-vein-dragon",
  "boss-ice-bruce", "boss-glass-jellyfish", "jingyu", "doulie",
  "watermelon-bug", "diliutun", "lele-shark", "egg-wrap",
  "crab-coconut", "little-scissor", "lily-of-valley",
]);
const rolePrefix = (role) => role === "defender" ? "defenderTrait" : "attackerTrait";
const field = (role, suffix) => rolePrefix(role) + "S5" + suffix;
const boolean = (suffix, label) => ({ suffix, label, type: "boolean", defaultValue: false });
const number = (suffix, label, defaultValue = 0, extra = {}) => ({
  suffix, label, type: "number", defaultValue, min: 0, ...extra,
});

function mechanicFor(trait) {
  const identity = trait?.previewIdentity;
  if (!identity || typeof identity.catalogId !== "string" || !/^s5(?:[-_:]|$)/iu.test(identity.catalogId)) return null;
  return ABU_KEYS.has(identity.mechanicKey) ? "abu" : identity.mechanicKey ?? "unknown";
}

function diceMaximum(trait) {
  const range = /1\s*[~～—–\-至]\s*(6|20)\s*点/u.exec(trait?.description ?? "");
  if (range) return Number(range[1]);
  return trait?.previewIdentity?.key === "diliutun" ? 6 : 20;
}

export function getS5PreviewTraitInputs(trait, role = "attacker") {
  const key = mechanicFor(trait);
  if (key === null) return null;
  let controls = [];
  switch (key) {
    case "minggulong":
      controls = [number("BattleLevel", "当前等级", 99, { min: 1, max: 99, step: 10 })];
      break;
    case "abu":
      controls = [number("BattleLevel", "当前等级", 60, { min: 1, max: 99, step: 2 })];
      break;
    case "gold-vein-dragon":
      return [getGoldChargeCountInput(role), ...getS5PreviewTurnEndInputs(key, role)];
    case "little-scissor":
      controls = [number("OpponentExitCount", "敌方精灵已离场次数")];
      break;
    case "underground-silver-dragon":
      return [getSilverEnergySpentInput(role), ...getS5PreviewTurnEndInputs(key, role)];
    case "lele-shark":
      controls = [boolean("NegativeCleared", "清除自身减益后永久物攻增益已触发（本局一次）")];
      break;
    case "egg-wrap":
      controls = [boolean("EggTriggered", "特性触发")];
      break;
    case "boss-ice-bruce":
      controls = [
        number("CurrentPowerBonus", "当前累计已生效威力增益（手动）", 0, { unit: "%" }),
        number("OpponentTotalCost", "已核对对手总能耗（手动当前值）"),
      ];
      break;
    case "boss-glass-jellyfish":
      controls = [
        boolean("SkillUsed", "已确认本次使用技能"),
        number("PoisonMarkStacks", "实际生效的中毒印记层数（手动取值）"),
      ];
      break;
    case "jingyu":
      controls = [
        { ...boolean("SnowActive", "暴风雪天气"), scope: "battle" },
      ];
      break;
    case "doulie":
      controls = [
        boolean("SnowTriggered", "本局5回合雪天已触发"),
        number("SnowTurnsRemaining", "触发雪天回合（手动确认）", 5, { max: 5 }),
      ];
      break;
    case "watermelon-bug":
      controls = [{
        suffix: "UsedSkillType", label: "本次已使用技能系别", type: "choice", defaultValue: "none",
        options: [{ value: "none", label: "未确认使用" }, { value: "grass", label: "草系" }, { value: "bug", label: "虫系" }],
      }];
      break;
    case "diliutun":
      controls = [
        boolean("DiceRolled", "已掷骰并需要结算点数效果"),
        number("DiceFace", "本次实际骰点", 1, { min: 1, max: diceMaximum(trait) }),
      ];
      break;
    case "crab-coconut":
      controls = [boolean("GrassDiscountReady", "水系技能后下次行动草系减费待生效")];
      break;
    case "lily-of-valley":
      controls = [
        { ...boolean("DreamActive", "萌系天气（占位）"), scope: "battle" },
        { ...boolean("TurnEndConfirmed", "回合结束 · 对手寄生+3"), action: "s5-dream-turn-end" },
      ];
      break;
  }
  return normalizeTriggerControls(controls.map(({ suffix, unit, ...control }) => ({
    scope: "direction", ...control, contextKey: field(role, suffix),
    ...(unit ? { suffix: unit } : {}),
  })), { source: rolePrefix(role) });
}

function projectedValues(trait, role, context) {
  return projectTraitRuntimeContext(context ?? {}, trait, getS5PreviewTraitInputs(trait, role) ?? []);
}

export function getS5PreviewTraitEvaluation(trait, role = "attacker", context = {}, { skill } = {}) {
  const key = mechanicFor(trait);
  if (key === null) return null;
  const values = projectedValues(trait, role, context);
  const read = (suffix) => values[field(role, suffix)];
  const enabled = (suffix) => read(suffix) === true;
  const amount = (suffix) => Math.max(0, Number(read(suffix)) || 0);
  const result = { mechanicKey: key, summary: "", calcStatus: "ready", effects: [] };
  const block = (reason) => {
    result.blockingReason = reason;
    result.reason = reason;
    result.calcStatus = "pending";
  };
  if (!KNOWN_KEYS.has(key)) {
    result.summary = "该S5特性的规则尚未接入";
    block(result.summary);
    return result;
  }
  switch (key) {
    case "minggulong": {
      const legacy = projectTraitRuntimeContext(context, trait, getLegacyMinggulongLevelInputs(role));
      const legacyLevel = legacy[field(role, "CurrentLevel")] - 10 * legacy[field(role, "LevelEventCount")];
      if (legacyLevel < 1) {
        result.currentLevel = legacyLevel;
        result.summary = "旧回合记录等级无效，请填写当前等级";
        block("当前计数推得等级" + legacyLevel + "，等级下降下限尚未公开，请填写当前等级");
        break;
      }
      const level = amount("BattleLevel");
      result.currentLevel = level;
      result.summary = "当前等级 " + level;
      const incomingPercent = getS5LevelIncomingDamagePercent(level);
      if (incomingPercent) {
        result.summary += "；承伤 +" + incomingPercent + "%";
        result.effects.push({ kind: "incoming-damage-percent", amount: incomingPercent });
      }
      break;
    }
    case "abu": {
      const level = amount("BattleLevel");
      result.currentLevel = level;
      result.summary = "当前等级 " + level;
      result.note = "默认60级为试算输入；按实战当前等级填写，上限99级。";
      const incomingPercent = getS5LevelIncomingDamagePercent(level);
      if (incomingPercent) {
        result.summary += "；承伤 +" + incomingPercent + "%";
        result.effects.push({ kind: "incoming-damage-percent", amount: incomingPercent });
      }
      break;
    }
    case "gold-vein-dragon": {
      const control = getGoldChargeCountInput(role);
      const explicit = projectTraitRuntimeContext(context, trait, [{ ...control, defaultValue: undefined }]);
      const legacy = projectTraitRuntimeContext(context, trait, getLegacyGoldChargeInputs(role));
      const legacyBonus = legacy[field(role, "AttackBuffActive")] ? legacy[field(role, "CurrentAttackBonus")] : 0;
      const count = explicit[control.contextKey] ?? legacyBonus / 50;
      if (!Number.isSafeInteger(count)) {
        result.summary = "旧手调增益无法换算整次聚能，请填写聚能次数";
        block(result.summary);
        break;
      }
      const settled = Math.min(count, read("SettledChargeCount") ?? count);
      result.totalCount = count;
      result.settledCount = settled;
      result.pendingCount = count - settled;
      const stages = settled * 5;
      result.summary = count ? "聚能 " + count + " 次 · 物攻能力等级 +" + stages : "未聚能 · 无增益";
      if (result.pendingCount) result.summary += "；待回合结束 " + result.pendingCount + " 次";
      result.note = "每次聚能在回合结束时物攻+50%；与其它能力等级一起按现有上限结算。";
      if (settled) result.effects.push({ kind: "physical-attack-percent", amount: stages * 10 });
      break;
    }
    case "little-scissor": {
      const count = amount("OpponentExitCount");
      const bonus = count * 20;
      result.summary = count ? "敌方已离场 " + count + " 次 · 技能威力 +" + bonus : "敌方尚未离场 · 无威力增益";
      result.note = "按敌方实际离场次数累计；旧版双攻增益字段不转换为离场次数。";
      if (bonus) result.effects.push({ kind: "skill-power-flat", amount: bonus });
      break;
    }
    case "underground-silver-dragon": {
      const energy = readSilverEnergySpent(context, role, trait);
      if (energy === null) {
        result.summary = "旧手调增益无法换算整点能量，请填写累计消耗能量";
        block(result.summary);
        break;
      }
      const spent = energy ?? 0;
      result.energySpent = spent;
      const settled = Math.min(spent, read("SettledEnergySpent") ?? spent);
      result.totalCount = spent;
      result.settledCount = settled;
      result.pendingCount = spent - settled;
      const bonus = settled * 10;
      result.summary = "累计消耗 " + spent + " 点能量 · 魔攻 +" + bonus + "%";
      if (result.pendingCount) result.summary += "；待回合结束 " + result.pendingCount + " 点";
      result.note = "每消耗1点能量在回合结束时魔攻+10%；当次技能不提前获得，累计后按现有能力等级上限结算。";
      if (bonus) result.effects.push({ kind: "magical-attack-percent", amount: bonus });
      break;
    }
    case "lele-shark":
      result.summary = enabled("NegativeCleared") ? "本局已触发一次：永久物攻 +50%" : "尚未确认清除自身减益，无物攻增益";
      if (enabled("NegativeCleared")) result.effects.push({ kind: "physical-attack-percent", amount: 50, oncePerBattle: true, duration: "permanent" });
      break;
    case "egg-wrap": {
      const active = enabled("EggTriggered");
      result.summary = active ? "双防 +50%" : "特性未触发";
      result.note = "按队伍中是否存在萌化精灵的当前条件结算，不按入场次数叠加。";
      if (active) result.effects.push({ kind: "defense-percent", amount: 50 });
      break;
    }
    case "boss-ice-bruce": {
      const bonus = amount("CurrentPowerBonus");
      const cost = amount("OpponentTotalCost");
      result.summary = "当前累计威力 +" + bonus + "%；手动对手总能耗 " + cost + (cost >= 20 ? "；速度 +50" : "；速度无额外增益");
      result.note = "威力总值和总能耗由玩家按实际当前口径核对，不从配招或消耗历史自动推定。";
      if (bonus) result.effects.push({ kind: "skill-power-percent", amount: bonus });
      if (cost >= 20) result.effects.push({ kind: "speed-flat", amount: 50 });
      break;
    }
    case "boss-glass-jellyfish": {
      const stacks = enabled("SkillUsed") ? amount("PoisonMarkStacks") * 2 : 0;
      result.summary = enabled("SkillUsed") ? "本次使用后：对手中毒 +" + stacks + "层" : "未确认本次使用，不追加中毒";
      result.note = "印记所属与取值由玩家按实况填写；不把已有中毒状态当作中毒印记。";
      if (stacks) result.effects.push({ kind: "status-add", target: "opponent", status: "poison", stacks, timing: "after-skill", confirmedSource: "manual-effective-poison-mark-stacks" });
      break;
    }
    case "jingyu":
      result.summary = currentWeather(context) === "blizzard" ? "暴风雪生效：回合结束敌方获得3层星陨印记（回合末待适配）" : "当前未处于暴风雪，无回合末星陨施加";
      result.note = "仅在场且暴风雪回合结束生效；当前技能施加的冻结保持不变，不把回合末效果提前计入伤害。";
      break;
    case "doulie":
      result.summary = enabled("SnowTriggered")
        ? currentWeather(context) === "blizzard" ? "本局雪天已触发；当前剩余 " + Math.max(0, Number(context.weatherTurns) || 0) + " 回合" : "本局雪天已触发；当前未处于雪天"
        : "本局雪天未确认触发";
      result.note = "确认触发后同步全场暴风雪；不自动累计10层冻结或推进回合。切换其它天气不会清除本局已触发记录。";
      if (enabled("SnowTriggered") && currentWeather(context) === "blizzard") result.effects.push({ kind: "weather-state", weather: "snow", remainingTurns: Math.max(0, Number(context.weatherTurns) || 0), oncePerBattle: true });
      break;
    case "watermelon-bug": {
      const type = read("UsedSkillType");
      const matches = !skill || skill.type === (type === "bug" ? "虫" : "草");
      result.summary = type === "bug" ? "本次虫系技能使用后：对手寄生 +1层" : type === "grass" ? "本次草系技能：随机奉献1层，结果待确认" : "未确认本次使用系别，无额外施加";
      if (type === "bug" && matches) result.effects.push({ kind: "status-add", target: "opponent", status: "parasitism", stacks: 1, timing: "after-skill", requiredSkillType: "虫", confirmedSource: "manual-current-skill-type" });
      if (type === "grass" && matches) result.effects.push({ kind: "random-donation-pending", stacks: 1, requiredSkillType: "草" });
      result.note = "只对应本次实际系别匹配的技能；随机奉献不生成未确认增益，不自动应用于后续伤害。";
      break;
    }
    case "diliutun": {
      const face = diceMaximum(trait) === 6 ? readS5SixFaceDiceInput(context, role, trait) : undefined;
      if (face === null) {
        result.summary = "旧骰点不在1~6范围，请重新选择实际骰点";
        block(result.summary);
        break;
      }
      result.summary = enabled("DiceRolled") ? "本次实际骰点 " + (face ?? amount("DiceFace")) + "；点数效果尚未公开" : "尚未确认掷骰，无骰子增减益";
      if (enabled("DiceRolled")) block("骰子点数与双方增减益映射尚未公开，不能生成本次实数增减益");
      break;
    }
    case "crab-coconut":
      result.summary = enabled("GrassDiscountReady") ? "水系技能后：下次行动草系技能能耗 -3（待生效）" : "无已确认的下次行动草系减费";
      result.note = "下次行动仅草系享受减3，非草行动也消耗机会；再次使用水系技能可重新触发，不累计多份减费。";
      if (enabled("GrassDiscountReady")) result.effects.push({ kind: "next-grass-cost-discount", amount: 3, currentPending: true });
      break;
    case "lily-of-valley":
      // Weather is global. Old per-trait confirmations must never replay a turn.
      result.summary = context.weatherDream === true
        ? "萌系天气生效：回合结束可给对手3层寄生"
        : "萌系天气未生效，无寄生施加";
      result.note = "点击回合结束挂寄生；不自动推进回合或扣血。";
      break;
  }
  return result;
}

export function getS5PreviewSkillCostReduction(traits, context, skill) {
  if (skill?.type !== "草") return 0;
  return (traits ?? []).reduce((total, trait) => {
    const evaluation = getS5PreviewTraitEvaluation(trait, "attacker", context, { skill });
    if (evaluation?.calcStatus !== "ready") return total;
    return total + evaluation.effects.filter(effect => effect.kind === "next-grass-cost-discount")
      .reduce((amount, effect) => amount + effect.amount, 0);
  }, 0);
}

function neutral() {
  return {
    attackLevelBonus: 0, attackerSpeedFlatBonus: 0, attackerSpeedLevelBonus: 0,
    attackerDefenseLevelBonus: 0, attackMultiplier: 1, defenseLevelBonus: 0,
    defenderDefenseLevelBonus: 0, defenderSpeedFlatBonus: 0, defenderSpeedLevelBonus: 0,
    damageReductionMultiplier: 1, finalDamageMultiplier: 1, fixedPowerAdd: 0,
    powerPercentAdd: 0, powerMultiplier: 1, step: null,
  };
}

export function resolveS5PreviewTraitEffect(trait, role = "attacker", input = {}) {
  const evaluation = getS5PreviewTraitEvaluation(trait, role, input.context, { skill: input.skill });
  if (!evaluation) return null;
  const result = neutral();
  if (evaluation.blockingReason) return result;
  for (const entry of evaluation.effects) {
    if (entry.kind === "attack-percent" && role === "attacker" ||
        entry.kind === "physical-attack-percent" && role === "attacker" && input.skill?.category === "physical" ||
        entry.kind === "magical-attack-percent" && role === "attacker" && input.skill?.category === "magical") {
      result.attackLevelBonus += entry.amount / 10;
      result.attackMultiplier += entry.amount / 100;
    }
    if (entry.kind === "defense-percent") {
      if (role === "attacker") result.attackerDefenseLevelBonus += entry.amount / 10;
      else {
        result.defenderDefenseLevelBonus += entry.amount / 10;
        result.defenseLevelBonus += entry.amount / 10;
      }
    }
    if (entry.kind === "skill-power-percent" && role === "attacker") {
      result.powerPercentAdd += entry.amount / 100;
      result.powerMultiplier += entry.amount / 100;
    }
    if (entry.kind === "skill-power-flat" && role === "attacker") result.fixedPowerAdd += entry.amount;
    if (entry.kind === "speed-flat") result[role === "attacker" ? "attackerSpeedFlatBonus" : "defenderSpeedFlatBonus"] += entry.amount;
    if (entry.kind === "incoming-damage-percent" && role === "defender") result.finalDamageMultiplier *= 1 + entry.amount / 100;
  }
  const baseline = neutral();
  if (Object.keys(result).some((key) => key !== "step" && result[key] !== baseline[key])) {
    const flatSpeed = result.attackerSpeedFlatBonus || result.defenderSpeedFlatBonus;
    const defenseLevels = result.defenseLevelBonus || result.attackerDefenseLevelBonus || result.defenderDefenseLevelBonus;
    const factor = result.attackMultiplier !== 1 ? result.attackMultiplier
      : result.powerMultiplier !== 1 ? result.powerMultiplier
        : result.finalDamageMultiplier !== 1 ? result.finalDamageMultiplier
          : defenseLevels ? 1 + defenseLevels / 10 : null;
    result.step = {
      label: (trait.displayName ?? trait.name ?? "S5前瞻特性") + " · " + evaluation.summary,
      input: { summary: evaluation.summary, effects: evaluation.effects },
      before: factor === null ? 0 : 1, after: factor ?? (result.fixedPowerAdd || flatSpeed),
      source: "manual-s5-preview-state",
    };
  }
  return result;
}
