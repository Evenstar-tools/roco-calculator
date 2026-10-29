// Isolated event contracts follow the reviewed source; the live UI owns timing.
// Technical keys are identifiers only; they do not provide translated names.
export const S5_PREVIEW_MECHANICS = Object.freeze({
  minggulong: { name: "冥古龙", events: ["battle-start", "turn-end"], unknowns: ["等级降低的下限未公开", "非60级能力值采用初版外推模型，待游戏面板校对"] },
  abu: { name: "阿布", events: ["skill-used"], unknowns: ["3能耗的基础/实际能耗口径待核验", "开局等级须由已核验状态提供", "非60级能力值采用初版外推模型，待游戏面板校对"] },
  "boss-abu": { name: "圣龙阿布", events: ["skill-used"], unknowns: ["阿布家族当前等级须手动确认", "非60级能力值采用初版外推模型，待游戏面板校对"] },
  "super-abu": { name: "超能阿布", events: ["skill-used"], unknowns: ["阿布家族当前等级须手动确认", "非60级能力值采用初版外推模型，待游戏面板校对"] },
  "underground-silver-dragon": { name: "地绡银龙", events: ["energy-spent"], unknowns: ["魔攻增益叠法与上限未公开"] },
  "gold-vein-dragon": { name: "龙嵴金脉", events: ["charge-complete"], unknowns: ["攻击增益持续时间及离场保留未公开"] },
  "boss-ice-bruce": { name: "首领冰钻布鲁斯", events: ["opponent-total-cost"], unknowns: ["对手总能耗的统计口径待核验", "威力增益叠法与上限待核验"] },
  "boss-glass-jellyfish": { name: "首领琉璃水母", events: ["skill-used"], unknowns: ["中毒印记的所属方与取值口径待核验"] },
  jingyu: { name: "鲸羽", events: ["turn-end"], unknowns: ["主界面尚未接入暴风雪回合末星陨动作"] },
  doulie: { name: "豆粒鹅", events: ["opponent-freeze-gained"], unknowns: ["10层冻结是当前层数还是累计量待核验", "雪天首回合扣减的结算时点未公开"] },
  "watermelon-bug": { name: "西瓜虫", events: ["skill-used"], unknowns: ["草系技能随机奉献的目标与分配须由实际随机结果提供"] },
  diliutun: { name: "滴溜豚", events: ["dice-rolled"], unknowns: ["各点数对应的双方增减益未公开"] },
  "lele-shark": { name: "乐乐鲨", events: ["self-negative-cleared"], unknowns: [] },
  "egg-wrap": { name: "蛋包蛋", events: ["team-state"], unknowns: [] },
  "crab-coconut": { name: "蟹蟹椰", events: ["skill-used"], unknowns: [] },
  "little-scissor": { name: "小剪影", events: ["opponent-exit"], unknowns: [] },
  "lily-of-valley": { name: "铃兰", events: ["turn-end"], unknowns: [] },
});

const whole = (value) => Number.isSafeInteger(value) && value >= 0;
const finite = (value) => typeof value === "number" && Number.isFinite(value);
const identifiedBasis = (value) => typeof value === "string" && value.trim().length > 0;
const effect = (kind, fields = {}) => ({ kind, ...fields });
const CORE_LEVEL_GAP = "隔离事件适配器不生成等级面板，等级由主界面当前特性状态统一投影";

export function createS5PreviewState(confirmed = {}) {
  return {
    seenEventIds: [], level: null, maxLevel: null,
    observedFreezeStacks: null, freezeThresholdBasis: null, snowTriggered: false, nextGrassDiscount: false,
    permanentAttackTriggered: false, entryDefenseTriggered: false,
    ...confirmed,
    seenEventIds: [...(confirmed.seenEventIds ?? [])],
  };
}

function completed(previous, event, changes = {}, effects = [], unknowns = [], status = "applied") {
  const state = {
    ...previous, ...changes,
    seenEventIds: status === "blocked"
      ? [...previous.seenEventIds]
      : [...previous.seenEventIds, event.id],
  };
  return { status, state, effects, unknowns, calculationEnabled: false };
}
function blocked(state, event, message, effects = []) {
  return completed(state, event, {}, effects, [message], "blocked");
}
function ignored(state, event) {
  return completed(state, event, {}, [], [], "ignored");
}
function levelEffects(level) {
  return level < 80 ? [effect("incoming-damage-percent", { amount: 40, condition: "level-below-80" })] : [];
}

