import { normalizeTriggerControls } from "./trigger-controls.js";
import { projectTraitRuntimeContext } from "./trait-runtime.js";

const ABU_KEYS = new Set(["abu", "boss-abu", "super-abu"]);
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

export function getS5PreviewTraitInputs(trait, role = "attacker") {
  const key = mechanicFor(trait);
  if (key === null) return null;
  let controls = [];
  switch (key) {
    case "minggulong":
    case "abu":
      controls = [
        number("CurrentLevel", key === "minggulong" ? "起始等级（默认99）" : "起始等级", key === "minggulong" ? 99 : 60, { min: 1, max: 99 }),
        number("LevelEventCount", key === "minggulong" ? "已结束回合数" : "已确认符合3能耗条件的使用次数"),
      ];
      break;
    case "gold-vein-dragon":
    case "little-scissor":
      controls = [
        boolean("AttackBuffActive", key === "gold-vein-dragon" ? "聚能后双攻增益当前生效" : "对方换人后双攻增益当前生效"),
        number("CurrentAttackBonus", "当前已生效双攻增益", 50, { unit: "%" }),
      ];
      break;
    case "underground-silver-dragon":
      controls = [number("CurrentMagicalAttackBonus", "当前累计已生效魔攻增益", 0, { unit: "%" })];
      break;
    case "lele-shark":
      controls = [boolean("NegativeCleared", "清除自身减益后永久双攻增益已触发（本局一次）")];
      break;
    case "egg-wrap":
      controls = [
        boolean("TeamMoenhua", "入场时己方有萌化精灵"),
        boolean("EntryDefenseActive", "本次入场双防增益当前生效"),
      ];
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
        boolean("SnowActive", "当前处于雪天"),
        boolean("FreezeApplicationConfirmed", "已确认本次有符合条件的敌方新增冻结"),
      ];
      break;
    case "doulie":
      controls = [
        boolean("SnowTriggered", "本局5回合雪天已触发"),
        number("SnowTurnsRemaining", "当前雪天剩余回合（手动）", 5, { max: 5 }),
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
        number("DiceFace", "本次实际骰点", 1, { min: 1, max: 20 }),
      ];
      break;
    case "crab-coconut":
      controls = [boolean("GrassDiscountReady", "水系技能后下一草系减费待生效")];
      break;
    case "lily-of-valley":
      controls = [
        boolean("DreamActive", "当前处于梦境"),
        boolean("TurnEndConfirmed", "已确认本次回合结束结算"),
      ];
      break;
  }
  return normalizeTriggerControls(controls.map(({ suffix, unit, ...control }) => ({
    ...control, contextKey: field(role, suffix), scope: "direction",
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
    case "minggulong":
    case "abu": {
      const startingLevel = amount("CurrentLevel");
      const count = amount("LevelEventCount");
      const level = key === "minggulong" ? startingLevel - 10 * count : Math.min(99, startingLevel + 2 * count);
      result.startingLevel = startingLevel;
      result.currentLevel = level;
      result.summary = key === "minggulong"
        ? "等级 " + startingLevel + " − 10×" + count + " 回合 = " + level
        : "等级 " + startingLevel + " + 2×" + count + " 次 = " + level + "（上限99）";
      result.note = key === "abu"
        ? "次数由玩家确认符合3能耗条件，不推定基础或实际能耗口径；默认60级为试算输入，不是初始等级证据。"
        : "默认起始99为常规60级+初始等级39的试算值；按已结束回合数减10级，不推定下降下限。";
      if (level < 1) block("当前计数推得等级" + level + "，等级下降下限尚未公开，不能猜测截断值");
      if (level >= 1 && level < 80) {
        result.summary += "；承伤 +40%";
        result.effects.push({ kind: "incoming-damage-percent", amount: 40 });
      }
      break;
    }
    case "gold-vein-dragon":
    case "little-scissor": {
      const bonus = enabled("AttackBuffActive") ? amount("CurrentAttackBonus") : 0;
      result.summary = bonus ? "当前已生效双攻 +" + bonus + "%" : "双攻增益未生效";
      result.note = "直接填写当前生效总增益，不按触发次数推定叠法、持续时间或上限。";
      if (bonus) result.effects.push({ kind: "attack-percent", amount: bonus });
      break;
    }
    case "underground-silver-dragon": {
      const bonus = amount("CurrentMagicalAttackBonus");
      result.summary = "当前累计已生效魔攻 +" + bonus + "%";
      result.note = "填写已生效总值，不由能量消耗次数推算累计叠法或上限；当次可生效。";
      if (bonus) result.effects.push({ kind: "magical-attack-percent", amount: bonus });
      break;
    }
    case "lele-shark":
      result.summary = enabled("NegativeCleared") ? "本局已触发一次：永久双攻 +50%" : "尚未确认清除自身减益，无双攻增益";
      if (enabled("NegativeCleared")) result.effects.push({ kind: "attack-percent", amount: 50, oncePerBattle: true, duration: "permanent" });
      break;
    case "egg-wrap": {
      const active = enabled("TeamMoenhua") && enabled("EntryDefenseActive");
      result.summary = active ? "入场条件已确认，当前双防 +50%" : "入场双防增益未生效";
      result.note = "只按当前明确生效状态结算，不默认永久，也不自动叠加入场次数。";
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
      result.summary = enabled("SnowActive") && enabled("FreezeApplicationConfirmed") ? "本次符合条件的敌方新增冻结改为3层星陨" : "尚无已确认的雪天冻结转换";
      result.note = "只转换本次实际新增且符合条件的冻结；已有冻结不变，不推断其它来源。";
      if (enabled("SnowActive") && enabled("FreezeApplicationConfirmed")) result.effects.push({
        kind: "status-replace", target: "opponent", from: "freeze", to: "starfall",
        stacks: 3, timing: "current-skill", confirmedSource: "manual-eligible-freeze-application",
      });
      break;
    case "doulie":
      result.summary = enabled("SnowTriggered") ? "本局雪天已触发；当前剩余 " + amount("SnowTurnsRemaining") + " 回合" : "本局雪天未确认触发";
      result.note = "按手动确认状态展示，不推定10层冻结的累计口径或触发当回合扣减。";
      if (enabled("SnowTriggered")) result.effects.push({ kind: "weather-state", weather: "snow", remainingTurns: amount("SnowTurnsRemaining"), oncePerBattle: true });
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
    case "diliutun":
      result.summary = enabled("DiceRolled") ? "本次实际骰点 " + amount("DiceFace") + "；点数效果尚未公开" : "尚未确认掷骰，无骰子增减益";
      if (enabled("DiceRolled")) block("骰子点数与双方增减益映射尚未公开，不能生成本次实数增减益");
      break;
    case "crab-coconut":
      result.summary = enabled("GrassDiscountReady") ? "水系技能后：下一草系技能能耗 -3（待生效）" : "无已确认的下一草系减费";
      result.note = "仅展示待生效减费，不推定最低能耗、连续水技能叠加或非草技能是否保留，不改本次最终能耗。";
      if (enabled("GrassDiscountReady")) result.effects.push({ kind: "next-grass-cost-discount", amount: 3, currentPending: true });
      break;
    case "lily-of-valley":
      result.summary = enabled("DreamActive") && enabled("TurnEndConfirmed") ? "本次梦境回合结束：对手寄生 +3层" : "未确认梦境回合结束，不追加寄生";
      result.note = "回合末效果独立结算，不自动模拟后续回合。";
      if (enabled("DreamActive") && enabled("TurnEndConfirmed")) result.effects.push({ kind: "status-add", target: "opponent", status: "parasitism", stacks: 3, timing: "turn-end", confirmedSource: "manual-confirmed-dream-turn-end" });
      break;
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
  const evaluation = getS5PreviewTraitEvaluation(trait, role, input.context, { skill: input.skill });
  if (!evaluation) return null;
  const result = neutral();
  if (evaluation.blockingReason) return result;
  for (const entry of evaluation.effects) {
    if (entry.kind === "attack-percent" && role === "attacker" ||
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
      before: factor === null ? 0 : 1, after: factor ?? flatSpeed,
      source: "manual-s5-preview-state",
    };
  }
  return result;
}
