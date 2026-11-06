import { readFileSync } from 'node:fs';
import { expect, test, vi } from 'vitest';
import { getOwnSkillIds, resolveOwnPreset } from '../../public/tools/s5-nature/own-presets.mjs';

const read = file => JSON.parse(readFileSync(file, 'utf8'));
const catalog = read('public/tools/s5-nature/data/catalog.json');
const traits = read('public/tools/s5-nature/data/traits.json');
const library = read('public/data/presets/pvp-popular-configs.json');
const CN_KEY = 'rock-calculator.servers.cn.spirit-configs.v2';
const stats = ['hp', 'physicalAttack', 'magicalAttack', 'physicalDefense', 'magicalDefense', 'speed'];
const species = name => catalog.spirits.find(row => row.name === name);
const wolf = species('恶魔狼王');
const bundled = library.entries.find(row => row.spiritId === wolf.id);
const personal = overrides => ({ ...structuredClone(bundled), natureId: 'rash',
  skills: { four: bundled.skills.map(skillId => ({ skillId })) }, ...overrides });
const storage = value => ({ getItem: vi.fn(key => key === CN_KEY ? JSON.stringify(value) : null),
  setItem: vi.fn(), removeItem: vi.fn() });
const store = config => storage({ schemaVersion: 2, configs: { [wolf.id]: config } });
const resolve = (config, extraLibrary = library, extraTraits = traits) => resolveOwnPreset(wolf.id, catalog, extraLibrary, extraTraits, store(config));

test.each([
  ['迪莫', 'rash', ['physicalAttack', 'magicalAttack', 'speed'], ['光球', '棘突', '热砂', '超导']],
  ['罗隐', 'adamant', ['hp', 'physicalAttack', 'physicalDefense'], ['火焰切割', '地刺', '彼岸之手', '鸣沙陷阱']],
])('%s uses the exact ten-star encounter preset and four legal moves', (name, natureId, maxIvs, moveNames) => {
  const spirit = species(name);
  const local = storage({ schemaVersion: 2, configs: { [spirit.id]: { ...personal(), spiritId: spirit.id } } });
  const result = resolveOwnPreset(spirit.id, catalog, library, traits, local);
  expect(result).toMatchObject({ natureId, awakening: 5, trait: { stacks: 0, active: false } });
  expect(result.displayIvs).toEqual(Object.fromEntries(stats.map(key => [key, maxIvs.includes(key) ? 60 : 0])));
  expect(result.skillIds.map(id => catalog.skills.find(skill => skill.id === id)?.name)).toEqual(moveNames);
  expect(result.skillIds.every(id => catalog.learnsets.find(row => row.spiritId === spirit.id).skillIds.includes(id))).toBe(true);
  expect(local.getItem).not.toHaveBeenCalled();
});

test('valid local CN configuration wins and its skill objects become ordered IDs', () => {
  const result = resolve(personal());
  expect(result.natureId).toBe('rash');
  expect(result.skillIds).toEqual(bundled.skills);
  expect(result.trait.stacks).toBe(7);
  expect(result).not.toHaveProperty('awakening');
});

test.each([
  ['invalid nature', { natureId: 'unknown' }],
  ['missing IV', { displayIvs: { hp: 60 } }],
  ['out-of-range IV', { displayIvs: { ...bundled.displayIvs, hp: 61 } }],
  ['fractional IV', { displayIvs: { ...bundled.displayIvs, hp: 0.5 } }],
  ['unknown move', { skills: ['missing', ...bundled.skills.slice(1)] }],
  ['unlearnable move', { skills: [catalog.skills.find(skill => !catalog.learnsets.find(row => row.spiritId === wolf.id).skillIds.includes(skill.id)).id, ...bundled.skills.slice(1)] }],
  ['needs repair', { needsRepair: true }],
  ['wrong identity', { spiritId: species('迪莫').id }],
  ['global configuration', { serverId: 'global' }],
  ['invalid trait container', { traitValues: [] }],
])('invalid local %s falls back to the valid bundled preset', (_label, overrides) => {
  expect(resolve(personal(overrides)).natureId).toBe(bundled.natureId);
});

test('corrupt and unavailable storage fall back without any writes', () => {
  for (const local of [
    { getItem: vi.fn(() => '{broken'), setItem: vi.fn(), removeItem: vi.fn() },
    { getItem: vi.fn(() => { throw new Error('blocked'); }), setItem: vi.fn(), removeItem: vi.fn() },
    storage({ schemaVersion: 1, configs: { [wolf.id]: personal() } }),
  ]) {
    expect(resolveOwnPreset(wolf.id, catalog, library, traits, local).natureId).toBe(bundled.natureId);
    expect(local.getItem).toHaveBeenCalledWith(CN_KEY);
    expect(local.setItem).not.toHaveBeenCalled();
    expect(local.removeItem).not.toHaveBeenCalled();
  }
});

