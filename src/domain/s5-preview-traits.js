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

const DICE_STAT_LABELS = Object.freeze({
  物攻: "physical-attack-percent", 魔攻: "magical-attack-percent", 双攻: "attack-percent",
  物防: "physical-defense-percent", 魔防: "magical-defense-percent", 双防: "defense-percent",
  速度: "speed-flat", 技能威力: "skill-power-flat", 连击数: "hit-count-flat", 技能能耗: "skill-cost-flat",
});

function diceRowSummary(row) {
  if (!row) return "";
  const targets = { 场上所有精灵: "双方", 自身: "自身", 对手: "对手" };
  return (row.note ? row.note + "：" : "") + (row.effects ?? []).map(effect =>
    `${targets[effect.target] ?? effect.target}${effect.label}${effect.value}`).join("、");
}

function diceOptions(trait) {
  return Array.from({ length: diceMaximum(trait) }, (_, index) => {
    const value = index + 1;
    const row = trait.effectDetails?.rows?.find(entry => Number(/^\s*(\d+)\s*点/u.exec(entry.label ?? "")?.[1]) === value);
    return { value, label: row ? `${row.label}｜${diceRowSummary(row)}` : `${value} 点` };
  });
}

function diceEffects(trait, face) {
  const row = trait.effectDetails?.rows?.find(entry => Number(/^\s*(\d+)\s*点/u.exec(entry.label ?? "")?.[1]) === face);
  if (!row) return { reason: "骰子点数与双方增减益映射尚未公开，不能生成本次实数增减益" };
  // Like the contract-ball healing entry, a future heal does not change this
  // hit's damage or current HP. Keep its timing visible without blocking it.
  if (row.note === "回合结束" && row.effects?.length === 1 &&
      row.effects[0].label === "回复生命" && row.effects[0].target === "场上所有精灵" && row.effects[0].value === "10%") {
    return { row, effects: [{ kind: "battle-healing-percent", amount: 10, target: "both", timing: "turn-end" }] };
  }
  const effects = [];
  for (const effect of row.effects ?? []) {
    const kind = DICE_STAT_LABELS[effect.label];
    const value = String(effect.value ?? "").replace(/−/gu, "-");
    const amount = Number(value.replace(/[%％]/gu, ""));
    const percent = kind?.endsWith("-percent");
    if (!kind || effect.target !== "场上所有精灵" || row.note || !Number.isFinite(amount) ||
        percent !== /[%％]/u.test(value) || !Number.isInteger(amount)) {
      return { row, reason: `骰点${face}的${row.note || [...new Set(row.effects.map(item => item.label))].join("、")}结算尚未接入` };
    }
    effects.push({ kind: `battle-${kind}`, amount, target: "both" });
  }
  return effects.length ? { row, effects } : { row, reason: `骰点${face}尚无可计算的效果` };
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
      controls = [boolean("NegativeCleared", "特性触发")];
      break;
    case "egg-wrap":
      controls = [boolean("EggTriggered", "特性触发")];
      break;
    case "boss-ice-bruce":
      return normalizeTriggerControls([
        { key: "enemyTotalSkillCostAuto", label: "自动能耗", type: "boolean", defaultValue: true, scope: "direction" },
        { key: "enemyTotalSkillCost", label: "敌方技能总能耗", type: "number", defaultValue: 0, min: 0, scope: "direction",
          visibleWhen: { contextKey: "enemyTotalSkillCostAuto", equals: false, defaultValue: true } },
        { key: "speedBoostTriggered", label: "加速（速度+75）", type: "boolean", defaultValue: false, scope: "direction" },
      ], { source: rolePrefix(role) });
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
        boolean("DiceRolled", "特性触发"),
        number("DiceFace", "骰点", 1, { min: 1, max: diceMaximum(trait),
          selectOptions: diceOptions(trait), selectionToggleKey: field(role, "DiceRolled") }),
      ];
      break;
    case "crab-coconut":
      controls = [boolean("GrassDiscountReady", "水系技能后下次行动草系减费待生效")];
      break;
    case "lily-of-valley":
      controls = [
        { ...boolean("DreamActive", "霞光梦境"), scope: "battle" },
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
      result.summary = count ? "聚能 " + count + " 次 · 物攻能力等级 +" + stages : "未聚能";
      if (result.pendingCount) result.summary += "；待回合结束 " + result.pendingCount + " 次";
      result.note = "每次聚能在回合结束时物攻+50%；与其它能力等级一起按现有上限结算。";
      if (settled) result.effects.push({ kind: "physical-attack-percent", amount: stages * 10 });
      break;
    }
    case "little-scissor": {
      const count = amount("OpponentExitCount");
      const bonus = count * 20;
      result.summary = count ? "敌方已离场 " + count + " 次 · 技能威力 +" + bonus : "敌方尚未离场";
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
      result.summary = enabled("NegativeCleared") ? "本局已触发一次：永久物攻 +50%" : "特性未触发";
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
      const costControl = getS5PreviewTraitInputs(trait, role).find(control => control.contextKey === "enemyTotalSkillCost");
      if (values.enemyTotalSkillCostAuto !== false &&
          (context[costControl.id] === null || !Number.isSafeInteger(values.enemyTotalSkillCost) || values.enemyTotalSkillCost < 0)) {
        result.summary = "对手有技能能耗待确认，请关闭自动能耗后手动填写总值";
        block(result.summary);
        break;
      }
      const cost = Math.max(0, Number(values.enemyTotalSkillCost) || 0);
      const bonus = cost * 10;
      const speedBoost = cost > 15 || values.speedBoostTriggered === true;
      result.summary = "敌方携带技能总能耗 " + cost + "；威力 +" + bonus + "%" + (speedBoost ? "；速度 +75" : "");
      result.note = "默认读取对手携带技能总能耗；关闭自动能耗后可手动填写，总能耗大于15时速度+75，也可勾选加速直接计入。";
      if (bonus) result.effects.push({ kind: "skill-power-percent", amount: bonus });
      if (speedBoost) result.effects.push({ kind: "speed-flat", amount: 75 });
      break;
    }
    case "boss-glass-jellyfish": {
      const stacks = enabled("SkillUsed") ? amount("PoisonMarkStacks") * 2 : 0;
      result.summary = enabled("SkillUsed") ? "本次使用后：对手中毒 +" + stacks + "层" : "尚未使用技能";
      result.note = "印记所属与取值由玩家按实况填写；不把已有中毒状态当作中毒印记。";
      if (stacks) result.effects.push({ kind: "status-add", target: "opponent", status: "poison", stacks, timing: "after-skill", confirmedSource: "manual-effective-poison-mark-stacks" });
      break;
    }
    case "jingyu":
      result.summary = currentWeather(context) === "blizzard" ? "暴风雪生效：回合结束敌方获得3层星陨印记（回合末待适配）" : "暴风雪未生效";
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
      result.summary = type === "bug" ? "本次虫系技能使用后：对手寄生 +1层" : type === "grass" ? "本次草系技能：随机奉献1层，结果待确认" : "尚未使用技能";
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
      const actualFace = face ?? amount("DiceFace");
      result.summary = enabled("DiceRolled") ? `${actualFace} 点` : "未掷骰";
      if (enabled("DiceRolled")) {
        const dice = diceEffects(trait, actualFace);
        if (dice.row) result.summary += " · " + diceRowSummary(dice.row);
        if (dice.reason) block(dice.reason);
        else result.effects.push(...dice.effects);
      }
      break;
    }
    case "crab-coconut":
      result.summary = enabled("GrassDiscountReady") ? "水系技能后：下次行动草系技能能耗 -3（待生效）" : "草系减费未触发";
      result.note = "下次行动仅草系享受减3，非草行动也消耗机会；再次使用水系技能可重新触发，不累计多份减费。";
      if (enabled("GrassDiscountReady")) result.effects.push({ kind: "next-grass-cost-discount", amount: 3, currentPending: true });
      break;
    case "lily-of-valley":
      // Weather is global. Old per-trait confirmations must never replay a turn.
      result.summary = context.weatherDream === true
        ? "霞光梦境生效：回合结束可给对手3层寄生"
        : "霞光梦境未生效";
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

