import { expect, test, vi } from 'vitest';
import { loadToolData } from '../../public/tools/s5-nature/load-data.mjs';

const response = value => ({ ok: true, json: async () => value });
const payload = url => url.endsWith('/dice.json') ? { dice: [{ id: 'none' }] } : {};

test('a slow catalog does not delay independent data requests', async () => {
  let releaseCatalog;
  const catalog = new Promise(resolve => { releaseCatalog = resolve; });
  const fetch = vi.fn(url => url.endsWith('/catalog.json') ? catalog : Promise.resolve(response(payload(url))));
  const ready = loadToolData(fetch);
  expect(fetch.mock.calls.map(([url]) => url)).toEqual([
    './data/catalog.json', './data/field-samples.json', './data/dice.json',
    './data/traits.json', '/data/presets/pvp-popular-configs.json',
  ]);
  releaseCatalog(response({ spirits: [{ id: 'whale' }] }));
  expect((await ready).catalog.spirits[0].id).toBe('whale');
});

test('missing online presets keep the local tool usable', async () => {
  const fetch = vi.fn(async url => {
    if (url.includes('/presets/')) throw new Error('offline');
    return response(payload(url));
  });
  expect((await loadToolData(fetch)).presetLibrary).toEqual({ entries: [] });
});

test.each(['catalog', 'dice'])('failed required %s data keeps a visible retry reason', async name => {
  const fetch = vi.fn(async url => url.endsWith(`/${name}.json`) ? { ok: false } : response(payload(url)));
  await expect(loadToolData(fetch)).rejects.toThrow('加载失败，请刷新页面重试');
});

test('empty dice data cannot initialize a misleading calculator', async () => {
  await expect(loadToolData(async () => response({}))).rejects.toThrow('骰子数据不完整');
});