test('only the CN store is read and a Global catalog or library is not used', () => {
  const local = { getItem: vi.fn(key => key.includes('.global.') ? JSON.stringify({ schemaVersion: 2, configs: { [wolf.id]: personal() } }) : null) };
  expect(resolveOwnPreset(wolf.id, catalog, library, traits, local).natureId).toBe(bundled.natureId);
  expect(local.getItem.mock.calls).toEqual([[CN_KEY]]);
  expect(resolveOwnPreset(wolf.id, catalog, { ...library, serverId: 'global' }, traits, local)).toBeNull();
  expect(resolveOwnPreset(wolf.id, { ...catalog, meta: { ...catalog.meta, serverId: 'global' } }, library, traits, local)).toBeNull();
});

test('trait mapping only restores native controls and clamps stacks', () => {
  const traitCatalog = { traits: { [wolf.traitName]: { damage: 'applied', attacker: {
    stack: { min: 0, max: 20 }, condition: { label: '触发' },
  } } } };
  expect(resolve(personal({ traitValues: { 'trait.traitStacks.test': 99.8, 'trait.traitActivated.test': true,
    'trait.traitEffect.test': 999 } }), library, traitCatalog).trait).toEqual({ stacks: 20, active: true });
  expect(resolve(personal({ traitValues: { 'trait.traitStacks.a': 7, 'trait.traitStacks.b': 8,
    'trait.traitActivated.test': 'true' } }), library, traitCatalog).trait).toEqual({ stacks: 0, active: false });
  expect(resolve(personal({ traitValues: { 'trait.traitStacks.test': 7, 'trait.traitActivated.test': true } }), library,
    { traits: { [wolf.traitName]: { damage: 'none' } } }).trait).toEqual({ stacks: 0, active: false });
  expect(resolve(personal({ traitValues: { 'trait.traitStacks.test': 7 } }), library,
    { traits: { [wolf.traitName]: { damage: 'applied', attacker: { stack: { min: 0 }, automaticStack: { skillTypes: ['火'] } } } } }).trait.stacks).toBe(0);
});

test('no matching valid preset returns null and resolving cannot mutate the source', () => {
  const input = personal();
  const before = structuredClone(input);
  const local = store(input);
  const result = resolveOwnPreset(wolf.id, catalog, library, traits, local);
  result.displayIvs.hp = 12;
  result.skillIds[0] = 'changed';
  expect(input).toEqual(before);
  expect(library.entries.find(row => row.spiritId === wolf.id).skills).toEqual(bundled.skills);
  expect(local.setItem).not.toHaveBeenCalled();
  expect(local.removeItem).not.toHaveBeenCalled();
  expect(resolveOwnPreset(wolf.id, catalog, { entries: [] }, traits, storage(null))).toBeNull();
  expect(resolveOwnPreset('missing', catalog, library, traits, storage(null))).toBeNull();
  expect(resolveOwnPreset(wolf.id, catalog, { entries: [{ ...bundled, natureId: 'missing' }] }, traits, storage(null))).toBeNull();
});

test('the calculator hornfish preset preserves its repeated Wish Star slots', () => {
  const spirit = species('圆号鱼');
  const preset = library.entries.find(row => row.spiritId === spirit.id);
  const result = resolveOwnPreset(spirit.id, catalog, library, traits, storage(null));
  expect(result.skillIds).toEqual(preset.skills);
  expect(result.skillIds.map(id => catalog.skills.find(skill => skill.id === id).name)).toEqual(['水炮', '许愿星', '许愿星', '甜心续航']);
});

test('Saint Dragon Abu uses the calculator user-authorized preview skills without changing its learnset', () => {
  const spirit = species('圣龙阿布');
  const additions = read('data/presets/s5-popular-configs.json');
  const preset = additions.entries.find(row => row.spiritId === spirit.id);
  expect(spirit.previewIdentity).toMatchObject({ catalogId: 's5-video-BV1qqnS6XETF-20261027', formalIdPending: true });
  expect(spirit.previewDefaults).toMatchObject({ authority: 'user', confirmedAt: '2026-11-01', skillIds: preset.skills });
  expect(catalog.learnsets.find(row => row.spiritId === spirit.id).skillIds).toEqual([]);
  expect(getOwnSkillIds(catalog, spirit.id)).toEqual(preset.skills);
  expect(resolveOwnPreset(spirit.id, catalog, additions, traits, storage(null)).skillIds).toEqual(preset.skills);
  for (const altered of [
    { ...spirit, previewDefaults: undefined, previewIdentity: undefined },
    { ...spirit, previewDefaults: { ...spirit.previewDefaults, authority: 'community' } },
    { ...spirit, previewIdentity: { ...spirit.previewIdentity, formalIdPending: false } },
    { ...spirit, previewIdentity: { ...spirit.previewIdentity, catalogId: 'unrelated' } },
  ]) {
    const unauthorized = { ...catalog, spirits: catalog.spirits.map(row => row.id === spirit.id ? altered : row) };
    expect(getOwnSkillIds(unauthorized, spirit.id)).toEqual([]);
    expect(resolveOwnPreset(spirit.id, unauthorized, additions, traits, storage(null))).toBeNull();
  }
  expect(getOwnSkillIds({ ...catalog, meta: { ...catalog.meta, serverId: 'global' } }, spirit.id)).toEqual([]);
});
