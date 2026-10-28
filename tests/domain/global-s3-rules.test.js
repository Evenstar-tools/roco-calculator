import { describe, expect, test } from 'vitest';
import global from '../../public/data/global-runtime.json';
import cn from '../../public/data/runtime.json';
import { getDefaultHitCount, getSkillEffectInputs } from '../../src/domain/skill-effects.js';
import { resolveSkillPower } from '../../src/domain/skill-rules.js';
import { resolveSkillStatusActivation } from '../../src/domain/skill-status-effects.js';
import { resolveNegativeStatusApplications } from '../../src/domain/negative-status-rules.js';
import { getTraitEffectInputs, resolveTraitEffectRule } from '../../src/domain/trait-effects.js';

const skill = (name, source = global) => source.skills.find((entity) => entity.name === name);
const trait = (name, source = global) => source.traits.find((entity) => entity.name === name);

describe('adopted S3 midseason numeric mechanics, independent of current CN rules', () => {
  test.each([
    ['草虫冲击', { enemySwitchedThisTurn: true }, { value: 130 }],
    ['草虫冲击', { enemySwitchedThisTurn: false }, { value: 80 }],
    ['流星火雨', { defeatedEnemyCount: 0 }, { value: 75 }],
    ['流星火雨', { defeatedEnemyCount: 2 }, { value: 225 }],
    ['血契', { attackerHpPercent: 100 }, { value: 75 }],
    ['血契', { attackerHpPercent: 50 }, { value: 125 }],
    ['超导', { burstTriggered: true }, { value: 95, resolvedCost: 2 }],
    ['超导', { burstTriggered: false }, { value: 95, resolvedCost: 3 }],
    ['雪原狩猎', { blizzardWeather: true }, { value: 80, powerPercentAdds: [0.5] }],
    ['雪原狩猎', { blizzardWeather: false }, { value: 80, powerPercentAdds: [] }],
    ['孢子爆散', { skillUseCount: 0 }, { hitCount: 1 }],
    ['孢子爆散', { skillUseCount: 2 }, { hitCount: 5 }],
  ])('%s resolves the adopted source numbers for %j', (name, context, expected) => {
    expect(resolveSkillPower(skill(name), context)).toMatchObject({ status: 'exact', ...expected });
  });

  test('default hits and inherited Superconduction reduction follow S3 too', () => {
    expect(getDefaultHitCount(skill('孢子爆散'))).toBe(1);
    expect(getDefaultHitCount(skill('孢子爆散', cn))).toBe(2);
    const thunder = skill('雷暴');
    const plain = resolveSkillPower(thunder, { burstTriggered: true });
    const inherited = resolveSkillPower(thunder, { burstTriggered: true, burstSourceSuperconduct: true });
    expect(inherited.resolvedCost).toBe(Number(thunder.cost));
    expect(inherited.inheritedCostReduction).toBe(1);
    expect(inherited.value).toBe(plain.value + 10);
    expect(getSkillEffectInputs(thunder).find((control) => control.contextKey === 'burstSourceSuperconduct').burstDescription).toBe('本技能能耗 -1。');
  });

  test.each([
    [{}, { ownAttack: -10, ownDefense: -10, targetAttack: 0, targetDefense: 0 }],
    [{ defenseCounterSucceeded: true }, { ownAttack: 0, ownDefense: 0, targetAttack: -10, targetDefense: -10 }],
  ])('Dark Scheme uses -100%% on the actual target for %j', (context, deltas) => {
    expect(resolveSkillStatusActivation(skill('暗箱操作'), context)).toMatchObject({ applied: true, deltas });
  });

  test.each([
    [{}, 30], [{ defenseCounterSucceeded: true }, 50],
    [{ choiceTrait: '有求必应' }, 60],
    [{ defenseCounterSucceeded: true, choiceTrait: '有求必应' }, 80],
    [{ defenseCounterSucceeded: true, choiceTrait: '一意孤行' }, 80],
  ])('Ultrasound keeps S3 +30/+50 and does not repeat the counter for %j', (context, amount) => {
    expect(resolveSkillStatusActivation(skill('超声波'), context)).toMatchObject({ deltas: { ownFixedPower: amount } });
  });

  test.each(['草', '火', '普通'])('Concentrated Alkaloid applies two poison layers to every %s skill', (type) => {
    const entry = { ...skill('抓挠'), type };
    expect(resolveNegativeStatusApplications({ skill: entry, context: {}, traits: [trait('高浓生物碱')] }).stacks.poison).toBe(2);
    expect(resolveNegativeStatusApplications({ skill: entry, context: {}, traits: [trait('高浓生物碱', cn)] }).stacks.poison ?? 0).toBe(type === '草' ? 3 : 0);
  });

  test('S3 Intimidation has no attack bonus control or bonus effect', () => {
    expect(getTraitEffectInputs(trait('威慑'))).toEqual([]);
    expect(resolveTraitEffectRule(trait('威慑'), 'attacker', { context: { attackerTraitActivated: true }, skill: skill('抓挠') })).toBeNull();
    expect(getTraitEffectInputs(trait('威慑', cn)).length).toBeGreaterThan(0);
  });

  test.each([
    ['蓄能轰击', 130, 6], ['轴承支撑', 0, 3], ['远程访问', 0, 2],
    ['撕咬', 30, 3], ['趁火打劫', 35, 3], ['四维降解', 100, 7],
  ])('%s retains S3 base power %s and cost %s', (name, basePower, cost) => {
    expect(skill(name)).toMatchObject({ basePower, cost });
  });
});
