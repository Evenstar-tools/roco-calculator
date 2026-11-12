import { isWildLevel } from './wild-levels.mjs';
// User-authorized empirical S5 attack fit across the three strength stages.
// The caller supplies the selected form's own race stat and explicit stage.
// This is a field-sample fit, not a recovered original-game calculation.
export const WILD_ATTACK_MODEL = Object.freeze({
  id: 's5-strength-stage-attack-v3',
  source: 'user-authorized-stage-attack-crosscheck',
  evidence: 'data/field-samples.json',
  kind: 'empirical-formula',
  raceSource: 'selected-form',
  baseTail: 11,
  stageMultipliers: Object.freeze({ 1: 2.8, 2: 2.4, 3: 2 }),
  shinyMultiplier: 1,
  baseRounding: 'round-half-up',
  natureRounding: 'round-half-up',
  finalRounding: 'round-half-up',
  originalGameFormulaRecovered: false,
});

const STATS = ['hp', 'physicalAttack', 'magicalAttack', 'physicalDefense', 'magicalDefense', 'speed'];
const ATTACK_STATS = ['physicalAttack', 'magicalAttack'];

export function resolveWildAttack(raceAttack, level, nature, stat, strengthStage) {
  if (!Number.isInteger(raceAttack) || raceAttack < 1 || raceAttack > 1000) {
    throw new RangeError('攻击种族值缺失或超出范围。');
  }
  if (!isWildLevel(level)) throw new RangeError('野怪等级须为1至60的整数。');
  if (!ATTACK_STATS.includes(stat)) throw new RangeError('野怪攻击仅支持物攻或魔攻。');
  if (!STATS.includes(nature?.upStat) || !STATS.includes(nature?.downStat) || nature.upStat === nature.downStat) {
    throw new RangeError('性格的增强项和削弱项必须是不同的六维属性。');
  }
  if (![1, 2, 3].includes(strengthStage)) throw new RangeError('野怪强度阶段缺失或无效，双攻计算需要明确的1至3阶段。');

  const base = Math.floor((1000 + raceAttack * (level + 50) + 50) / 100);
  const naturePercent = nature.upStat === stat ? 110 : nature.downStat === stat ? 90 : 100;
  // Round the nature-adjusted base before adding the growth tail. The whale
  // author table distinguishes this order in three sonic-boom observations.
  const adjustedBase = Math.floor((base * naturePercent + 50) / 100);
  // Stage 1/2 samples distinguish rounding after the stage multiplier. Keep
  // integer tenths through this step; later combat/dice multipliers stay intact.
  const multiplierTenths = WILD_ATTACK_MODEL.stageMultipliers[strengthStage] * 10;
  return { value: Math.floor(((adjustedBase + WILD_ATTACK_MODEL.baseTail) * multiplierTenths + 5) / 10),
    kind: 'stage-fit', coefficient: WILD_ATTACK_MODEL.stageMultipliers[strengthStage],
    stat, strengthStage, level, naturePercent, formulaVerified: false };
}

export function calculateWildAttack(...args) {
  return resolveWildAttack(...args).value;
}
