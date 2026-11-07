import { test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolveWildTarget } from '../../public/tools/s5-nature/wild-forms.mjs';
import { previewMatchup } from '../../public/tools/s5-nature/matchup-preview.mjs';
import { predictObservation, solve } from '../../public/tools/s5-nature/engine.mjs';

const catalog = JSON.parse(readFileSync('public/tools/s5-nature/data/catalog.json', 'utf8'));
const species = name => catalog.spirits.find(row => row.name === name);
const skill = name => catalog.skills.find(row => row.name === name);
const inputFor = target => ({ targetId: target.id, level: 42,
  profile: { id: 'own', spiritId: species('迪莫').id, level: 60, awakening: 0,
    panel: { hp: 403, physicalAttack: 312, magicalAttack: 176, physicalDefense: 216, magicalDefense: 163, speed: 143 } },
  skillIds: [skill('猛烈撞击').id], incomingSkillIds: [skill('抓挠').id, skill('甩水').id] });

test('Lele Shark works without a branch and uses its own 94/37 race stats at stage2', () => {
  const target = species('乐乐鲨');
  expect(target.wildStatForms).toBeUndefined();
  const view = previewMatchup({ ...inputFor(target), level: 'all' }, catalog);
  expect(view.targetLevels).toEqual([41, 42, 43]);
  for (const entry of [...view.outgoing, ...view.incomingList]) expect(entry.status).toBe('estimated');
  const neutral = catalog.natures.find(row => row.upStat === 'hp' && row.downStat === 'speed');
  const attackStats = view.incomingList.map(entry => entry.predictions
    .filter(row => row.natureId === neutral.id).map(row => row.attackerStat));
  expect(attackStats).toEqual([[257, 257, 259], [132, 132, 132]]);
  expect(view.incomingList.every(entry => entry.predictions.length === 90)).toBe(true);
});

test('defense branches change only outgoing damage while incoming and HP stay identical', () => {
  const target = species('书魔虫');
  const views = target.wildStatForms.map(form => previewMatchup({
    ...inputFor(target), level: 'all', wildStatFormId: form.id,
  }, catalog));
  expect(views).toHaveLength(2);
  expect(views[0].outgoing[0].predictions.map(row => row.damage))
    .not.toEqual(views[1].outgoing[0].predictions.map(row => row.damage));
  for (let i = 0; i < 2; i++) expect(views[0].incomingList[i].predictions.map(row => row.damage))
    .toEqual(views[1].incomingList[i].predictions.map(row => row.damage));
  expect(views[0].targetHpByLevel).toEqual(views[1].targetHpByLevel);
  const resolved = resolveWildTarget(target, target.wildStatForms[0].id);
  expect(resolved.raceStats).toBe(target.raceStats);
  expect(resolved.wildAttackRaceStats).toBe(target.wildAttackRaceStats);
  expect(resolved.wildStrengthStage).toBe(target.wildStrengthStage);
});

test('unselected defenses block only dependent observations, leaving attack and HP usable', () => {
  const target = species('书魔虫'), input = inputFor(target);
  input.incomingSkillIds[0] = skill('星星撞击').id;
  const view = previewMatchup(input, catalog);
  expect(view.outgoing[0].status).toBe('unsupported');
  expect(view.outgoing[0].reason).toMatch(/防御分支/);
  expect(view.incomingList.every(row => row.status === 'estimated')).toBe(true);
  expect(view.targetHpRange.min).toBeGreaterThan(0);
  const nature = catalog.natures.find(row => row.upStat === 'physicalAttack' && row.downStat === 'speed');
  const prediction = view.incomingList[0].predictions.find(row => row.natureId === nature.id);
  const incoming = { id: 'incoming', skillId: input.incomingSkillIds[0], profileId: 'own',
    direction: 'incoming', damage: prediction.damage, context: 'clean', reduction: 1 };
  const session = { targetId: target.id, level: 42, profiles: [input.profile], observations: [incoming] };
  expect(predictObservation(session, incoming, nature, catalog).compatible).toBe(true);
  expect(solve(session, catalog).observations[0].status).toBe('used');
  const outgoing = { ...incoming, id: 'outgoing', direction: 'outgoing' };
  expect(predictObservation(session, outgoing, nature, catalog).reason).toMatch(/防御分支/);
  const hp = { id: 'hp', direction: 'hp', damage: 0, context: 'clean',
    beforePercent: 100, afterPercent: 100, percentDigits: 0, percentMode: 'game' };
  expect(predictObservation(session, hp, nature, catalog).status).toBe('used');
});

test('saved defense selections are shared by preview and observation replay', () => {
  const target = species('书魔虫'), input = inputFor(target);
  input.wildStatFormId = target.wildStatForms[0].id;
  const preview = previewMatchup(input, catalog);
  const nature = catalog.natures.find(row => row.upStat === 'hp' && row.downStat === 'speed');
  const predicted = preview.outgoing[0].predictions.find(row => row.natureId === nature.id);
  const observation = { id: 'one', skillId: input.skillIds[0], profileId: 'own', direction: 'outgoing',
    damage: predicted.damage, context: 'clean', reduction: 1 };
  const session = JSON.parse(JSON.stringify({ targetId: target.id, wildStatFormId: input.wildStatFormId,
    level: 42, profiles: [input.profile], observations: [observation] }));
  const replay = predictObservation(session, observation, nature, catalog);
  expect(replay.status).toBe('used');
  expect(replay.damage).toBe(predicted.damage);
  expect(replay.compatible).toBe(true);
  expect(replay.wildStatFormId).toBe(input.wildStatFormId);
  const other = predictObservation({ ...session, wildStatFormId: target.wildStatForms[1].id }, observation, nature, catalog);
  expect(other.status).toBe('used');
  expect(other.compatible).toBe(false);
});

test('all confirmed targets calculate both directions once necessary defenses are selected', () => {
  const available = catalog.spirits.filter(row => row.wildDataStatus !== 'unavailable');
  expect(available).toHaveLength(666);
  for (const target of available) {
    for (const form of target.wildStatForms?.length ? target.wildStatForms : [null]) {
      const view = previewMatchup({ ...inputFor(target), wildStatFormId: form?.id }, catalog);
      const label = `${target.name}/${form?.name ?? 'unique'}`;
      for (const entry of [...view.outgoing, ...view.incomingList]) {
        expect(entry.status, `${label}/${entry.skillName}`).toBe('estimated');
        expect(entry.predictions.every(row => Number.isSafeInteger(row.damage) && row.damage >= 0), label).toBe(true);
      }
    }
  }
});

test('stale, cross-target and unavailable selections never borrow branch statistics', () => {
  const target = species('书魔虫');
  for (const id of ['petbase-3806', 'petbase-missing', 3806]) {
    const result = previewMatchup({ ...inputFor(target), wildStatFormId: id }, catalog);
    expect(result.status).toBe('unsupported');
    expect(result.reason).toMatch(/防御分支/);
  }
  expect(() => resolveWildTarget(species('乐乐鲨'), target.wildStatForms[0].id)).toThrow(/不属于当前野怪/);
  for (const target of catalog.spirits.filter(row => row.wildDataStatus === 'unavailable')) {
    expect(previewMatchup(inputFor(target), catalog).status, target.name).toBe('unsupported');
  }
});
