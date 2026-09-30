import { expect, test } from "vitest";
import { calculateNegativeStatusSettlement } from "../../src/domain/negative-status.js";
import { damagePresentation, damageSegments, statusLossText } from "../../src/domain/result-presentation.js";

function present(statuses, options = {}) {
  const { currentHp = 1000, directDamage = 200, types = [], attacker } = options;
  const settlement = calculateNegativeStatusSettlement({ enabled: true,
    defender: { maxHp: 1000, currentHp, types }, directDamage, statuses, attacker });
  return { settlement, presentation: damagePresentation({ totalDamage: directDamage,
    hpPercent: directDamage / 10, negativeStatusSettlement: settlement }) };
}

test.each([["burn", "火"], ["poison", "毒"], ["poison", "机械"], ["parasitism", "草"], ["electrified", "电"], ["freeze", "冰"]])(
  "%s 免疫不增加伤害或覆盖", (id, type) => {
    const { presentation } = present({ [id]: 2 }, { types: [type] });
    expect(presentation).toMatchObject({ damage: 200, percent: 20, hasStatusImpact: false, lethal: false });
  },
);

test("一层引电未触发，两层才计入扣血", () => {
  const one = present({ electrified: 1 });
  expect(one.presentation.damage).toBe(200);
  expect(statusLossText(one.settlement, one.settlement.breakdown.find(e => e.id === "electrified"))).toBe("未触发");
  expect(present({ electrified: 2 }).presentation.damage).toBe(450);
});

test("混合异常实际扣血只相加一次，来源回血不算入伤害", () => {
  const { settlement, presentation } = present({ burn: 2, poison: 2, parasitism: 2, electrified: 2, freeze: 1 },
    { attacker: { maxHp: 1000, currentHp: 500 } });
  expect(settlement.totalHealing).toBe(40);
  expect(presentation).toMatchObject({ damage: 590, percent: 64, remainingHp: 410, freezePercent: 5 });
  expect(damageSegments(presentation)).toEqual([{ kind: "direct", width: 20 }, { kind: "status", width: 39 }, { kind: "freeze", width: 5 }]);
});

test("异常已扣光剩余生命时，不误标冻结斩杀或把过量伤害重复相加", () => {
  const { presentation } = present({ poison: 10, freeze: 3 }, { currentHp: 300 });
  expect(presentation).toMatchObject({ damage: 300, statusDamage: 100, lethal: true, remainingHp: 0,
    freezeLethal: false, outcome: "本次可击倒 · 异常结算" });
});

test("直伤击倒不追加异常；冻结只增加覆盖、不增加伤害", () => {
  expect(present({ burn: 10, freeze: 3 }, { directDamage: 1200 }).presentation)
    .toMatchObject({ damage: 1200, percent: 120, statusDamage: 0, freezePercent: 0 });
  expect(present({ freeze: 3 }, { directDamage: 900 }).presentation)
    .toMatchObject({ damage: 900, percent: 105, remainingHp: 0, freezeLethal: true });
});

test("纯异常技能显示实际扣血，冻结单独不伪造伤害", () => {
  const { settlement } = present({ poison: 2 }, { directDamage: 0 });
  expect(damagePresentation({ statusOnly: true, totalDamage: 0, hpPercent: 0, negativeStatusSettlement: settlement }))
    .toMatchObject({ damage: 60, percent: 6 });
  const frozen = present({ freeze: 2 }, { directDamage: 0 });
  expect(damagePresentation({ statusOnly: true, totalDamage: 0, hpPercent: 0, negativeStatusSettlement: frozen.settlement }))
    .toMatchObject({ damage: null, percent: 10 });
});
