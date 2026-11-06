import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { calculateWildDefense, WILD_DEFENSE_MODEL } from '../../public/tools/s5-nature/wild-defense.mjs';
import { calculateDamage } from '../../public/tools/s5-nature/vendor/damage.mjs';
import { buildWildDefenseRaceData } from '../../scripts/prepare-s5-wild-defense.mjs';

const read = name => JSON.parse(readFileSync(`public/tools/s5-nature/data/${name}.json`, 'utf8'));
const catalog = read('catalog'), mapping = read('wild-defense-races');
const species = name => catalog.spirits.find(row => row.name === name);
const natureFor = (stat, direction) => catalog.natures.find(row => direction === 'up'
  ? row.upStat === stat && row.downStat === 'speed'
  : direction === 'down' ? row.upStat === 'speed' && row.downStat === stat
    : row.upStat === 'hp' && row.downStat === 'speed');
function replay([name, level, stat, direction, attack, power]) {
  const target = species(name);
  const defense = calculateWildDefense(target.wildDefenseRaceStats[stat], level,
    natureFor(stat, direction), stat, target.wildStrengthStage);
  return calculateDamage({ attackerStat: attack, defenderDefense: defense, displayedPower: power, level: 60 }).total;
}
const PD = 'physicalDefense', MD = 'magicalDefense';

test('stage coefficients reproduce the unrounded defense handoff across levels, natures and both categories', () => {
  const samples = [
    ['可爱猿', 41, PD, 'neutral', 312, 100, 103],
    ['可爱猿', 41, PD, 'neutral', 312, 200, 206],
    ['可爱猿', 41, PD, 'neutral', 312, 110, 113],
    ['可爱猿', 41, PD, 'neutral', 312, 396 * 1.8, 735],
    ['可爱猿', 42, PD, 'neutral', 312, 60.5, 61],
    ['可爱猿', 42, MD, 'neutral', 176, 176, 125],
    ['伊雷龙', 41, PD, 'down', 312, 180, 399],
    ['伊雷龙', 41, PD, 'down', 312, 50 * 1.8, 199],
    ['伊雷龙', 42, PD, 'up', 312, 180, 333],
    ['伊雷龙', 42, PD, 'up', 312, 40 * 1.8, 133],
    ['伊雷龙', 41, PD, 'up', 312, 180, 335],
    ['伊雷龙', 41, PD, 'neutral', 312, 50 * 1.8, 182],
    ['伊雷龙', 41, PD, 'neutral', 312, 180, 364],
    ['伊雷龙', 41, PD, 'neutral', 312, 55, 111],
    ['伊雷龙', 41, MD, 'down', 176, 160, 157],
    ['深蓝鲸', 42, PD, 'neutral', 312, 180, 269],
    // Sample 11's defense nature is corrected by handoff section 4: PD up.
    ['深蓝鲸', 42, PD, 'up', 312, 60.5, 82],
    ['深蓝鲸', 42, PD, 'up', 312, 121, 165],
    ['深蓝鲸', 42, PD, 'up', 312, 198, 270],
    ['深蓝鲸', 42, MD, 'neutral', 176, 176, 138],
    ['深蓝鲸', 42, PD, 'down', 312, 50 * 1.8, 148],
    // Display power already includes enemy guard dice; do not multiply D again.
    ['锤头鹳', 43, PD, 'neutral', 312, 44, 77],
    ['锤头鹳', 43, PD, 'neutral', 312, 40 * 1.8, 127],
    ['锤头鹳', 43, MD, 'neutral', 176, 128, 158],
    // Keep the fractional value behind the displayed 123, rather than flooring.
    ['小翼龙', 42, MD, 'down', 176, 160 / 1.3, 142],
  ];
  for (const sample of samples) assert.equal(replay(sample), sample[6], sample.join('/'));
  assert.deepEqual(catalog.meta.wildDefenseModel, WILD_DEFENSE_MODEL);
  assert.equal(WILD_DEFENSE_MODEL.originalGameFormulaRecovered, false);
});