/**
 * Each event is a caller-confirmed eligible fact, with its source, target and
 * timing already checked by the caller. E.g. opponent-freeze-application is
 * an eligible application, not a request to infer which freeze sources count.
 * A stable event id is mandatory. Additional basis confirmations below must
 * identify an externally verified interpretation; this module cannot verify it.
 * The reducer deliberately does not schedule turns, guess random outcomes,
 * infer unannounced stacking, or pass candidate rules to the live calculator.
 */
export function reduceS5Preview(mechanicKey, previous, event, confirmed = {}) {
  const state = createS5PreviewState(previous);
  if (!S5_PREVIEW_MECHANICS[mechanicKey]) return blocked(state, event ?? {}, "没有该候选机制的已核验事件合同");
  if (!event || typeof event.id !== "string" || !event.id.trim()) return blocked(state, event ?? {}, "事件缺少稳定id，无法防止重复结算");
  if (state.seenEventIds.includes(event.id)) return { status: "duplicate", state, effects: [], unknowns: [], calculationEnabled: false };
  switch (mechanicKey) {
    case "minggulong": {
      if (event.type === "battle-start") {
        return completed(state, event, { level: 99, maxLevel: 99 }, [effect("level-set", { level: 99, maxLevel: 99 })], [CORE_LEVEL_GAP]);
      }
      if (event.type !== "turn-end") return ignored(state, event);
      if (!whole(state.level) || state.level < 1) return blocked(state, event, "回合结束前的等级尚未确认");
      const next = state.level - 10;
      if (next < 1) return blocked(state, event, "等级降低的下限未公开，不继续推定等级");
      return completed(state, event, { level: next }, [effect("level-set", { level: next, maxLevel: 99 }), ...levelEffects(next)], [CORE_LEVEL_GAP]);
    }
    case "abu":
    case "boss-abu":
    case "super-abu": {
      if (event.type !== "skill-used") return ignored(state, event);
      if (!identifiedBasis(confirmed.costBasis)) return blocked(state, event, "3能耗的取值口径尚未核验，不默认采用基础或实际能耗");
      if (!whole(event.cost)) return blocked(state, event, "已核验口径下的本次技能能耗尚未确认");
      if (!whole(state.level) || state.level < 1 || state.level > 99) return blocked(state, event, "阿布当前等级尚未确认，不补默认等级");
      const next = event.cost === 3 ? Math.min(99, state.level + 2) : state.level;
      return completed(state, event, { level: next, maxLevel: 99 }, [
        ...(next !== state.level ? [effect("level-set", { level: next, maxLevel: 99 })] : []),
        ...levelEffects(next),
      ], [CORE_LEVEL_GAP]);
    }
    case "underground-silver-dragon": {
      if (event.type !== "energy-spent") return ignored(state, event);
      if (!whole(event.amount)) return blocked(state, event, "本次实际消耗能量须为非负整数");
      if (event.amount === 0) return ignored(state, event);
      const fact = effect("per-energy-magic-attack", { perEnergyPercent: 10, energyUnits: event.amount, appliesToCurrentSkill: false, timing: "turn-end" });
      // An observed aggregate bonus may be supplied by a future verified rule
      // adapter; the count itself cannot establish additive/multiplicative math.
      if (!finite(confirmed.currentMagicalAttackBonusPercent) || confirmed.currentMagicalAttackBonusPercent < 0) {
        return blocked(state, event, "每点能量在回合结束时魔攻+10%已确认；当前已生效总增益须独立确认", [fact]);
      }
      return completed(state, event, {}, [fact, effect("confirmed-stat-percent", {
        stat: "magicalAttack", amount: confirmed.currentMagicalAttackBonusPercent,
        evidence: "caller-confirmed-current-state",
      })]);
    }
    case "gold-vein-dragon": {
      if (event.type !== "charge-complete") return ignored(state, event);
      const count = state.chargeCount ?? 0;
      if (!whole(count)) return blocked(state, event, "聚能次数须为非负整数");
      return completed(state, event, { chargeCount: count + 1 }, [
        effect("pending-stat-stage-add", { stat: "physicalAttack", amount: 5, timing: "turn-end" }),
      ]);
    }
    case "little-scissor": {
      if (event.type !== "opponent-exit") return ignored(state, event);
      const count = state.opponentExitCount ?? 0;
      if (!whole(count)) return blocked(state, event, "敌方离场次数须为非负整数");
      return completed(state, event, { opponentExitCount: count + 1 }, [effect("skill-power-flat", { amount: 20 })]);
    }
    case "boss-ice-bruce": {
      if (event.type !== "opponent-total-cost") return ignored(state, event);
      if (!identifiedBasis(confirmed.costBasis)) return blocked(state, event, "对手总能耗统计口径尚未核验，不默认采用携带技能或已消耗能量");
      if (!whole(event.totalCost)) return blocked(state, event, "已核验口径下的对手总能耗尚未确认");
      const knownPower = finite(confirmed.currentPowerBonusPercent) && confirmed.currentPowerBonusPercent >= 0;
      return completed(state, event, {}, [
        effect("per-opponent-cost-power", { perCostPercent: 10, opponentTotalCost: event.totalCost, costBasis: confirmed.costBasis }),
        ...(knownPower ? [effect("skill-power-percent", { amount: confirmed.currentPowerBonusPercent, evidence: "caller-confirmed-current-state" })] : []),
        ...(event.totalCost >= 20 ? [effect("speed-flat", { amount: 50 })] : []),
      ], knownPower ? [] : ["每点能耗威力+10%为观察事实；累计叠法与上限待核验，不生成累计威力倍率"]);
    }
    case "boss-glass-jellyfish": {
      if (event.type !== "skill-used") return ignored(state, event);
      if (!identifiedBasis(confirmed.markBasis)) return blocked(state, event, "中毒印记所属方与取值口径尚未核验");
      if (!whole(event.poisonMarkStacks)) return blocked(state, event, "已核验口径下的中毒印记层数尚未确认，不能用中毒状态层数代替");
      const stacks = event.poisonMarkStacks * 2;
      return completed(state, event, {}, stacks ? [effect("status-add", { target: "opponent", status: "poison", stacks, timing: "after-skill" })] : []);
    }
    case "jingyu": {
      if (event.type !== "turn-end") return ignored(state, event);
      if (event.weather === undefined || typeof event.holderOnField !== "boolean") return blocked(state, event, "回合结束时的天气与特性持有者在场状态须确认");
      if (!["snow", "blizzard"].includes(event.weather) || !event.holderOnField) return ignored(state, event);
      return completed(state, event, {}, [effect("mark-add", {
        target: "opponent", mark: "starfall", stacks: 3, timing: "turn-end", replacesWeatherFreeze: true,
      })]);
    }
    case "doulie": {
      if (event.type !== "opponent-freeze-gained") return ignored(state, event);
      if (!["current", "cumulative"].includes(confirmed.thresholdBasis)) return blocked(state, event, "10层冻结的当前/累计口径尚未核验，不自行累计历史事件");
      if (!whole(event.observedStacks)) return blocked(state, event, "须提供已核验口径下实际观察到的冻结层数");
      const observation = { observedFreezeStacks: event.observedStacks, freezeThresholdBasis: confirmed.thresholdBasis };
      if (state.snowTriggered || event.observedStacks < 10) return completed(state, event, observation, []);
      return completed(state, event, { ...observation, snowTriggered: true }, [
        effect("weather-start", { weather: "snow", turns: 5, oncePerBattle: true }),
      ], ["只建立5回合雪天，不猜测触发当回合的扣减时点"]);
    }
    case "watermelon-bug": {
      if (event.type !== "skill-used") return ignored(state, event);
      if (typeof event.skillType !== "string" || !event.skillType) return blocked(state, event, "本次技能系别尚未确认");
      if (event.skillType === "bug") return completed(state, event, {}, [effect("status-add", { target: "opponent", status: "parasite", stacks: 1 })]);
      if (event.skillType !== "grass") return ignored(state, event);
      return blocked(state, event, "草系技能随机奉献1层的实际随机结果尚未提供", [
        effect("random-donation-pending", { stacks: 1 }),
      ]);
    }
    case "diliutun":
      if (event.type !== "dice-rolled") return ignored(state, event);
      if (!Number.isInteger(event.face) || event.face < 1 || event.face > 20) return blocked(state, event, "骰子须提供真实1至20点结果");
      return blocked(state, event, "20面骰子点数与双方增减益的映射未公开，不能生成默认结果");
    case "lele-shark": {
      if (event.type !== "self-negative-cleared") return ignored(state, event);
      if (!whole(event.count)) return blocked(state, event, "实际清除的自身减益数量尚未确认");
      if (event.count === 0 || state.permanentAttackTriggered) return ignored(state, event);
      return completed(state, event, { permanentAttackTriggered: true }, [
        effect("physical-attack-percent", { amount: 50, oncePerBattle: true, duration: "permanent" }),
      ]);
    }
    case "egg-wrap": {
      if (event.type !== "team-state") return ignored(state, event);
      if (typeof event.teamHasMoenhuaSpirit !== "boolean") return blocked(state, event, "队伍中是否存在萌化精灵尚未确认");
      if (!event.teamHasMoenhuaSpirit) return ignored(state, event);
      return completed(state, event, {}, [
        effect("defense-percent", { stats: ["physicalDefense", "magicalDefense"], amount: 50 }),
      ]);
    }
    case "crab-coconut": {
      if (event.type !== "skill-used") return ignored(state, event);
      if (typeof event.skillType !== "string" || !event.skillType) return blocked(state, event, "本次技能系别尚未确认");
      if (event.skillType === "water") return completed(state, event, { nextGrassDiscount: true }, [
        effect("next-grass-cost-discount-armed", { amount: 3 }),
      ]);
      if (event.skillType !== "grass" && state.nextGrassDiscount) return completed(state, event, { nextGrassDiscount: false });
      if (!state.nextGrassDiscount) return ignored(state, event);
      // One action consumes the allowance; the live calculator owns the cost floor.
      return completed(state, event, { nextGrassDiscount: false }, [
        effect("skill-cost-discount", { amount: 3, appliesToCurrentSkill: true }),
      ]);
    }
    case "lily-of-valley":
      if (event.type !== "turn-end") return ignored(state, event);
      if (event.weather === undefined) return blocked(state, event, "回合结束时的天气尚未确认");
      if (event.weather !== "dream") return ignored(state, event);
      return completed(state, event, {}, [effect("status-add", {
        target: "opponent", status: "parasite", stacks: 3, timing: "turn-end",
      })]);
    default:
      return blocked(state, event, "没有该候选机制的事件实现");
  }
}

