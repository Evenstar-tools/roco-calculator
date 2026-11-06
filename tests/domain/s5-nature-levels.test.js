import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { previewMatchup } from '../../public/tools/s5-nature/matchup-preview.mjs';
import { splitNatureConditions } from '../../public/tools/s5-nature/matchup-ui.mjs';
import { solve, predictObservation } from '../../public/tools/s5-nature/engine.mjs';
import { analyzeHealth } from '../../public/tools/s5-nature/calibration.mjs';
import { formatGamePercent } from '../../public/tools/s5-nature/hp-inverse.mjs';

const catalog = JSON.parse(readFileSync('public/tools/s5-nature/data/catalog.json', 'utf8'));
const species = name => catalog.spirits.find(row => row.name === name);
const skill = name => catalog.skills.find(row => row.name === name);
const fire = skill('火焰切割');
const profile = { spiritId: species('罗隐').id, level: 60, awakening: 5,
  panel: { hp: 403, physicalAttack: 312, magicalAttack: 136, physicalDefense: 183, magicalDefense: 170, speed: 143 } };
const previewInput = level => ({ targetId: species('深蓝鲸').id, level, profile,
  skillIds: [fire.id], incomingSkillIds: [skill('水弹枪').id] });
const values = (rows, key) => [...new Set(rows.map(row => row[key]))];
const lifeRows = preview => preview.outgoing[0].predictions.filter(row => row.upStat === 'hp');

test('single level keeps exact nature conditions instead of treating the penalty as a damage range', () => {
  const preview = previewMatchup(previewInput(41), catalog);
  const [base, down] = splitNatureConditions(lifeRows(preview), fire);
  assert.equal(base.condition, 'base');
  assert.deepEqual(values(base.predictions, 'damage'), [135]);
  assert.deepEqual(values(base.predictions, 'hpMax'), [554]);
  assert.deepEqual([...new Set(base.predictions.map(row => formatGamePercent(row.remainingPercent)))], [76]);
  assert.equal(down.condition, 'down');
  assert.equal(down.label, '物防↓');
  assert.deepEqual(values(down.predictions, 'damage'), [149]);
  assert.deepEqual(down.predictions.map(row => row.natureName), ['忧郁']);
  assert.deepEqual(down.predictions.map(row => formatGamePercent(row.remainingPercent)), [74]);
  assert(preview.outgoing[0].predictions.every(row => row.targetLevel === 41));
});

test('all levels is the exact union of three independent previews, preserving dice, shiny HP and own panel', () => {
  const input = { ...previewInput('all'), targetShiny: true, targetDiceEffects: { hpMultiplier: 1.3 }, ownDiceEffects: { physicalAttackMultiplier: 1.2 } };
  const all = previewMatchup(input, catalog);
  const singles = [41, 42, 43].map(level => previewMatchup({ ...input, level }, catalog));
  assert.deepEqual(all.targetLevels, [41, 42, 43]);
  assert.deepEqual(all.outgoing[0].predictions, singles.flatMap(result => result.outgoing[0].predictions));
  assert.deepEqual(all.incomingList[0].predictions, singles.flatMap(result => result.incomingList[0].predictions));
  assert.deepEqual(all.targetHpByLevel, singles.flatMap(result => result.targetHpByLevel));
  for (const key of ['neutral', 'up', 'down']) {
    assert.deepEqual(all.targetHpByNature[key], { min: Math.min(...singles.map(row => row.targetHpByNature[key])), max: Math.max(...singles.map(row => row.targetHpByNature[key])) });
  }
  assert.deepEqual(all.ownPanel, singles[0].ownPanel);
  assert.equal(all.ownPanel.hp, 403);
  assert(all.incomingList[0].predictions.every(row => row.hpMax === 403));
});

test('only the all-level selection aggregates differences within the same nature condition', () => {
  const expected = [[41, 135, 149], [42, 134, 148], [43, 133, 146]];
  for (const [level, normal, reduced] of expected) {
    const preview = previewMatchup(previewInput(level), catalog);
    const groups = splitNatureConditions(lifeRows(preview), fire);
    assert.deepEqual(groups.map(group => values(group.predictions, 'damage')), [[normal], [reduced]]);
    for (const row of [preview.outgoing[0], preview.incomingList[0]]) {
      const incoming = row.direction === 'incoming';
      const columns = incoming ? ['physicalAttack', 'magicalAttack'] : ['hp', 'physicalDefense', 'magicalDefense'];
      const rowSkill = catalog.skills.find(item => item.id === row.skillId);
      for (const upStat of columns) for (const group of splitNatureConditions(row.predictions.filter(p => p.upStat === upStat), rowSkill, incoming)) {
        assert.equal(values(group.predictions, 'damage').length, 1);
        for (const hp of values(group.predictions, 'hpMax')) {
          assert.equal(new Set(group.predictions.filter(p => p.hpMax === hp).map(p => formatGamePercent(p.remainingPercent))).size, 1);
        }
      }
    }
  }
  const groups = splitNatureConditions(lifeRows(previewMatchup(previewInput('all'), catalog)), fire);
  assert.deepEqual(values(groups[0].predictions, 'damage'), [135, 134, 133]);
  assert.deepEqual(values(groups[1].predictions, 'damage'), [149, 148, 146]);
});

