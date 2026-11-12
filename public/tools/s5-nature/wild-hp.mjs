import { isWildLevel } from './wild-levels.mjs';
// Calibrated from the user-confirmed S5 whale absolute-HP table. This is a
// shared empirical HP formula, not a recovered original-game implementation.
export const WILD_HP_MODEL = Object.freeze({
  id: 's5-calibrated-hp-v1',
  source: 'user-confirmed-whale-hp-table',
  kind: 'calibrated-formula',
  confirmedSpecies: Object.freeze(['深蓝鲸']),
  otherSpecies: 'same-formula-extrapolation',
  baseTail: 22,
  ordinaryMultiplier: 2,
  shinyMultiplier: 1.5,
});
export const SHINY_HP_MULTIPLIER = WILD_HP_MODEL.shinyMultiplier;
const STATS = ['hp', 'physicalAttack', 'magicalAttack', 'physicalDefense', 'magicalDefense', 'speed'];
const halfUp = (numerator, denominator) => Math.floor((numerator + denominator / 2) / denominator);

export function wildTargetShiny(input) {
  if (typeof input?.targetShiny === 'boolean') return input.targetShiny;
  if (typeof input?.preview?.targetShiny === 'boolean') return input.preview.targetShiny;
  if (typeof input?.preview?.shiny === 'boolean') return input.preview.shiny;
  return input?.encounter?.shiny === true;
}

export function calculateWildHp(raceHp, level, nature, { shiny = false } = {}) {
  if (!Number.isInteger(raceHp) || raceHp < 1 || raceHp > 1000) throw new RangeError('生命种族值缺失或超出范围。');
  if (!isWildLevel(level)) throw new RangeError('野怪等级须为1至60的整数。');
  if (!STATS.includes(nature?.upStat) || !STATS.includes(nature?.downStat) || nature.upStat === nature.downStat) throw new RangeError('性格的增强项和削弱项必须是不同的六维属性。');
  if (typeof shiny !== 'boolean') throw new RangeError('异色标记必须为布尔值。');
  const base = halfUp((10 + level) * 100 + raceHp * (50 + 2 * level), 100);
  const naturePercent = nature.upStat === 'hp' ? 110 : nature.downStat === 'hp' ? 90 : 100;
  const ordinary = WILD_HP_MODEL.ordinaryMultiplier * (halfUp(base * naturePercent, 100) + WILD_HP_MODEL.baseTail);
  // ordinary is even, so the final ×1.5 always stays an exact integer.
  return shiny ? ordinary * SHINY_HP_MULTIPLIER : ordinary;
}
