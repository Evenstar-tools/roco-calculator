import { expect, test } from "vitest";
import { expireTransientGainSources, gainSourcesFor, limitGainSources, recordGainChanges, recordManualGainChanges, sanitizeGainSources, summarizeGains } from "../../src/domain/gain-provenance.js";

const state = (overrides = {}) => ({ directions: { forward: { overrides }, reverse: { overrides: {} } } });
const coax = { kind: "skill", id: "coax", name: "撒娇" };
test("跨技能增益按实际差值记录、累计并保持计算输入不变", () => {
  const first = recordGainChanges(state(), state({ fixedPowerAdd: 10 }), coax);
  const second = structuredClone(first);
  second.directions.forward.overrides.fixedPowerAdd = 20;
  recordGainChanges(first, second, coax);
  expect(gainSourcesFor(second.directions.forward.overrides, "fixedPowerAdd", 20)).toEqual([{ ...coax, count: 2, amount: 20 }]);
  expect(first.directions.forward.overrides.fixedPowerAdd).toBe(10);
  expect(summarizeGains({ fixed: gainSourcesFor(second.directions.forward.overrides, "fixedPowerAdd", 20) })).toBe("撒娇×2");
});
test("旧配置与手动修改不倒推技能来源，数值不匹配时不信任旧记录", () => {
  const next = recordGainChanges(state({ fixedPowerAdd: 15 }), state({ fixedPowerAdd: 25 }), coax);
  const overrides = next.directions.forward.overrides;
  expect(gainSourcesFor(overrides, "fixedPowerAdd", 25).map((item) => item.name)).toEqual(["未记录", "撒娇"]);
  expect(gainSourcesFor(overrides, "fixedPowerAdd", 30)[0].name).toBe("未记录");
  const manual = recordManualGainChanges(overrides, { ...overrides, fixedPowerAdd: 30 });
  expect(gainSourcesFor(manual, "fixedPowerAdd", 30)[0].name).toBe("手动");
  expect(sanitizeGainSources({ fixedPowerAdd: { value: 30, sources: [{ ...coax, count: 1, amount: 999 }] } })).toEqual({});
});
test("短时来源到期移除，永久来源仍对账；上限截断不虚报增益", () => {
  const original = recordGainChanges(state(), state({ skillPowerPercentAddsBySlot: { 1: 0.2 } }), coax);
  const next = structuredClone(original);
  next.directions.forward.overrides.skillPowerPercentAddsBySlot[1] = 0.7;
  recordGainChanges(original, next, { kind: "skill", id: "defense", name: "守护", transient: true });
  const overrides = next.directions.forward.overrides;
  overrides.skillPowerPercentAddsBySlot[1] = 0.2;
  expireTransientGainSources(overrides);
  expect(gainSourcesFor(overrides, "skillPowerPercentAddsBySlot.1", 0.2).map((item) => item.name)).toEqual(["撒娇"]);
  expect(limitGainSources([{ ...coax, amount: 98 }, { ...coax, amount: 3 }], -99, 99).map((item) => item.amount)).toEqual([98, 1]);
});
