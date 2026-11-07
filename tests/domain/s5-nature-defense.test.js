import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { calculateWildDefense, WILD_DEFENSE_MODEL } from '../../public/tools/s5-nature/wild-defense.mjs';
import { calculateDamage } from '../../public/tools/s5-nature/vendor/damage.mjs';
import { previewMatchup } from '../../public/tools/s5-nature/matchup-preview.mjs';
import { predictObservation } from '../../public/tools/s5-nature/engine.mjs';
import { formatGamePercent } from '../../public/tools/s5-nature/hp-inverse.mjs';
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
    natureFor(stat, direction), stat, target.wildStrengthStage, target.wildDefenseRaceStats.sourcePetbaseId);
  return calculateDamage({ attackerStat: attack, defenderDefense: defense, displayedPower: power, level: 60 }).total;
}
const PD = 'physicalDefense', MD = 'magicalDefense';

test('archived shield-origin powers reproduce conditional damage including separately recorded breaking hits', () => {
  const cases = [
    // Fire205 belongs to the later post-shield hit; it is not a shield-model check.
    ['噼啪鸟', 42, 'brave', ['地刺'], [360], [1331]],
    ['噼啪鸟', 43, 'gentle', ['火焰切割'], [100], [223]],
    ['星尘虫', 42, 'adamant', ['火焰切割'], [200], [582]],
    ['星尘虫', 42, 'timid', ['火焰切割'], [200], [582]],
    ['沉金兽', 43, 'grounded', ['地刺', '火焰切割', '彼岸之手'], [360, 100, 300], [718, 110, 332]],
  ];
  for (const [name, level, natureId, names, powers, damages] of cases) {
    const moves = names.map(name => catalog.skills.find(row => row.name === name));
    const input = { targetId: species(name).id, level,
      profile: { spiritId: species('罗隐').id, level: 60, awakening: 5,
        panel: { hp: 403, physicalAttack: 312, magicalAttack: 136, physicalDefense: 183, magicalDefense: 137, speed: 176 } },
      skillIds: moves.map(move => move.id) };
    for (const manual of [false, true]) {
      const result = previewMatchup({ ...input, ...(manual ? {
        skillOverrides: Object.fromEntries(moves.map((move, i) => [move.id, { displayedPower: powers[i] }])),
      } : {}) }, catalog);
      assert.deepEqual(result.outgoing.map(row => row.displayedPower), powers);
      const rows = result.outgoing.map(entry => entry.predictions.find(row => row.natureId === natureId));
      assert.deepEqual(rows.map(row => row.damage), damages, `${name}/${level}/${natureId}/${manual}`);
      assert(rows.every(row => row.status === 'estimated'));
      if (name === '沉金兽') {
        // User's "remaining 74" matches the first hit on the 420-point shield.
        // The old wrong damage112 also rounded to74%; verify the exact pool too.
        assert.equal(rows[1].hpMax, 420);
        assert.equal(rows[1].remainingHp, 310);
        assert.equal(formatGamePercent(rows[1].remainingPercent), 74);
        // 332 was the third hit after two110 hits, not a fresh full-pool observation.
        assert.equal(420 - rows[1].damage * 2, 200);
      }
      if (name === '噼啪鸟' && level === 43) {
        assert.equal(calculateDamage({ attackerStat: 312, displayedPower: 100, level: 60,
          defenderDefense: rows[0].defenderDefense, finalDamageMultiplier: 2 }).total, 446);
      }
    }
  }
});

test('live defense points leave unmeasured levels, nature bands, forms and mappings on their previous model', () => {
  for (const [source, race, stage, measuredLevel, direction] of [
    [3444, 85, 3, 42, 'neutral'], [3444, 85, 3, 43, 'down'],
    [3398, 76, 1, 42, 'neutral'], [3802, 127, 1, 43, 'neutral'],
  ]) {
    const nature = natureFor(PD, direction);
    const otherLevel = 41;
    assert.equal(calculateWildDefense(race, otherLevel, nature, PD, stage, source),
      calculateWildDefense(race, otherLevel, nature, PD, stage));
    assert.equal(calculateWildDefense(race, measuredLevel, natureFor(PD, 'up'), PD, stage, source),
      calculateWildDefense(race, measuredLevel, natureFor(PD, 'up'), PD, stage));
    assert.equal(calculateWildDefense(race + 1, measuredLevel, nature, PD, stage, source),
      calculateWildDefense(race + 1, measuredLevel, nature, PD, stage));
    const otherStage = stage === 1 ? 2 : 1;
    assert.equal(calculateWildDefense(race, measuredLevel, nature, PD, otherStage, source),
      calculateWildDefense(race, measuredLevel, nature, PD, otherStage));
  }
  assert.equal(calculateWildDefense(127, 43, natureFor(MD, 'neutral'), MD, 1, 3802),
    calculateWildDefense(127, 43, natureFor(MD, 'neutral'), MD, 1));
  assert.equal(calculateWildDefense(127, 43, natureFor(PD, 'neutral'), PD, 1, 3804),
    calculateWildDefense(127, 43, natureFor(PD, 'neutral'), PD, 1));
});

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
    ['小翼龙', 42, PD, 'up', 312, 180 / 1.3, 207],
  ];
  for (const sample of samples) assert.equal(replay(sample), sample[6], sample.join('/'));
  assert.deepEqual(catalog.meta.wildDefenseModel, WILD_DEFENSE_MODEL);
  assert.equal(WILD_DEFENSE_MODEL.originalGameFormulaRecovered, false);
});