/**
 * Small, inspectable adapter for a single confirmed evaluation. It never merges
 * buffs with other rules or activates the candidate in the shared calculator.
 */
export function adaptS5PreviewEffects(result) {
  if (result.status === "blocked") return { status: "blocked", modifiers: [], effects: result.effects, unknowns: result.unknowns, calculationEnabled: false };
  const modifiers = [];
  for (const entry of result.effects ?? []) {
    if (entry.kind === "skill-power-percent") modifiers.push({ direction: "outgoing", field: "powerPercentAdd", value: entry.amount });
    if (entry.kind === "skill-power-flat") modifiers.push({ direction: "outgoing", field: "fixedPowerAdd", value: entry.amount });
    if (entry.kind === "attack-stage-add") modifiers.push({ target: "self", field: "attackLevelBonus", value: entry.amount });
    if (entry.kind === "speed-flat") modifiers.push({ target: "self", field: "attackerSpeedFlatBonus", value: entry.amount });
    if (entry.kind === "incoming-damage-percent") modifiers.push({ direction: "incoming", field: "finalDamageMultiplier", value: 1 + entry.amount / 100 });
    if (entry.kind === "attack-percent" || entry.kind === "physical-attack-percent" || entry.kind === "defense-percent" || entry.kind === "confirmed-stat-percent") {
      modifiers.push({ target: "self", field: "confirmedStatPercentAdd", stats: entry.stats ?? [entry.stat ?? (entry.kind === "physical-attack-percent" ? "physicalAttack" : "attack")], value: entry.amount });
    }
  }
  const hasLevel = (result.effects ?? []).some(({ kind }) => kind === "level-set");
  const unresolvedDuration = (result.effects ?? []).some((entry) => entry.kind === "defense-percent" && entry.duration === "unknown");
  const adapterBlocked = hasLevel || unresolvedDuration;
  return {
    status: adapterBlocked ? "blocked" : result.status,
    // This isolated event adapter does not build panel stats. The live Web
    // calculator applies level and incoming amplification together upstream.
    modifiers: adapterBlocked ? [] : modifiers, effects: result.effects, calculationEnabled: false,
    unknowns: [...(result.unknowns ?? []), ...(hasLevel ? [CORE_LEVEL_GAP] : [])],
  };
}

/** Reverse the speed tiebreaker only; never exchange speed capabilities. */
export function evaluateS5DreamActionOrder({
  weather, selfSpeed, opponentSpeed, selfPriority, opponentPriority,
  atConfirmedEvaluation = false,
}) {
  const original = { selfSpeed, opponentSpeed, selfPriority, opponentPriority };
  if (weather !== "dream") return { status: "unchanged", ...original, calculationEnabled: false };
  if (!atConfirmedEvaluation || ![selfPriority, opponentPriority].every(finite)) return {
    status: "blocked", ...original, calculationEnabled: false,
    unknowns: ["本次行动的双方先制度须明确确认"],
  };
  if (![selfSpeed, opponentSpeed].every((value) => finite(value) && value >= 0)) return {
    status: "blocked", ...original, calculationEnabled: false, unknowns: ["双方当前速度尚未确认"],
  };
  const difference = selfPriority !== opponentPriority
    ? selfPriority - opponentPriority : opponentSpeed - selfSpeed;
  return {
    status: "applied", ...original,
    first: difference > 0 ? "self" : difference < 0 ? "opponent" : "tie",
    calculationEnabled: false,
  };
}