test('handoff discrepancies stay visible instead of changing coefficients for each observation', () => {
  const samples = [
    // The old fire cut contradicts the same dragon's ground-spike observation.
    ['伊雷龙', 41, PD, 'up', 312, 40 * 1.8, 157, 134],
    ['小翼龙', 42, PD, 'up', 312, 180 / 1.3, 207, 206],
    ['锤头鹳', 43, MD, 'neutral', 176, 90 * 3 * 1.8 / 1.25, 481, 480],
    ['深蓝鲸', 41, PD, 'neutral', 192, 272 * 1.8, 456, 454],
  ];
  for (const sample of samples) {
    assert.equal(replay(sample), sample[7], sample.join('/'));
    assert.notEqual(sample[6], sample[7]);
  }
});

test('defense retains level and nature fractions and rejects missing mappings', () => {
  const nature = natureFor(PD, 'up');
  assert.equal(calculateWildDefense(69, 41, nature, PD, 2), 1.65725 * ((10 + 69 * .91) * 110 / 100 + 11));
  assert(calculateWildDefense(69, 42, nature, PD, 2) > calculateWildDefense(69, 41, nature, PD, 2));
  assert(!Number.isInteger(calculateWildDefense(69, 41, nature, PD, 2)));
  assert.throws(() => calculateWildDefense(undefined, 41, nature, PD, 2), /防御种族值/);
  assert.throws(() => calculateWildDefense(69, 41, nature, PD, null), /强度阶段/);
  assert.throws(() => calculateWildDefense(69, 40, nature, PD, 2), /野生等级/);
  assert.throws(() => calculateWildDefense(69, 41, nature, 'physicalAttack', 2), /物防或魔防/);
});

test('catalog preserves package strength stage separately from displayed evolution rank', () => {
  for (const [name, stage, id, physical, magical] of [
    ['可爱猿', 1, 3085, 143, 111], ['伊雷龙', 2, 3412, 69, 99],
    ['小翼龙', 2, 3210, 91, 79], ['深蓝鲸', 3, 3381, 125, 141], ['锤头鹳', 3, 3069, 101, 81],
  ]) {
    const row = species(name);
    assert.equal(row.wildStrengthStage, stage);
    assert.deepEqual([row.wildDefenseRaceStats.defensePetbaseId, row.wildDefenseRaceStats.physicalDefense, row.wildDefenseRaceStats.magicalDefense], [id, physical, magical]);
  }
  for (const row of catalog.spirits) {
    assert(Object.hasOwn(row, 'wildDefenseRaceStats'), row.name);
    assert.deepEqual(row.wildDefenseRaceStats, mapping.bySpiritId[row.id] ?? null, row.name);
    assert.equal(row.wildStrengthStage, mapping.strengthStageBySpiritId[row.id] ?? null, row.name);
    if (row.wildDefenseRaceStats === null) assert(mapping.missing[row.id], row.name);
  }
  // These package branches differ in attack, but have identical defense races.
  assert.equal(species('乐乐鲨').wildAttackRaceStats, null);
  assert.equal(species('乐乐鲨').wildDefenseRaceStats.physicalDefense, 120);
});

test('defense exporter independently checks every allowed stage-3 branch', () => {
  const smallCatalog = { meta: {}, spirits: [{ id: 'a', name: 'A' }] };
  const attack = { meta: {}, bySpiritId: { a: { sourcePetbaseId: 1, attackPetbaseId: 2, attackPetbaseIds: [2, 3] } }, missing: {} };
  const rows = [{ id: 1, stength_stage: 2 },
    { id: 2, name: 'B', stength_stage: 3, phy_defence_race: 69, spe_defence_race: 99 },
    { id: 3, name: 'C', stength_stage: 3, phy_defence_race: 70, spe_defence_race: 99 }];
  assert.equal(buildWildDefenseRaceData(smallCatalog, attack, rows).missing.a.code, 'ambiguous-defense-races');
  rows[2].phy_defence_race = 69;
  assert.equal(buildWildDefenseRaceData(smallCatalog, attack, rows).bySpiritId.a.physicalDefense, 69);
  delete rows[1].spe_defence_race;
  assert.equal(buildWildDefenseRaceData(smallCatalog, attack, rows).missing.a.code, 'incomplete-defense-races');
});
