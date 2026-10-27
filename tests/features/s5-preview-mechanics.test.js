import { describe, expect, test } from "vitest";
import {
  S5_PREVIEW_MECHANICS, createS5PreviewState, reduceS5Preview,
  adaptS5PreviewEffects, evaluateS5DreamSpeedExchange,
} from "../../src/features/s5-preview/mechanics.js";

const event = (type, values = {}, id = "event-1") => ({ id, type, ...values });
const run = (key, type, values = {}, state, confirmed) => reduceS5Preview(key, state, event(type, values), confirmed);

describe("S5视频机制候选合同", () => {
  test("未核验成本口径保持阻断，比较对象不进入S5候选", () => {
    expect(S5_PREVIEW_MECHANICS["lily-of-valley"].name).toBe("铃兰");
    expect(S5_PREVIEW_MECHANICS["boss-abu"].name).toBe("圣龙阿布");
    expect(run("boss-abu", "skill-used", { cost: 3 }).status).toBe("blocked");
    expect(S5_PREVIEW_MECHANICS).not.toHaveProperty("boss-thousand-spikes");
    const compared = run("boss-thousand-spikes", "skill-used");
    expect(compared.status).toBe("blocked");
    expect(compared.effects).toEqual([]);
    expect(compared.calculationEnabled).toBe(false);
  });

  test("阿布三形态共用已核验升级机制，不套历史版本规则", () => {
    expect(S5_PREVIEW_MECHANICS["super-abu"]).toMatchObject({ name: "超能阿布", events: ["skill-used"] });
    for (const key of ["abu", "boss-abu", "super-abu"]) {
      const initial = createS5PreviewState({ level: 77 });
      const result = run(key, "skill-used", { cost: 3 }, initial, { costBasis: "reviewed-eligible-cost" });
      expect(result.state.level).toBe(79);
      expect(result.effects).toContainEqual({ kind: "incoming-damage-percent", amount: 40, condition: "level-below-80" });
      expect(result.calculationEnabled).toBe(false);
      expect(adaptS5PreviewEffects(result).modifiers).toEqual([]);
      expect(initial.level).toBe(77);
    }
  });

  test("冥古龙99开局，回合结束-10，79触发承伤，隔离适配器不单独输出等级面板", () => {
    const start = run("minggulong", "battle-start");
    expect(start.state).toMatchObject({ level: 99, maxLevel: 99 });
    const first = reduceS5Preview("minggulong", start.state, event("turn-end", {}, "end-1"));
    const second = reduceS5Preview("minggulong", first.state, event("turn-end", {}, "end-2"));
    expect(first.state.level).toBe(89);
    expect(first.effects.some(({ kind }) => kind === "incoming-damage-percent")).toBe(false);
    expect(second.state.level).toBe(79);
    expect(second.effects).toContainEqual({ kind: "incoming-damage-percent", amount: 40, condition: "level-below-80" });
    const adapted = adaptS5PreviewEffects(second);
    expect(adapted.status).toBe("blocked");
    expect(adapted.calculationEnabled).toBe(false);
    expect(adapted.unknowns.join("；")).toContain("等级由主界面");
    expect(adapted.modifiers).toEqual([]);
  });

  test.each([[90, 80, false], [89, 79, true]])("等级 %s 到 %s 的80阈值严格使用低于", (initial, next, amplified) => {
    const result = run("minggulong", "turn-end", {}, createS5PreviewState({ level: initial }));
    expect(result.state.level).toBe(next);
    expect(result.effects.some(({ kind }) => kind === "incoming-damage-percent")).toBe(amplified);
  });

  test("不猜等级下降下限或阿布开局等级；3能耗升2级，上限99", () => {
    const verifiedCost = { costBasis: "caller-reviewed-basis" };
    expect(run("minggulong", "turn-end", {}, createS5PreviewState({ level: 9 })).status).toBe("blocked");
    expect(run("abu", "skill-used", { cost: 3 }).status).toBe("blocked");
    expect(run("abu", "skill-used", { cost: 3 }, createS5PreviewState({ level: 98 })).status).toBe("blocked");
    expect(run("abu", "skill-used", { cost: 3 }, createS5PreviewState({ level: 98 }), verifiedCost).state.level).toBe(99);
    expect(run("abu", "skill-used", { cost: 3 }, createS5PreviewState({ level: 77 }), verifiedCost).effects).toContainEqual({
      kind: "incoming-damage-percent", amount: 40, condition: "level-below-80",
    });
    expect(run("abu", "skill-used", { cost: 3 }, createS5PreviewState({ level: 78 }), verifiedCost).effects.some(({ kind }) => kind === "incoming-damage-percent")).toBe(false);
    expect(run("abu", "skill-used", { cost: 2 }, createS5PreviewState({ level: 70 }), verifiedCost).state.level).toBe(70);
  });

  test("地绡银龙保留当次可生效事实，累计叠法未公开时不按次数推算", () => {
    const unknown = run("underground-silver-dragon", "energy-spent", { amount: 3 });
    expect(unknown.status).toBe("blocked");
    expect(unknown.effects).toEqual([{ kind: "per-energy-magic-attack", perEnergyPercent: 10, energyUnits: 3, appliesToCurrentSkill: true }]);
    expect(adaptS5PreviewEffects(unknown).modifiers).toEqual([]);
    const confirmed = run("underground-silver-dragon", "energy-spent", { amount: 3 }, undefined, { currentMagicalAttackBonusPercent: 33.1 });
    expect(confirmed.effects).toContainEqual({ kind: "confirmed-stat-percent", stat: "magicalAttack", amount: 33.1, evidence: "caller-confirmed-current-state" });
    expect(confirmed.calculationEnabled).toBe(false);
  });

  test.each([["gold-vein-dragon", "charge-complete"], ["little-scissor", "opponent-switch"]])("%s不猜50%攻击增益的持续或叠法", (key, type) => {
    const result = run(key, type);
    expect(result.status).toBe("blocked");
    expect(result.effects).toEqual([{ kind: "attack-gain-observed", amount: 50, trigger: type }]);
    expect(adaptS5PreviewEffects(result).modifiers).toEqual([]);
  });

  test.each([[19, false], [20, true], [25, true]])("首领布鲁斯已核验口径总能耗%s时仅求固定速度门槛，不猜累计威力", (totalCost, speed) => {
    const result = run("boss-ice-bruce", "opponent-total-cost", { totalCost }, undefined, { costBasis: "reviewed-total" });
    expect(result.effects).toContainEqual({ kind: "per-opponent-cost-power", perCostPercent: 10, opponentTotalCost: totalCost, costBasis: "reviewed-total" });
    expect(result.effects.filter(({ kind }) => kind === "speed-flat")).toEqual(speed ? [{ kind: "speed-flat", amount: 50 }] : []);
    expect(adaptS5PreviewEffects(result).modifiers.some(({ field }) => field === "powerPercentAdd")).toBe(false);
  });

  test("首领布鲁斯总能耗口径缺失则阻断，只有另行核验的当前威力总增益才可传递", () => {
    expect(run("boss-ice-bruce", "opponent-total-cost", { totalCost: 20 }).status).toBe("blocked");
    expect(run("boss-ice-bruce", "opponent-loadout", { totalCost: 20 }).effects).toEqual([]);
    const result = run("boss-ice-bruce", "opponent-total-cost", { totalCost: 20 }, undefined, {
      costBasis: "reviewed-total", currentPowerBonusPercent: 65,
    });
    expect(adaptS5PreviewEffects(result).modifiers).toContainEqual({ direction: "outgoing", field: "powerPercentAdd", value: 65 });
  });

  test("首领水母不猜印记所属方；口径核验后才取中毒印记x2给敌", () => {
    const markBasis = { markBasis: "reviewed-mark-owner" };
    expect(run("boss-glass-jellyfish", "skill-used", { poisonMarkStacks: 3 }).status).toBe("blocked");
    expect(run("boss-glass-jellyfish", "skill-used", { poisonMarkStacks: 3 }, undefined, markBasis).effects).toEqual([
      { kind: "status-add", target: "opponent", status: "poison", stacks: 6, timing: "after-skill" },
    ]);
    expect(run("boss-glass-jellyfish", "skill-used", { poisonMarkStacks: 0 }, undefined, markBasis).effects).toEqual([]);
    expect(run("boss-glass-jellyfish", "skill-used", { targetPoisonMarkStacks: 3 }, undefined, markBasis).status).toBe("blocked");
  });

  test("鲸羽雪天将一笔敌方冻结替换为固定3星陨，不乘原冻结量", () => {
    expect(run("jingyu", "opponent-freeze-application", { weather: "snow", stacks: 8 }).effects).toEqual([
      { kind: "status-replace", target: "opponent", from: "freeze", to: "starfall", stacks: 3 },
    ]);
    expect(run("jingyu", "opponent-freeze-application", { weather: "rain", stacks: 8 }).effects).toEqual([]);
  });

  test.each(["current", "cumulative"])("豆粒鹅只用经核验%s口径的实际观察值判10层，不自行累加", (thresholdBasis) => {
    const confirmed = { thresholdBasis };
    const first = run("doulie", "opponent-freeze-gained", { observedStacks: 6 }, undefined, confirmed);
    const second = reduceS5Preview("doulie", first.state, event("opponent-freeze-gained", { observedStacks: 4 }, "freeze-2"), confirmed);
    expect(first.effects).toEqual([]);
    expect(second.effects).toEqual([]);
    expect(second.state.observedFreezeStacks).toBe(4);
    const triggerEvent = event("opponent-freeze-gained", { observedStacks: 10 }, "freeze-3");
    const triggered = reduceS5Preview("doulie", second.state, triggerEvent, confirmed);
    expect(triggered.effects).toEqual([{ kind: "weather-start", weather: "snow", turns: 5, oncePerBattle: true }]);
    const duplicate = reduceS5Preview("doulie", triggered.state, triggerEvent, confirmed);
    expect(duplicate.status).toBe("duplicate");
    expect(duplicate.state.observedFreezeStacks).toBe(10);
    expect(duplicate.effects).toEqual([]);
    const later = reduceS5Preview("doulie", triggered.state, event("opponent-freeze-gained", { observedStacks: 20 }, "freeze-4"), confirmed);
    expect(later.effects).toEqual([]);
    expect(later.state.snowTriggered).toBe(true);
  });

  test("豆粒鹅未核验当前/累计口径时不会由两笔冻结量擅自触发雪天", () => {
    const first = run("doulie", "opponent-freeze-gained", { stacks: 6 });
    const second = reduceS5Preview("doulie", first.state, event("opponent-freeze-gained", { stacks: 4 }, "freeze-2"));
    expect(first.status).toBe("blocked");
    expect(second.status).toBe("blocked");
    expect(second.state.snowTriggered).toBe(false);
    expect(run("doulie", "opponent-freeze-gained", { observedStacks: 10 }).status).toBe("blocked");
  });

  test("西瓜虫虫技寄生1，草技未给随机结果则阻断，不替玩家抽签", () => {
    expect(run("watermelon-bug", "skill-used", { skillType: "bug" }).effects).toEqual([
      { kind: "status-add", target: "opponent", status: "parasite", stacks: 1 },
    ]);
    expect(run("watermelon-bug", "skill-used", { skillType: "grass" }).status).toBe("blocked");
    expect(run("watermelon-bug", "skill-used", { skillType: "water" }).status).toBe("ignored");
    expect(run("watermelon-bug", "skill-used").status).toBe("blocked");
  });

  test.each([1, 10, 20])("骰子%s点真实存在，但映射缺失就不生成双方增减益", (face) => {
    const result = run("diliutun", "dice-rolled", { face });
    expect(result.status).toBe("blocked");
    expect(result.effects).toEqual([]);
    expect(result.unknowns.join("；")).toContain("映射未公开");
  });

  test("乐乐鲨只有实际清除自身减益后永久攻击+50%，同局不再触发", () => {
    expect(run("lele-shark", "self-negative-cleared", { count: 0 }).effects).toEqual([]);
    const once = run("lele-shark", "self-negative-cleared", { count: 2 });
    expect(once.effects).toEqual([{ kind: "attack-percent", amount: 50, duration: "permanent", oncePerBattle: true }]);
    expect(reduceS5Preview("lele-shark", once.state, event("self-negative-cleared", { count: 3 }, "clear-2")).effects).toEqual([]);
    expect(createS5PreviewState().permanentAttackTriggered).toBe(false);
  });

  test("蛋包蛋入场明确己方有萌化精灵才增双防；重复入场累计留待核验", () => {
    expect(run("egg-wrap", "entry").status).toBe("blocked");
    expect(run("egg-wrap", "entry", { teamHasMoenhuaSpirit: false }).effects).toEqual([]);
    const first = run("egg-wrap", "entry", { teamHasMoenhuaSpirit: true });
    expect(first.effects).toEqual([{ kind: "defense-percent", stats: ["physicalDefense", "magicalDefense"], amount: 50, duration: "unknown" }]);
    expect(first.unknowns.join("；")).toContain("持续时间");
    expect(adaptS5PreviewEffects(first)).toMatchObject({ status: "blocked", modifiers: [] });
    expect(reduceS5Preview("egg-wrap", first.state, event("entry", { teamHasMoenhuaSpirit: true }, "entry-2")).status).toBe("blocked");
  });

  test("蟹蟹椰水后下一次草减3，非草是否保留须核验，一次草技后清除", () => {
    const armed = run("crab-coconut", "skill-used", { skillType: "water" });
    const repeatedWater = reduceS5Preview("crab-coconut", armed.state, event("skill-used", { skillType: "water" }, "water-2"));
    expect(repeatedWater.status).toBe("blocked");
    const otherEvent = event("skill-used", { skillType: "fire" }, "other");
    const unknownOther = reduceS5Preview("crab-coconut", armed.state, otherEvent);
    expect(unknownOther.status).toBe("blocked");
    expect(unknownOther.effects).toEqual([]);
    const other = reduceS5Preview("crab-coconut", armed.state, otherEvent, { nonGrassPreservesDiscount: true });
    expect(other.state.nextGrassDiscount).toBe(true);
    const grassEvent = event("skill-used", { skillType: "grass" }, "grass");
    const grass = reduceS5Preview("crab-coconut", other.state, grassEvent);
    expect(grass.effects).toEqual([{ kind: "skill-cost-discount", amount: 3, appliesToCurrentSkill: true }]);
    expect(grass.state.nextGrassDiscount).toBe(false);
    expect(reduceS5Preview("crab-coconut", grass.state, grassEvent).effects).toEqual([]);
    expect(reduceS5Preview("crab-coconut", grass.state, event("skill-used", { skillType: "grass" }, "grass-2")).effects).toEqual([]);
    expect(reduceS5Preview("crab-coconut", armed.state, otherEvent, { nonGrassPreservesDiscount: false }).state.nextGrassDiscount).toBe(false);
  });

  test("铃兰梦境回合结束给敌3层寄生，同一回合事件幂等", () => {
    const end = event("turn-end", { weather: "dream" });
    const result = reduceS5Preview("lily-of-valley", undefined, end);
    expect(result.effects).toEqual([{ kind: "status-add", target: "opponent", status: "parasite", stacks: 3, timing: "turn-end" }]);
    expect(reduceS5Preview("lily-of-valley", result.state, end).status).toBe("duplicate");
    expect(run("lily-of-valley", "turn-end", { weather: "snow" }).effects).toEqual([]);
  });

  test("梦境只在明确本次结算点时交换速度，技能先制度原值保留", () => {
    const input = { weather: "dream", selfSpeed: 120, opponentSpeed: 80, selfPriority: 1, opponentPriority: 3 };
    expect(evaluateS5DreamSpeedExchange(input).status).toBe("blocked");
    expect(evaluateS5DreamSpeedExchange({ ...input, atConfirmedEvaluation: true })).toEqual({
      status: "applied", selfSpeed: 80, opponentSpeed: 120,
      selfPriority: 1, opponentPriority: 3, calculationEnabled: false,
    });
    expect(evaluateS5DreamSpeedExchange({ ...input, weather: "rain" }).status).toBe("unchanged");
  });

  test("无id事件拒绝处理；已应用事件不重复触发；输入状态与事件保持原样", () => {
    const state = createS5PreviewState();
    const action = event("self-negative-cleared", { count: 1 });
    const original = structuredClone({ state, action });
    const result = reduceS5Preview("lele-shark", state, action);
    expect({ state, action }).toEqual(original);
    expect(reduceS5Preview("lele-shark", result.state, action).status).toBe("duplicate");
    expect(reduceS5Preview("lele-shark", state, { type: "self-negative-cleared", count: 1 }).status).toBe("blocked");
    expect(reduceS5Preview("unknown", state, action).status).toBe("blocked");
  });
});
