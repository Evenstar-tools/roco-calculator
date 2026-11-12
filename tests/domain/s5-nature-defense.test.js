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
    const otherLevel = measuredLevel === 41 ? 42 : 41;
    assert.equal(calculateWildDefense(race, otherLevel, nature, PD, stage, source),
      calculateWildDefense(race, otherLevel, nature, PD, stage));
    const otherBand = direction === 'up' ? 'neutral' : 'up';
    assert.equal(calculateWildDefense(race, measuredLevel, natureFor(PD, otherBand), PD, stage, source),
      calculateWildDefense(race, measuredLevel, natureFor(PD, otherBand), PD, stage));
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

test('confirmed whale41 physical-defense-up reproduces the two star levels and exact full-health percentages', () => {
  const target = species('深蓝鲸');
  const ground = catalog.skills.find(row => row.name === '地刺');
  const fire = catalog.skills.find(row => row.name === '火焰切割');
  const nature = natureFor(PD, 'up');
  for (const [awakening, expectedGround, expectedPercent] of [[5, 249, 51], [2, 193, 63]]) {
    const profile = { id: 'own', spiritId: species('罗隐').id, level: 60, awakening,
      panel: { hp: 403, physicalAttack: 312, magicalAttack: 136, physicalDefense: 183, magicalDefense: 137, speed: 176 } };
    const input = { targetId: target.id, level: 41, profile,
      skillIds: awakening === 5 ? [ground.id, fire.id] : [ground.id] };
    const preview = previewMatchup(input, catalog);
    const rows = preview.outgoing.map(entry => entry.predictions.find(row => row.natureId === nature.id));
    assert.deepEqual(rows.map(row => row.damage), awakening === 5 ? [249, 124] : [193]);
    assert.deepEqual(rows.map(row => formatGamePercent(row.remainingPercent)), awakening === 5 ? [51, 76] : [63]);
    assert(rows.every(row => row.hpMax === 508 && row.defenderDefense === 203));
    const observation = { id: 'whale-ground', profileId: profile.id, skillId: ground.id,
      direction: 'outgoing', damage: expectedGround, context: 'clean', reduction: 1,
      beforePercent: 100, afterPercent: expectedPercent, percentDigits: 0, percentMode: 'game' };
    const recorded = predictObservation({ targetId: target.id, level: 41, profiles: [profile] },
      observation, nature, catalog);
    // The archived-record engine still accepts only its neutral simple-hit
    // whitelist; preview calibration must not silently expand that contract.
    assert.equal(recorded.status, 'blocked');
    assert.equal(recorded.compatible, false);
    assert.match(recorded.reason, /简单单击白名单/);
  }
});

test('whale41 calibration keeps the independent manual sand-trap and whale42 ground observations', () => {
  const target = species('深蓝鲸');
  const trap = catalog.skills.find(row => row.name === '鸣沙陷阱');
  const ground = catalog.skills.find(row => row.name === '地刺');
  const profile = { spiritId: species('罗隐').id, level: 60, awakening: 2,
    panel: { hp: 403, physicalAttack: 312, magicalAttack: 136, physicalDefense: 183, magicalDefense: 137, speed: 176 } };
  // The displayed124 is an observed input, not a recovered rule38 branch.
  const sand = previewMatchup({ targetId: target.id, level: 41, profile, skillIds: [trap.id],
    skillOverrides: { [trap.id]: { displayedPower: 124 } } }, catalog).outgoing[0];
  const neutralDefense = natureFor(PD, 'neutral');
  const sandRow = sand.predictions.find(row => row.natureId === neutralDefense.id);
  assert.equal(sand.displayedPower, 124);
  assert.equal(sandRow.damage, 187);
  assert.equal(sandRow.wildStatEvidence.kind, 'source-fit');
  assert.equal(sandRow.defenderDefense, 186);
  const next = previewMatchup({ targetId: target.id, level: 42,
    profile: { ...profile, awakening: 5 }, skillIds: [ground.id] }, catalog).outgoing[0];
  const nextRow = next.predictions.find(row => row.upStat === 'magicalAttack' && row.downStat === PD);
  assert.equal(nextRow.damage, 296);
  assert.equal(formatGamePercent(nextRow.remainingPercent), 43);
  assert.equal(nextRow.wildStatEvidence.kind, 'source-fit');
  assert.equal(nextRow.defenderDefense, 171);
});

