import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { completeS5WildRaces } from '../../scripts/complete-s5-wild-races.mjs';

const read = path => JSON.parse(readFileSync(path, 'utf8'));
const catalog = read('public/tools/s5-nature/data/catalog.json');
const attack = read('public/tools/s5-nature/data/wild-attack-races.json');
const defense = read('public/tools/s5-nature/data/wild-defense-races.json');
const evidence = read('data/reviewed/s5-wild-race-completion-20261107.json');
const byId = new Map(catalog.spirits.map(spirit => [spirit.id, spirit]));
const byName = name => catalog.spirits.find(spirit => spirit.name === name);
const statFields = { hp: 'hp_max_race', physicalAttack: 'phy_attack_race', magicalAttack: 'spe_attack_race',
  physicalDefense: 'phy_defence_race', magicalDefense: 'spe_defence_race', speed: 'speed_race' };
function reviewedPackage() {
  return evidence.packageRecords.map(row => ({ id: row.id, name: row.name, stage: row.stage,
    stength_stage: row.strengthStage, legal_petbase: row.legalPetbase,
    evolution_pet_id: row.evolutionPetbaseIds, bosspetbase_id_arry: row.bossPetbaseIds,
    degenerate_pet_id: row.degeneratePetbaseId,
    ...Object.fromEntries(Object.entries(statFields).map(([key, field]) => [field, row.raceStats[key]])) }));
}

test('all 666 confirmed targets have paired usable races; the 28 placeholders stay missing', () => {
  assert.equal(catalog.spirits.length, 694);
  assert.equal(catalog.spirits.filter(spirit => spirit.wildStatForms?.length).length, 0);
  assert.equal(Object.keys(attack.bySpiritId).length, 666);
  assert.equal(Object.keys(defense.bySpiritId).length, 666);
  assert.equal(Object.keys(attack.candidatesBySpiritId).length, 26);
  assert.equal(Object.keys(defense.candidatesBySpiritId).length, 0);
  for (const mapping of [attack, defense]) {
    assert.equal(mapping.meta.counts.available, 666);
    assert.equal(Object.keys(mapping.missing).length, 28);
    assert.equal(Object.values(mapping.missing).filter(row => row.code === 'incomplete-race-stats').length, 27);
    assert(!Object.values(mapping.missing).some(row => row.code.startsWith('ambiguous-')));
  }
  const available = catalog.spirits.filter(spirit => spirit.wildDataStatus !== 'unavailable');
  assert.equal(available.length, 666);
  for (const spirit of available) {
    assert(attack.bySpiritId[spirit.id] || attack.candidatesBySpiritId[spirit.id], spirit.name);
    assert(defense.bySpiritId[spirit.id], spirit.name);
    assert([1, 2, 3].includes(spirit.wildStrengthStage), spirit.name);
    const mapped = defense.bySpiritId[spirit.id];
    assert.equal(mapped.defensePetbaseId, mapped.sourcePetbaseId, spirit.name);
    assert.equal(mapped.physicalDefense, spirit.raceStats.physicalDefense, spirit.name);
    assert.equal(mapped.magicalDefense, spirit.raceStats.magicalDefense, spirit.name);
    assert.equal(mapped.resolution, 'selected-form', spirit.name);
  }
});

test('legacy branch IDs preserve provenance while both attacks and defenses use the source form', () => {
  for (const branch of evidence.branches) {
    const spirit = byId.get(branch.spiritId);
    const choices = attack.candidatesBySpiritId[spirit.id];
    assert.equal(choices.length, branch.forms.length);
    assert.equal(spirit.wildStrengthStage, branch.source.strengthStage);
    assert.equal(new Set(choices.map(form => form.id)).size, branch.forms.length);
    assert.equal(new Set(choices.map(form => form.name)).size, branch.forms.length);
    for (const form of choices) {
      const source = branch.forms.find(row => form.id === `petbase-${row.id}`);
      assert(source, `${spirit.name}/${form.id}`);
      assert.equal(source.strengthStage, 3);
      assert.equal(form.attackRaceStats.attackPetbaseId, branch.source.id);
      assert.equal(form.defenseRaceStats.defensePetbaseId, branch.source.id);
      assert.equal(form.attackRaceStats.sourcePetbaseId, branch.source.id);
      assert.equal(form.defenseRaceStats.sourcePetbaseId, branch.source.id);
      for (const key of ['physicalAttack', 'magicalAttack']) assert.equal(form.attackRaceStats[key], branch.source.raceStats[key]);
      for (const key of ['physicalDefense', 'magicalDefense']) assert.equal(form.defenseRaceStats[key], branch.source.raceStats[key]);
    }
    assert.deepEqual(spirit.wildAttackRaceStats, attack.bySpiritId[spirit.id]);
    assert.equal(spirit.wildStatForms, undefined);
    assert.deepEqual(spirit.legacyWildStatFormIds, choices.map(form => form.id));
    assert.deepEqual(spirit.wildDefenseRaceStats, defense.bySpiritId[spirit.id]);
  }
});

