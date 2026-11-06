// Own trained profiles reuse the pinned calculator's five-growth-star stat core.
// Awakening (sixth to tenth total star) never enters the six-stat calculation.
import { calculateAllPanelStats } from './vendor/stat.mjs';

const stats = ['hp', 'physicalAttack', 'magicalAttack', 'physicalDefense', 'magicalDefense', 'speed'];

export function calculateOwnPanel({ raceStats, level = 60, natureId = 'neutral', displayIvs = {} }, catalog) {
  if (!Number.isSafeInteger(level) || level < 1 || level > 60) {
    throw new RangeError('面板等级须为1至60的整数。');
  }
  if (!stats.every(key => Number.isInteger(raceStats?.[key]) && raceStats[key] > 0)) {
    throw new RangeError('该精灵的种族值资料不足，暂不能生成五星面板。');
  }
  if (!displayIvs || typeof displayIvs !== 'object' || Array.isArray(displayIvs)) {
    throw new TypeError('请填写成长后的六项个体值。');
  }
  const ivs = Object.fromEntries(stats.map(key => {
    const value = Object.hasOwn(displayIvs, key) ? displayIvs[key] : 0;
    if (!Number.isInteger(value) || value < 0 || value > 60) {
      throw new RangeError('成长后个体值须为0至60的整数；初始10对应五星后的60。');
    }
    return [key, value];
  }));
  const nature = natureId === 'neutral' ? null : catalog?.natures?.find(item => item.id === natureId);
  if (natureId !== 'neutral' && !nature) throw new RangeError('请选择已收录的性格。');
  const natureMultipliers = nature ? { [nature.upStat]: 1.2, [nature.downStat]: 0.9 } : {};
  return calculateAllPanelStats({ raceStats, displayIvs: ivs, natureMultipliers, level });
}