test('whale rounded fit replays the independent levels and both defenses without changing the damage core', () => {
  const samples = [
    ['深蓝鲸', 41, PD, 'neutral', 192, 272 * 1.8, 456],
    ['深蓝鲸', 41, MD, 'neutral', 181, 160, 126],
    ['深蓝鲸', 41, MD, 'neutral', 181, 360, 285],
    ['深蓝鲸', 42, PD, 'neutral', 312, 180, 269],
    ['深蓝鲸', 42, PD, 'up', 312, 60.5, 82],
    ['深蓝鲸', 42, PD, 'up', 312, 121, 165],
    ['深蓝鲸', 42, PD, 'up', 312, 198, 270],
    ['深蓝鲸', 42, PD, 'down', 312, 50 * 1.8, 148],
    ['深蓝鲸', 43, PD, 'neutral', 312 * 1.1, 180, 294],
    ['深蓝鲸', 43, PD, 'neutral', 312 * 1.1, 100 * .4 * 1.8, 117],
    ['深蓝鲸', 43, PD, 'neutral', 312 * 1.1, 300, 491],
    ['深蓝鲸', 43, MD, 'neutral', 181 * 1.1, 160, 136],
    ['深蓝鲸', 43, MD, 'neutral', 181 * 1.1, 360, 308],
  ];
  for (const sample of samples) assert.equal(replay(sample), sample[6], sample.join('/'));
});

test('native rounded stage rules preserve confirmed physical observations', () => {
  const samples = [
    ['可爱猿', 41, PD, 'neutral', 312, 100, 103],
    ['可爱猿', 41, PD, 'neutral', 312, 200, 206],
    ['可爱猿', 41, PD, 'neutral', 312, 110, 113],
    ['可爱猿', 41, PD, 'neutral', 312, 396 * 1.8, 735],
    ['可爱猿', 42, PD, 'neutral', 312, 60.5, 61],
    ['伊雷龙', 41, PD, 'down', 312, 180, 399],
    ['伊雷龙', 41, PD, 'down', 312, 50 * 1.8, 199],
    ['伊雷龙', 42, PD, 'up', 312, 180, 333],
    ['伊雷龙', 42, PD, 'up', 312, 40 * 1.8, 133],
    ['伊雷龙', 41, PD, 'up', 312, 180, 335],
    ['伊雷龙', 41, PD, 'neutral', 312, 50 * 1.8, 182],
    ['伊雷龙', 41, PD, 'neutral', 312, 180, 364],
    ['伊雷龙', 41, PD, 'neutral', 312, 55, 111],
    // Display power already includes enemy guard dice; do not multiply D again.
    ['锤头鹳', 43, PD, 'neutral', 312, 44, 77],
    ['锤头鹳', 43, PD, 'neutral', 312, 40 * 1.8, 127],
    // Keep the fractional value behind the displayed 123, rather than flooring.
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
    // Earlier guessed A176 is not rewritten to the later observed A181.
    ['可爱猿', 42, MD, 'neutral', 176, 176, 125, 122],
    ['伊雷龙', 41, MD, 'down', 176, 160, 157, 153],
    ['小翼龙', 42, MD, 'down', 176, 160 / 1.3, 142, 138],
    // Stage3 is now extended to both defenses. Keep the original A176 inputs
    // and observed158/481 rather than silently changing them toA181.
    ['锤头鹳', 43, MD, 'neutral', 176, 128, 158, 154],
    ['锤头鹳', 43, MD, 'neutral', 176, 90 * 3 * 1.8 / 1.25, 481, 467],
    // Original handoff assumed A176. Keep that input and its mismatch visible.
    ['深蓝鲸', 42, MD, 'neutral', 176, 176, 138, 134],
  ];
  for (const sample of samples) {
    assert.equal(replay(sample), sample[7], sample.join('/'));
    assert.notEqual(sample[6], sample[7]);
  }
  // The later Dimo panel is181. This explains138 conditionally, without
  // silently rewriting the original A176 observation above.
  assert.equal(replay(['深蓝鲸', 42, MD, 'neutral', 181, 176]), 138);
});

test('stage3 rounded formula replays the confirmed bird magic sample and conditional cross-checks', () => {
  const samples = [
    // Confirmed41-level MD-up; the heat-sand extra correction remainsK1.8.
    ['噼啪鸟', 41, MD, 'up', 181, 160 * 1.8, 317],
    // Their43-level/nature and F's fire-cut identification remain assumptions.
    ['噼啪鸟', 43, MD, 'neutral', 181, 160 * 1.8, 340],
    ['噼啪鸟', 43, PD, 'neutral', 312, 100, 204],
    // Only a conditional A181 replay, not a replacement of the oldA176 record.
    ['锤头鹳', 43, MD, 'neutral', 181, 128, 158],
    ['锤头鹳', 43, MD, 'neutral', 181, 90 * 3 * 1.8 / 1.25, 481],
  ];
  for (const sample of samples) assert.equal(replay(sample), sample[6], sample.join('/'));
});

