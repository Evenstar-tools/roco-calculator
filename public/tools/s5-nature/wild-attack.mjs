// User-authorized empirical S5 incoming-attack model from the stage-3 handoff.
// The caller supplies the matching family's strength-stage-3 attack race stat.
// This is a field-sample fit, not a recovered original-game calculation.
export const WILD_ATTACK_MODEL = Object.freeze({
  id: 's5-stage3-attack-v2',
  source: 'user-authorized-stage3-attack-handoff',
  evidence: 'output/pve-stage3-form-fit-20261106/',
  kind: 'empirical-formula',
  strengthStage: 3,
  baseTail: 11,
  attackMultiplier: 2,
  shinyMultiplier: 1,
  baseRounding: 'round-half-up',
  natureRounding: 'round-half-up',
  originalGameFormulaRecovered: false,
});

const STATS = ['hp', 'physicalAttack', 'magicalAttack', 'physicalDefense', 'magicalDefense', 'speed'];
const ATTACK_STATS = ['physicalAttack', 'magicalAttack'];

export function calculateWildAttack(raceAttack, level, nature, stat) {
  if (!Number.isInteger(raceAttack) || raceAttack < 1 || raceAttack > 1000) {
    throw new RangeError('攻击种族值缺失或超出范围。');
  }
  if (![41, 42, 43].includes(level)) throw new RangeError('野生等级仅支持41、42、43。');
  if (!ATTACK_STATS.includes(stat)) throw new RangeError('野怪攻击仅支持物攻或魔攻。');
  if (!STATS.includes(nature?.upStat) || !STATS.includes(nature?.downStat) || nature.upStat === nature.downStat) {
    throw new RangeError('性格的增强项和削弱项必须是不同的六维属性。');
  }

  const base = Math.floor((1000 + raceAttack * (level + 50) + 50) / 100);
  const naturePercent = nature.upStat === stat ? 110 : nature.downStat === stat ? 90 : 100;
  // Round the nature-adjusted base before adding the growth tail. The whale
  // author table distinguishes this order in three sonic-boom observations.
  const adjustedBase = Math.floor((base * naturePercent + 50) / 100);
  return (adjustedBase + WILD_ATTACK_MODEL.baseTail) * WILD_ATTACK_MODEL.attackMultiplier;
}
