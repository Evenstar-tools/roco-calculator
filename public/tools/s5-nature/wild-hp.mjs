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
// Post-shield HP is a separate server-supplied body. Include the ordinary
// zero-star talent envelope (0..10); do not apply shield or shiny multipliers.
// This is the bounded model cross-checked in docs/maintenance/s5-evil-exchange-range-20261112.md,
// not a recovered server-side NPC generator or a probability distribution.
export const WILD_BODY_HP_MODEL = Object.freeze({
  id: 's5-body-hp-talent-range-v1', talentMin: 0, talentMax: 10,
});
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

export function calculateWildBodyHpCandidates(raceHp, level, nature) {
  calculateWildHp(raceHp, level, nature); // Same species/level/nature validation.
  const naturePercent = nature.upStat === 'hp' ? 110 : nature.downStat === 'hp' ? 90 : 100;
  const values = new Set();
  for (let talent = WILD_BODY_HP_MODEL.talentMin; talent <= WILD_BODY_HP_MODEL.talentMax; talent++) {
    // ATTR_GLOBAL_CONFIG: race coefficient .02*(L+25), talent .01*(L+25).
    const base = halfUp((10 + level) * 100 + raceHp * (50 + 2 * level) + talent * (level + 25), 100);
    values.add(halfUp(base * naturePercent, 100) + WILD_HP_MODEL.baseTail);
  }
  return [...values].sort((a, b) => a - b);
}