// Neutral single-hit fixtures use explicitly supplied stage-3 attacks to isolate
// the level term from type/trait mechanics.
const recordCatalog = { natures: catalog.natures,
  spirits: [{ id: 'target', name: 'Target', types: ['x'], wildAttackRaceStats: { physicalAttack: 116, magicalAttack: 92 }, raceStats: { hp: 125, physicalAttack: 116, magicalAttack: 92, physicalDefense: 88, magicalDefense: 79, speed: 55 } }, { id: 'own', types: ['x'] }],
  skills: [{ id: 'p', supported: true, category: 'physical', basePower: 100, type: 'x' }, { id: 'm', supported: true, category: 'magical', basePower: 100, type: 'x' }],
  learnsets: [{ spiritId: 'target', skillIds: ['p', 'm'] }], typeChart: { types: ['x'], matrix: [[1]] } };
const recordProfile = { ...profile, id: 'profile', spiritId: 'own', awakening: 0,
  panel: { ...profile.panel, physicalDefense: 180, magicalDefense: 137 } };
const recordSession = { targetId: 'target', level: 'all', profiles: [recordProfile], observations: [] };
const incoming = (id, damage) => ({ id, skillId: id, profileId: 'profile', direction: 'incoming', damage, context: 'clean', reduction: 1 });

test('incoming damage uses each wild attacker level and does not splice levels between observations', () => {
  const nature = catalog.natures.find(row => row.id === 'bold');
  const at41 = predictObservation({ ...recordSession, level: 41 }, incoming('p', 133), nature, recordCatalog);
  const at42 = predictObservation({ ...recordSession, level: 42 }, incoming('p', 137), nature, recordCatalog);
  assert.equal(at41.damage, 133);
  assert.equal(at42.damage, 137);
  const preview = previewMatchup({ targetId: 'target', level: 'all', profile: recordProfile, incomingSkillIds: ['p'] }, recordCatalog);
  assert.equal(preview.incoming.predictions.find(row => row.targetLevel === 41 && row.natureId === nature.id).damage, 133);
  assert.equal(preview.incoming.predictions.find(row => row.targetLevel === 42 && row.natureId === nature.id).damage, 137);
  const first = solve({ ...recordSession, observations: [incoming('p', 133)] }, recordCatalog);
  const second = solve({ ...recordSession, observations: [incoming('m', 136)] }, recordCatalog);
  assert(first.candidates.some(row => row.nature.id === nature.id && row.levels.includes(41)));
  assert(second.candidates.some(row => row.nature.id === nature.id && row.levels.includes(42)));
  // Physical 133 identifies level 41, while magical 136 identifies level 42.
  // Matching the same nature at different levels must not form one encounter.
  assert.deepEqual(first.candidates.find(row => row.nature.id === nature.id).levels, [41]);
  assert.deepEqual(second.candidates.find(row => row.nature.id === nature.id).levels, [42]);
  const combined = solve({ ...recordSession, observations: [incoming('p', 133), incoming('m', 136)] }, recordCatalog);
  assert.equal(combined.modelStatus, 'conflict');
  assert.deepEqual(combined.candidates, []);
  assert.equal(combined.observations.at(-1).remainingCount, 0);
  assert(combined.observations.every(row => row.predictions.every(item => [41, 42, 43].includes(item.targetLevel))));
});

test('all-level record candidates are deduplicated with explicit matching levels and panels', () => {
  const empty = solve(recordSession, recordCatalog);
  assert.equal(empty.candidates.length, 30);
  assert(empty.candidates.every(row => row.levels.join(',') === '41,42,43' && row.panels.length === 3));
  const result = solve({ ...recordSession, observations: [incoming('p', 133)] }, recordCatalog);
  assert.equal(new Set(result.candidates.map(row => row.nature.id)).size, result.candidates.length);
  for (const candidate of result.candidates) assert.deepEqual(candidate.panels.map(row => row.level), candidate.levels);
  assert(!result.warnings.some(warning => warning.startsWith('没有性格同时匹配')));
});

test('all-level health calibration retains the actual level matching measured HP', () => {
  const observation = { id: 'full-loss', direction: 'hp', damage: 554, beforeFull: true, beforePercent: 100, afterPercent: 0, percentDigits: 0, percentMode: 'game', context: 'clean', defeated: true, reduction: 1 };
  const session = { targetId: species('深蓝鲸').id, level: 'all', profiles: [], observations: [observation] };
  const result = solve(session, catalog);
  assert.equal(result.candidates.length, 5);
  assert(result.candidates.every(row => row.nature.upStat === 'hp' && row.levels.join(',') === '41'));
  const health = analyzeHealth(session, catalog);
  assert.equal(health.naturePreview.length, 5);
  assert(health.naturePreview.every(row => row.upStat === 'hp' && row.levels.join(',') === '41' && row.hpByLevel[0].hp === 554));
});
