import { afterEach, expect, test, vi } from 'vitest';
import { loadToolData } from '../../public/tools/s5-nature/load-data.mjs';

const response = value => ({ ok: true, json: async () => value });
const payload = url => {
  if (url.endsWith('/catalog.json')) return { spirits: [{ id: 'whale' }], skills: [{ id: 'hit' }] };
  if (url.endsWith('/field-samples.json')) return { formMappings: [], entries: [] };
  if (url.endsWith('/dice.json')) return { dice: [{ id: 'none' }] };
  if (url.endsWith('/traits.json')) return { traits: { companion: { damage: 'none' } } };
  return { entries: [] };
};
afterEach(() => vi.useRealTimers());

test('a slow catalog does not delay independent data requests', async () => {
  let releaseCatalog;
  const catalog = new Promise(resolve => { releaseCatalog = resolve; });
  const fetch = vi.fn(url => url.endsWith('/catalog.json') ? catalog : Promise.resolve(response(payload(url))));
  const ready = loadToolData(fetch);
  expect(fetch.mock.calls.map(([url]) => url)).toEqual([
    './data/catalog.json', './data/field-samples.json', './data/dice.json',
    './data/traits.json', '/data/presets/pvp-popular-configs.json',
  ]);
  releaseCatalog(response(payload('./data/catalog.json')));
  expect((await ready).catalog.spirits[0].id).toBe('whale');
});

test('missing online presets keep the local tool usable', async () => {
  const fetch = vi.fn(async url => {
    if (url.includes('/presets/')) throw new Error('offline');
    return response(payload(url));
  });
  expect((await loadToolData(fetch)).presetLibrary).toEqual({ entries: [] });
});

test.each(['catalog', 'field-samples', 'dice', 'traits'])('failed required %s data keeps a visible retry reason', async name => {
  const fetch = vi.fn(async url => url.endsWith(`/${name}.json`) ? { ok: false } : response(payload(url)));
  await expect(loadToolData(fetch)).rejects.toThrow('加载失败，请刷新页面重试');
});

test('empty dice data cannot initialize a misleading calculator', async () => {
  const fetch = async url => response(url.endsWith('/dice.json') ? {} : payload(url));
  await expect(loadToolData(fetch)).rejects.toThrow('骰子数据不完整');
});

test.each(['fetch', 'body'])('a stalled required %s times out and aborts the request', async phase => {
  vi.useFakeTimers();
  let requestSignal;
  const pending = new Promise(() => {});
  const fetch = vi.fn((url, options) => {
    if (!url.endsWith('/catalog.json')) return Promise.resolve(response(payload(url)));
    requestSignal = options?.signal;
    return phase === 'fetch' ? pending : Promise.resolve({ ok: true, json: () => pending });
  });
  const ready = loadToolData(fetch);
  const rejected = expect(ready).rejects.toThrow('技能数据加载超时，请刷新页面重试');
  await vi.advanceTimersByTimeAsync(12000);
  await rejected;
  expect(requestSignal?.aborted).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});

test.each(['fetch', 'body'])('online presets never hold the core calculator behind a stalled %s', async phase => {
  vi.useFakeTimers();
  let presetSignal;
  const fetch = vi.fn((url, options) => {
    if (!url.includes('/presets/')) return Promise.resolve(response(payload(url)));
    presetSignal = options?.signal;
    const pending = new Promise(() => {});
    return phase === 'fetch' ? pending : Promise.resolve({ ok: true, json: () => pending });
  });
  const data = await loadToolData(fetch);
  expect(data.catalog.spirits[0].id).toBe('whale');
  expect(data.presetLibrary).toEqual({ entries: [] });
  await vi.advanceTimersByTimeAsync(8000);
  expect(await data.presetLibraryReady).toEqual({ entries: [] });
  expect(presetSignal?.aborted).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});

test('online presets can arrive after the core data without changing their contents', async () => {
  let releasePreset;
  const preset = new Promise(resolve => { releasePreset = resolve; });
  const fetch = url => url.includes('/presets/') ? preset : Promise.resolve(response(payload(url)));
  const data = await loadToolData(fetch);
  expect(data.presetLibrary).toEqual({ entries: [] });
  const library = { entries: [{ name: 'saved configuration' }] };
  releasePreset(response(library));
  expect(await data.presetLibraryReady).toBe(library);
});

test('presets already received with the core data remain available immediately', async () => {
  const library = { entries: [{ name: 'received configuration' }] };
  const data = await loadToolData(async url => response(url.includes('/presets/') ? library : payload(url)));
  expect(data.presetLibrary).toBe(library);
  expect(await data.presetLibraryReady).toBe(library);
});

test('malformed required JSON keeps a readable failure reason', async () => {
  const fetch = async url => url.endsWith('/traits.json')
    ? { ok: true, json: async () => { throw new SyntaxError('invalid JSON'); } }
    : response(payload(url));
  await expect(loadToolData(fetch)).rejects.toThrow('特性数据加载失败，请刷新页面重试');
});

test('already cancelled loading does not start network requests', async () => {
  const controller = new AbortController();
  controller.abort();
  const fetch = vi.fn();
  await expect(loadToolData(fetch, { signal: controller.signal })).rejects.toThrow('加载失败，请刷新页面重试');
  expect(fetch).not.toHaveBeenCalled();
});

test('a caller can cancel required loading before its deadline', async () => {
  vi.useFakeTimers();
  const controller = new AbortController();
  const signals = [];
  const fetch = vi.fn((_url, { signal }) => {
    signals.push(signal);
    return new Promise(() => {});
  });
  const ready = loadToolData(fetch, { signal: controller.signal });
  const rejected = expect(ready).rejects.toThrow('加载失败，请刷新页面重试');
  controller.abort();
  await rejected;
  expect(signals.every(signal => signal.aborted)).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});

test('successful requests clear their timeout timers', async () => {
  vi.useFakeTimers();
  const data = await loadToolData(async url => response(payload(url)));
  await data.presetLibraryReady;
  expect(vi.getTimerCount()).toBe(0);
});

test.each(['catalog', 'field-samples', 'traits'])('incomplete required %s data cannot silently drop rules', async name => {
  const fetch = async url => response(url.endsWith(`/${name}.json`) ? {} : payload(url));
  await expect(loadToolData(fetch)).rejects.toThrow('数据不完整，请刷新页面重试');
});
