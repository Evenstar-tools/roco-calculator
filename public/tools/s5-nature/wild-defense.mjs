// User-authorized field fit, using the source form's package strength stage
// and its ordinary family's strength-stage-3 defense races. Neither the base
// nor the nature-adjusted defense is rounded before the damage denominator.
export const WILD_DEFENSE_MODEL = Object.freeze({
  id: 's5-stage3-defense-v1',
  source: 'user-authorized-encounter-formula-handoff-20261106',
  kind: 'empirical-formula',
  raceStrengthStage: 3,
  coefficientStrengthStage: 'source-form',
  baseTail: 11,
  rounding: 'none',
  shinyMultiplier: 1,
  originalGameFormulaRecovered: false,
  coefficients: Object.freeze({
    1: Object.freeze({ physicalDefense: 1.806, magicalDefense: 1.806 }),
    2: Object.freeze({ physicalDefense: 1.65725, magicalDefense: 1.6005 }),
    3: Object.freeze({ physicalDefense: 1.38531, magicalDefense: 1.335 }),
  }),
});

const STATS = ['hp', 'physicalAttack', 'magicalAttack', 'physicalDefense', 'magicalDefense', 'speed'];
const DEFENSE_STATS = ['physicalDefense', 'magicalDefense'];

export function calculateWildDefense(raceDefense, level, nature, stat, strengthStage) {
  if (!Number.isInteger(raceDefense) || raceDefense < 1 || raceDefense > 1000) {
    throw new RangeError('防御种族值缺失或超出范围。');
  }
  if (![41, 42, 43].includes(level)) throw new RangeError('野生等级仅支持41、42、43。');
  if (!DEFENSE_STATS.includes(stat)) throw new RangeError('野怪防御仅支持物防或魔防。');
  if (!STATS.includes(nature?.upStat) || !STATS.includes(nature?.downStat) || nature.upStat === nature.downStat) {
    throw new RangeError('性格的增强项和削弱项必须是不同的六维属性。');
  }
  if (![1, 2, 3].includes(strengthStage)) throw new RangeError('野怪强度阶段资料缺失。');
  const base = 10 + raceDefense * (level + 50) / 100;
  const naturePercent = nature.upStat === stat ? 110 : nature.downStat === stat ? 90 : 100;
  return WILD_DEFENSE_MODEL.coefficients[strengthStage][stat]
    * (base * naturePercent / 100 + WILD_DEFENSE_MODEL.baseTail);
}
