import { describe, expect, test, vi } from 'vitest';
import snapshot from '../../public/data/global-runtime.json';
import { createGlobalSessionStore, migrateGlobalDraftState } from '../../src/runtime/global-session-migration.js';
import { createCalculatorSessionStore } from '../../src/runtime/workspace-store.js';
import { buildCalculatorViewModel } from '../../src/domain/calculator-view-model.js';
import { createProductInitialState, selectSpirit } from '../../src/state/calculator-session.js';
import { createServerStorage, serverStorageKey } from '../../src/state/server-storage.js';
import { decodeShareEnvelope, encodeShareEnvelope, selectShareableInputs, selectConfigurationDraftInputs } from '../../src/state/share.js';
import { buildFavoriteConfigLibrary, parseFavoriteConfigLibrary, applyFavoriteConfigLibraryImport } from '../../src/state/favorite-config-library.js';
import { spiritConfigsRepository } from '../../src/state/spirit-configs.js';
import { favoritesRepository } from '../../src/state/favorites.js';

const SESSION_KEY = 'rock-calculator.calculator.session.v1';
const BACKUP_KEY = 'rock-calculator.calculator.pre-release-session.v1';
const clone = (value) => JSON.parse(JSON.stringify(value));
const initial = createProductInitialState(snapshot);
function memoryStorage() {
  const values = new Map();
  return { get length() { return values.size; }, key: (index) => [...values.keys()][index] ?? null,
    getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: (key) => values.delete(key) };
}
function selectedState() {
  let state = clone(initial);
  for (const [index, side] of ['attacker', 'defender'].entries()) state = selectSpirit(state, {
    initialState: initial, snapshot, side, spiritId: snapshot.spirits[index].id,
  }).state;
  return state;
}
function draftState() {
  const value = selectedState();
  value.versions = { data: null, rules: null };
  value.sides.attacker.nature = null;
  value.sides.attacker.displayIvs.hp = null;
  value.sides.attacker.displayIvs.physicalAttack = 0;
  value.directions.forward.context = { rainWeather: false, retainedDraftValue: 17 };
  return value;
}
const validateState = (value) => {
  if (value.versions.data !== initial.versions.data || value.versions.rules !== initial.versions.rules) throw new TypeError('wrong version');
};
function seedDraft(storage) {
  const raw = { present: draftState(), past: [{ state: draftState(), rememberSides: ['attacker'] }],
    future: [{ state: draftState(), rememberSides: [] }] };
  createCalculatorSessionStore({ storage, serverId: 'global' }).saveSession(raw);
  return raw;
}

describe('official Global workspace migration and storage', () => {
  test('only the unversioned draft is upgraded, null defaults fill while zero and user context survive', () => {
    const draft = draftState();
    const before = clone(draft);
    const migrated = migrateGlobalDraftState(draft, initial);
    expect(migrated.versions).toEqual(initial.versions);
    expect(migrated.sides.attacker.nature).toBe('neutral');
    expect(migrated.sides.attacker.displayIvs).toMatchObject({ hp: 60, physicalAttack: 0 });
    expect(migrated.sides.attacker.skills).toEqual(draft.sides.attacker.skills);
    expect(migrated.directions).toEqual(draft.directions);
    expect(draft).toEqual(before);
    expect(migrateGlobalDraftState(migrated, initial)).toBe(migrated);
    const foreignVersion = { ...draft, versions: { data: 'other-version', rules: 'other-rules' } };
    expect(migrateGlobalDraftState(foreignVersion, initial)).toBe(foreignVersion);
  });

  test('read migrates present/undo/redo without writes; first save keeps the complete untouched backup once', () => {
    const storage = memoryStorage();
    const original = seedDraft(storage);
    const scoped = createServerStorage('global', storage);
    const raw = scoped.getItem(SESSION_KEY);
    const store = createGlobalSessionStore({ storage, initialState: initial, validateState });
    const restored = store.loadSession();
    for (const value of [restored.present, restored.past[0].state, restored.future[0].state]) expect(value.versions).toEqual(initial.versions);
    expect(scoped.getItem(SESSION_KEY)).toBe(raw);
    expect(scoped.getItem(BACKUP_KEY)).toBeNull();
    store.saveSession(restored);
    expect(JSON.parse(scoped.getItem(BACKUP_KEY))).toEqual(original);
    const savedBackup = scoped.getItem(BACKUP_KEY);
    restored.present.mode = 'single';
    store.saveSession(restored);
    expect(scoped.getItem(BACKUP_KEY)).toBe(savedBackup);
    expect(createGlobalSessionStore({ storage, initialState: initial, validateState }).loadSession()).toEqual(restored);
  });

  test('backup failure aborts migration save and preserves the original payload', () => {
    const storage = memoryStorage();
    seedDraft(storage);
    const original = storage.getItem(serverStorageKey('global', SESSION_KEY));
    const store = createGlobalSessionStore({ storage, initialState: initial, validateState });
    const restored = store.loadSession();
    const setItem = storage.setItem;
    vi.spyOn(storage, 'setItem').mockImplementation((key, value) => {
      if (key === serverStorageKey('global', BACKUP_KEY)) throw new Error('quota');
      return setItem(key, value);
    });
    expect(() => store.saveSession(restored)).toThrow(expect.objectContaining({ code: 'STORAGE_WRITE_FAILED' }));
    expect(storage.getItem(serverStorageKey('global', SESSION_KEY))).toBe(original);
    expect(storage.getItem(serverStorageKey('global', BACKUP_KEY))).toBeNull();
  });

  test('two upgraded tabs detect a conflict, retain the first save and leave CN and legacy storage untouched', () => {
    const storage = memoryStorage();
    storage.setItem(SESSION_KEY, 'legacy-cn');
    storage.setItem(serverStorageKey('cn', SESSION_KEY), 'current-cn');
    seedDraft(storage);
    const first = createGlobalSessionStore({ storage, initialState: initial, validateState });
    const second = createGlobalSessionStore({ storage, initialState: initial, validateState });
    const a = first.loadSession(), b = second.loadSession();
    a.present.mode = 'single';
    first.saveSession(a);
    b.present.directions.forward.selectedSkillIndex = 2;
    expect(() => second.saveSession(b)).toThrow(expect.objectContaining({ code: 'STORAGE_CONFLICT' }));
    expect(createGlobalSessionStore({ storage, initialState: initial, validateState }).loadSession()).toEqual(a);
    expect(storage.getItem(SESSION_KEY)).toBe('legacy-cn');
    expect(storage.getItem(serverStorageKey('cn', SESSION_KEY))).toBe('current-cn');
  });
});