test('handoff discrepancies stay visible instead of changing coefficients for each observation', () => {
  const samples = [
    // The old fire cut contradicts the same dragon's ground-spike observation.
    ['伊雷龙', 41, PD, 'up', 312, 40 * 1.8, 157, 134],
    ['锤头鹳', 43, MD, 'neutral', 176, 90 * 3 * 1.8 / 1.25, 481, 480],
    ['深蓝鲸', 41, PD, 'neutral', 192, 272 * 1.8, 456, 454],
  ];
  for (const sample of samples) {
    assert.equal(replay(sample), sample[7], sample.join('/'));
    assert.notEqual(sample[6], sample[7]);
  }
});

test('42-level calm wing-dragon matches the observed three moves without changing level or HP', () => {
  const skills = ['地震', '彼岸之手', '先发制人'].map(name => catalog.skills.find(row => row.name === name));
  const target = species('小翼龙');
  const input = { targetId: target.id, level: 42,
    profile: { spiritId: species('罗隐').id, level: 60, awakening: 5,
      panel: { hp: 403, physicalAttack: 312, magicalAttack: 136, physicalDefense: 183, magicalDefense: 137, speed: 176 } },
    skillIds: skills.map(row => row.id), ownDiceEffects: { physicalAttackMultiplier: 1.1 } };
  const calm = entry => entry.predictions.find(row => row.natureId === 'calm');
  const neutralHp = [324, 486];
  for (const [index, targetShiny] of [false, true].entries()) {
    const result = previewMatchup({ ...input, targetShiny }, catalog);
    assert.deepEqual(result.outgoing.map(row => row.displayedPower), [418, 330, 60.5]);
    assert.deepEqual(result.outgoing.map(row => calm(row).damage), [684, 540, 99]);
    assert(result.outgoing.every(row => calm(row).targetLevel === 42));
    assert(result.outgoing.every(row => calm(row).hpMax === neutralHp[index]));
    assert.equal(calm(result.outgoing[2]).remainingHp, neutralHp[index] - 99);
    const manual = previewMatchup({ ...input, targetShiny,
      skillOverrides: Object.fromEntries(skills.map((row, i) => [row.id, { displayedPower: [418, 330, 60.5][i] }])) }, catalog);
    assert.deepEqual(manual.outgoing.map(row => calm(row).damage), [684, 540, 99]);
  }
  const spike = catalog.skills.find(row => row.name === '地刺');
  const previous = previewMatchup({ ...input, skillIds: [spike.id], ownDiceEffects: {},
    targetDiceEffects: { physicalDefenseMultiplier: 1.3 } }, catalog);
  assert.equal(previous.outgoing[0].predictions.find(row => row.upStat === PD && row.downStat === MD).damage, 207);
  const all = previewMatchup({ ...input, level: 'all' }, catalog);
  const singles = [41, 42, 43].map(level => previewMatchup({ ...input, level }, catalog));
  assert.deepEqual(all.outgoing[0].predictions, singles.flatMap(row => row.outgoing[0].predictions));
  assert(calm(singles[0].outgoing[0]).damage > calm(singles[1].outgoing[0]).damage);
  assert(calm(singles[1].outgoing[0]).damage > calm(singles[2].outgoing[0]).damage);
});

test('wing-dragon calibration does not leak to another source form or magical defense', () => {
  const nature = natureFor(PD, 'neutral');
  assert.equal(calculateWildDefense(91, 42, nature, PD, 2, 9999), calculateWildDefense(91, 42, nature, PD, 2));
  assert.equal(calculateWildDefense(79, 42, nature, MD, 2, 3209), calculateWildDefense(79, 42, nature, MD, 2));
  assert.notEqual(calculateWildDefense(91, 42, nature, PD, 2, 3209), calculateWildDefense(91, 42, nature, PD, 2));
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
    if (row.wildDefenseRaceStats === null) assert(mapping.missing[row.id] || mapping.candidatesBySpiritId?.[row.id], row.name);
  }
  // These package branches differ in attack, but have identical defense races.
  assert.equal(species('乐乐鲨').wildAttackRaceStats.physicalAttack, 94);
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

test('absent defense mappings block outgoing previews and records without changing incoming or HP', () => {
  const target = species('沉金兽');
  const fire = catalog.skills.find(row => row.name === '火焰切割');
  const incoming = catalog.skills.find(row => row.name === '龙炮');
  const profile = { id: 'own', spiritId: species('罗隐').id, level: 60, awakening: 5,
    panel: { hp: 403, physicalAttack: 312, magicalAttack: 136, physicalDefense: 183, magicalDefense: 137, speed: 151 } };
  const input = { targetId: target.id, level: 43, profile, skillIds: [fire.id], incomingSkillId: incoming.id };
  const baseline = previewMatchup(input, catalog);
  const absent = structuredClone(catalog);
  delete absent.spirits.find(row => row.id === target.id).wildDefenseRaceStats;
  const result = previewMatchup(input, absent);
  assert.equal(result.outgoing[0].status, 'unsupported');
  assert.match(result.outgoing[0].reason, /三阶段双防资料缺失/);
  assert.deepEqual(result.outgoing[0].predictions, []);
  assert.deepEqual(result.incoming, baseline.incoming);
  assert.deepEqual(result.targetHpByNature, baseline.targetHpByNature);
  const observation = { id: 'outgoing', profileId: 'own', skillId: fire.id,
    direction: 'outgoing', damage: 110, context: 'clean', reduction: 1 };
  const record = predictObservation({ targetId: target.id, level: 43, profiles: [profile] },
    observation, natureFor(PD, 'neutral'), absent);
  assert.equal(record.status, 'blocked');
  assert.match(record.reason, /三阶段双防资料缺失/);
});