export function getS5PreviewDiceSkillModifiers({ attackerTraits = [], defenderTraits = [], context = {} } = {}) {
  const result = { costReduction: 0, hitCountAdd: 0, hitCountSteps: [], sources: [] };
  for (const [traits, role] of [[attackerTraits, "attacker"], [defenderTraits, "defender"]]) {
    for (const trait of traits) {
      if (mechanicFor(trait) !== "diliutun") continue;
      const evaluation = getS5PreviewTraitEvaluation(trait, role, context);
      if (evaluation?.calcStatus !== "ready") continue;
      for (const effect of evaluation.effects) {
        if (effect.kind === "battle-skill-cost-flat") result.costReduction -= effect.amount;
        if (effect.kind === "battle-hit-count-flat") {
          result.hitCountAdd += effect.amount;
          result.hitCountSteps.push({ before: 0, after: effect.amount, input: { amount: effect.amount }, label: `${trait.name} · ${evaluation.summary}` });
          result.sources.push(trait.provenance ?? `reviewed-trait:${trait.id}`);
        }
      }
    }
  }
  return result;
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
  const opponent = role === "defender" ? input.attacker : input.defender;
  const totalCost = trait?.previewIdentity?.mechanicKey === "boss-ice-bruce" && opponent?.confirmedTotalSkillCost !== undefined
    ? opponent.confirmedTotalSkillCost : opponent?.totalSkillCost;
  const context = totalCost === undefined ? input.context
    : { ...input.context, automaticEnemyTotalSkillCost: totalCost };
  const evaluation = getS5PreviewTraitEvaluation(trait, role, context, { skill: input.skill });
  if (!evaluation) return null;
  const result = neutral();
  if (evaluation.blockingReason) return result;
  for (const entry of evaluation.effects) {
    if (entry.kind.startsWith("battle-")) {
      const kind = entry.kind.slice("battle-".length);
      const category = input.skill?.category;
      if (kind === "attack-percent" || kind === "physical-attack-percent" && category === "physical" ||
          kind === "magical-attack-percent" && category === "magical") {
        result.attackLevelBonus += entry.amount / 10;
      }
      const physicalDefense = kind === "defense-percent" || kind === "physical-defense-percent";
      const magicalDefense = kind === "defense-percent" || kind === "magical-defense-percent";
      if (physicalDefense) {
        result.attackerDefenseLevelBonus += entry.amount / 10;
        result.defenderDefenseLevelBonus += entry.amount / 10;
      }
      if (physicalDefense && category === "physical" || magicalDefense && category === "magical") result.defenseLevelBonus += entry.amount / 10;
      if (kind === "speed-flat") {
        result.attackerSpeedFlatBonus += entry.amount;
        result.defenderSpeedFlatBonus += entry.amount;
      }
      if (kind === "skill-power-flat") result.fixedPowerAdd += entry.amount;
      continue;
    }
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