describe('official Global share and favorite library roundtrip', () => {
  test.each(['en', 'ja', 'zh-CN'])('formal %s share keeps IDs and calculations and rejects a CN receiver', async (locale) => {
    const payload = selectShareableInputs(selectedState());
    const metadata = { serverId: 'global', locale, gameVersion: null, dataVersion: initial.versions.data,
      rulesVersion: initial.versions.rules, kind: 'configuration' };
    const hash = await encodeShareEnvelope({ ...metadata, payload });
    const decoded = await decodeShareEnvelope(hash, { serverId: 'global', dataVersion: metadata.dataVersion, rulesVersion: metadata.rulesVersion });
    expect(selectShareableInputs(decoded.payload)).toEqual(payload);
    const result = (state) => buildCalculatorViewModel({ snapshot, state, activeDirection: 'forward' }).result.selectedResult;
    expect(result(decoded.payload).totalDamage).toBe(result(selectedState()).totalDamage);
    expect(result(decoded.payload).status).toBe('exact');
    expect(decoded.locale).toBe(locale);
    expect(decoded.payload.sides.attacker.spiritId).toMatch(/^cn-placeholder:/);
    await expect(decodeShareEnvelope(hash, { serverId: 'cn' })).rejects.toMatchObject({ code: 'SHARE_SERVER_MISMATCH' });
    await expect(encodeShareEnvelope({ ...metadata, dataVersion: 'other', payload })).rejects.toMatchObject({ code: 'SHARE_VERSION_MISMATCH' });
  });

  test('old draft share remains decodable then explicitly migrates without losing its original content', async () => {
    const payload = selectConfigurationDraftInputs(draftState());
    const hash = await encodeShareEnvelope({ serverId: 'global', locale: 'ja', gameVersion: null,
      dataVersion: null, rulesVersion: null, kind: 'configuration-draft', payload });
    const decoded = await decodeShareEnvelope(hash, { serverId: 'global' });
    expect(decoded.payload).toEqual(payload);
    const migrated = migrateGlobalDraftState(decoded.payload, initial);
    expect(migrated.versions).toEqual(initial.versions);
    expect(migrated.directions).toEqual(payload.directions);
    expect(decoded.payload.versions).toEqual({ data: null, rules: null });
  });

  test('formal favorite library imports into Global repositories and cannot enter CN', () => {
    const state = selectedState();
    const side = state.sides.attacker;
    const config = { ...side, natureId: side.nature, updatedAt: '2026-10-28T00:00:00.000Z' };
    const favorite = { id: `spirit:${side.spiritId}`, kind: 'spirit', spiritId: side.spiritId };
    const { library } = buildFavoriteConfigLibrary({ appVersion: '2.2.8', favorites: [favorite],
      spiritConfigs: { configs: { [side.spiritId]: config } }, snapshot, versions: initial.versions });
    expect(library).toMatchObject({ serverId: 'global', entryCount: 1, versions: initial.versions });
    const json = JSON.stringify(library);
    const parsed = parseFavoriteConfigLibrary(json, { snapshot, currentVersions: initial.versions });
    expect(parsed.serverId).toBe('global');
    expect(parsed.entries[0].spiritId).toBe(side.spiritId);
    const storage = memoryStorage();
    const configs = spiritConfigsRepository({ storage, serverId: 'global' });
    const favorites = favoritesRepository(storage, { serverId: 'global' });
    const result = applyFavoriteConfigLibraryImport({ parsed, snapshot, spiritConfigsRepository: configs, favoritesRepository: favorites });
    expect(result.configs.configs[side.spiritId]).toMatchObject({ natureId: 'neutral', displayIvs: side.displayIvs });
    expect(result.favorites[0].spiritId).toBe(side.spiritId);
    expect(spiritConfigsRepository({ storage, serverId: 'cn' }).load({ spirits: [], skills: [] }).configs).toEqual({});
    expect(favoritesRepository(storage, { serverId: 'cn' }).list()).toEqual([]);
    expect(() => parseFavoriteConfigLibrary(json, { snapshot: { spirits: [], skills: [] }, serverId: 'cn' })).toThrow(expect.objectContaining({ code: 'SERVER_MISMATCH' }));
    const again = buildFavoriteConfigLibrary({ appVersion: '2.2.8', favorites: result.favorites, spiritConfigs: result.configs, snapshot, versions: initial.versions });
    expect(again.library.entries).toEqual(library.entries);
  });
});