test('Lele Shark and anemone use source-form attack without requiring equal-defense branches', () => {
  const shark = byName('乐乐鲨');
  assert.equal(shark.wildStatForms, undefined);
  assert.deepEqual([shark.wildAttackRaceStats.physicalAttack, shark.wildAttackRaceStats.magicalAttack], [94, 37]);
  assert.equal(shark.wildAttackRaceStats.attackPetbaseId, 3805);
  assert.equal(shark.wildStrengthStage, 2);
  assert.deepEqual(shark.wildDefenseRaceStats, defense.bySpiritId[shark.id]);
  assert.equal(shark.wildDefenseRaceStats.physicalDefense, shark.raceStats.physicalDefense);
  assert.equal(shark.wildDefenseRaceStats.magicalDefense, shark.raceStats.magicalDefense);
  assert.equal(shark.wildDefenseRaceStats.defensePetbaseId, 3805);
  assert.equal(defense.candidatesBySpiritId[shark.id], undefined);
  const anemone = byName('加油海葵');
  assert.equal(anemone.wildStatForms, undefined);
  assert.deepEqual(anemone.wildDefenseRaceStats, defense.bySpiritId[anemone.id]);
});

test('black and white chess use distinct initial races without selecting a future defense branch', () => {
  for (const color of ['白子', '黑子']) {
    const spirit = byName(`棋棋（${color}）`);
    assert.equal(spirit.wildStatForms, undefined);
    assert.equal(spirit.legacyWildStatFormIds.length, 4);
    assert(attack.candidatesBySpiritId[spirit.id].every(form => form.name.endsWith(`（${color}）`)));
    assert.deepEqual([spirit.wildDefenseRaceStats.physicalDefense, spirit.wildDefenseRaceStats.magicalDefense],
      color === '白子' ? [70, 56] : [67, 53]);
  }
});

test('four Bouncing Fruit bosses use unique ordinary parents while retaining their source strength 1', () => {
  assert.equal(evidence.bossParents.length, 4);
  assert.deepEqual(evidence.bossParents.map(row => [row.source.id, row.parent.id]), [
    [5004, 3019], [5033, 3303], [5034, 3304], [5035, 3305],
  ]);
  for (const row of evidence.bossParents) {
    const spirit = byId.get(row.spiritId);
    assert.equal(spirit.wildStrengthStage, 1);
    assert.equal(defense.strengthStageBySpiritId[row.spiritId], 1);
    assert(row.parent.bossPetbaseIds.includes(row.source.id));
    assert.deepEqual(row.source.raceStats, row.parent.raceStats);
    assert.equal(spirit.wildAttackRaceStats.attackPetbaseId, row.source.id);
    assert.equal(spirit.wildDefenseRaceStats.defensePetbaseId, row.source.id);
    assert.equal(spirit.wildDefenseRaceStats.sourcePetbaseId, row.source.id);
    assert.equal(spirit.wildAttackRaceStats.resolution, 'boss-parent-stage3');
    assert.equal(spirit.wildDefenseRaceStats.resolution, 'selected-form');
    assert.equal(spirit.wildDefenseRaceStats.ordinaryParentPetbaseId, row.parent.id);
  }
});

test('the old all-100 Saint Dragon Abu remains explicitly unavailable along with unreleased entries', () => {
  const pending = catalog.spirits.filter(spirit => spirit.wildDataStatus === 'unavailable');
  assert.equal(pending.length, 28);
  assert.equal(pending.filter(spirit => spirit.sourceCategory === '未开放').length, 27);
  const placeholder = byName('圣龙阿布');
  assert.equal(placeholder.previewIdentity.raceStatsPlaceholder, true);
  assert(Object.keys(statFields).every(key => placeholder.raceStats[key] === 100));
  for (const spirit of pending) {
    assert(attack.missing[spirit.id] && defense.missing[spirit.id]);
    assert.equal(spirit.wildAttackRaceStats, null);
    assert.equal(spirit.wildDefenseRaceStats, null);
    assert(!spirit.wildStatForms?.length);
  }
});

test('the completion regenerates identically from portable reviewed records without changing its inputs', () => {
  const originals = structuredClone({ catalog, attack, defense });
  const completed = completeS5WildRaces(catalog, attack, defense, reviewedPackage());
  assert.deepEqual(completed, { catalog, attack, defense, evidence });
  assert.deepEqual({ catalog, attack, defense }, originals);
  assert.equal(attack.meta.packageDataPath, 'PETBASE_CONF.json');
  assert(!/[A-Z]:[\\/]/u.test(JSON.stringify(evidence)));
});

test('the generator refuses an unrelated complete form inserted into a branch candidate list', () => {
  const altered = structuredClone(attack), rows = reviewedPackage();
  const shark = byName('乐乐鲨');
  const unrelated = { ...rows.find(row => row.id === 3806), id: 999999, name: '无关形态' };
  rows.push(unrelated);
  const form = altered.candidatesBySpiritId[shark.id][0];
  form.id = 'petbase-999999';
  form.attackRaceStats.attackPetbaseId = 999999;
  form.defenseRaceStats.defensePetbaseId = 999999;
  assert.throws(() => completeS5WildRaces(catalog, altered, defense, rows), /ordinary evolution graph/u);
});

test('the generator refuses an ambiguous boss parent instead of selecting the first match', () => {
  const rows = reviewedPackage();
  rows.push({ ...rows.find(row => row.id === 3019), id: 999999 });
  assert.throws(() => completeS5WildRaces(catalog, attack, defense, rows), /one exact ordinary stage-3 parent/u);
});