test('unmeasured pigeon and sea-anemone use their own native race and package strength stage', () => {
  const target = species('公平鸽');
  assert.equal(target.wildStrengthStage, 3);
  assert.equal(target.wildDefenseRaceStats.sourcePetbaseId, 3499);
  for (const [ownName, moveName, expectedDamage, stat] of [
    ['罗隐', '火焰切割', 149, PD], ['迪莫', '光球', 139, MD],
  ]) {
    const move = catalog.skills.find(row => row.name === moveName);
    const panel = ownName === '罗隐'
      ? { hp: 403, physicalAttack: 312, magicalAttack: 136, physicalDefense: 183, magicalDefense: 137, speed: 176 }
      : { hp: 425, physicalAttack: 138, magicalAttack: 181, physicalDefense: 175, magicalDefense: 175, speed: 223 };
    const result = previewMatchup({ targetId: target.id, level: 42,
      profile: { spiritId: species(ownName).id, level: 60, awakening: 5, panel },
      ownTrait: { stacks: 0, active: false }, skillIds: [move.id] }, catalog);
    const row = result.outgoing[0].predictions.find(row => row.natureId === natureFor(stat, 'neutral').id);
    assert.equal(row.defenderDefense, 188);
    assert.equal(row.damage, expectedDamage);
    assert.equal(row.wildStatEvidence.kind, 'stage-extrapolation');
    assert.equal(row.wildStatEvidence.sampleScopeMatches, false);
  }
  // Its visible first evolution still has package strength stage2.
  const anemone = species('加油海葵');
  assert.equal(anemone.wildStrengthStage, 2);
  for (const stat of [PD, MD]) {
    const mapping = anemone.wildDefenseRaceStats;
    assert.equal(mapping[stat], anemone.raceStats[stat]);
    assert.equal(calculateWildDefense(mapping[stat], 42, natureFor(stat, 'neutral'), stat,
      anemone.wildStrengthStage, mapping.sourcePetbaseId), Math.round((Math.round(10 + mapping[stat] * .92) + 11) * 1.955));
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
  assert.equal(calculateWildDefense(73, 42, nature, PD, 2, 3209), calculateWildDefense(73, 42, nature, PD, 2));
});

test('defense rounds base, nature and final stages separately and rejects missing mappings', () => {
  const nature = natureFor(PD, 'up');
  assert.equal(calculateWildDefense(69, 41, nature, PD, 2), Math.round((Math.round(Math.round(10 + 69 * .91) * 110 / 100) + 11) * 1.955));
  assert.deepEqual([41, 42, 43].map(level => calculateWildDefense(69, level, nature, PD, 2)), [178, 178, 180]);
  assert(Number.isInteger(calculateWildDefense(69, 41, nature, PD, 2)));
  assert.throws(() => calculateWildDefense(undefined, 41, nature, PD, 2), /防御种族值/);
  assert.throws(() => calculateWildDefense(69, 41, nature, PD, null), /强度阶段/);
  assert.throws(() => calculateWildDefense(69, 0, nature, PD, 2), /野怪等级/);
  assert.throws(() => calculateWildDefense(69, 41, nature, 'physicalAttack', 2), /物防或魔防/);
});

test('catalog preserves package strength stage separately from displayed evolution rank', () => {
  for (const [name, stage, id, physical, magical] of [
    ['可爱猿', 1, 3083, 86, 67], ['伊雷龙', 2, 3211, 55, 79],
    ['小翼龙', 2, 3209, 73, 63], ['深蓝鲸', 3, 3381, 125, 141], ['锤头鹳', 3, 3069, 101, 81],
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
  // Attack provenance remains separate; defense now uses the selected form.
  assert.equal(species('乐乐鲨').wildAttackRaceStats.physicalAttack, 94);
  assert.equal(species('乐乐鲨').wildDefenseRaceStats.physicalDefense, species('乐乐鲨').raceStats.physicalDefense);
});

test('defense exporter reads the current form despite different future branches', () => {
  const smallCatalog = { meta: {}, spirits: [{ id: 'a', name: 'A', raceStats: { physicalDefense: 55, magicalDefense: 79 } }] };
  const attack = { meta: {}, bySpiritId: { a: { sourcePetbaseId: 1, attackPetbaseId: 2, attackPetbaseIds: [2, 3] } }, missing: {} };
  const rows = [{ id: 1, name: 'A', stength_stage: 2, phy_defence_race: 55, spe_defence_race: 79 },
    { id: 2, name: 'B', stength_stage: 3, phy_defence_race: 69, spe_defence_race: 99 },
    { id: 3, name: 'C', stength_stage: 3, phy_defence_race: 70, spe_defence_race: 99 }];
  assert.equal(buildWildDefenseRaceData(smallCatalog, attack, rows).bySpiritId.a.physicalDefense, 55);
  rows[2].phy_defence_race = 69;
  assert.equal(buildWildDefenseRaceData(smallCatalog, attack, rows).bySpiritId.a.physicalDefense, 55);
  delete rows[0].spe_defence_race;
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
  assert.match(result.outgoing[0].reason, /当前形态的双防资料缺失/);
  assert.deepEqual(result.outgoing[0].predictions, []);
  assert.deepEqual(result.incoming, baseline.incoming);
  assert.deepEqual(result.targetHpByNature, baseline.targetHpByNature);
  const observation = { id: 'outgoing', profileId: 'own', skillId: fire.id,
    direction: 'outgoing', damage: 110, context: 'clean', reduction: 1 };
  const record = predictObservation({ targetId: target.id, level: 43, profiles: [profile] },
    observation, natureFor(PD, 'neutral'), absent);
  assert.equal(record.status, 'blocked');
  assert.match(record.reason, /当前形态的双防资料缺失/);
});
