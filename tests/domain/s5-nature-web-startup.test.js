import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { prepareToolWorker, startTool } from '../../public/tools/s5-nature/web-startup.mjs';

const location = { protocol: 'https:', origin: 'https://calculator.test' };
beforeEach(() => vi.stubGlobal('MessageChannel', class {
  constructor() {
    this.port1 = { onmessage: null, close: vi.fn() };
    this.port2 = { close: vi.fn(), postMessage: data => queueMicrotask(() => this.port1.onmessage?.({ data })) };
  }
}));
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
function events(properties = {}) {
  const listeners = new Map();
  return { ...properties, listeners,
    addEventListener: vi.fn((name, listener) => {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(listener);
    }),
    removeEventListener: vi.fn((name, listener) => listeners.get(name)?.delete(listener)),
    emit: name => { for (const listener of listeners.get(name) ?? []) listener(); },
  };
}
function harness() {
  const old = events({ scriptURL: `${location.origin}/sw.js`, state: 'activated' });
  const next = events({ scriptURL: `${location.origin}/sw.js`, state: 'installing' });
  old.postMessage = vi.fn((_, ports) => ports[0].postMessage({ type: 'S5_TOOL_CACHE_POLICY', policy: 'legacy' }));
  next.postMessage = vi.fn((_, ports) => ports[0].postMessage({ type: 'S5_TOOL_CACHE_POLICY', policy: 'network-first-v1', path: '/tools/s5-nature/' }));
  const registration = events({ scope: `${location.origin}/`, active: old, installing: null, waiting: null,
    update: vi.fn(async () => undefined) });
  const serviceWorker = events({ controller: old, getRegistration: vi.fn(async () => registration),
    register: vi.fn(async () => registration) });
  const stylesheet = events({ getAttribute: vi.fn(() => './matchup.css'), setAttribute: vi.fn(), removeAttribute: vi.fn() });
  stylesheet.setAttribute.mockImplementation(() => queueMicrotask(() => stylesheet.emit('load')));
  const status = { textContent: '正在加载工具…', remove: vi.fn() };
  const document = { querySelectorAll: vi.fn(() => [stylesheet]), getElementById: vi.fn(() => status),
    body: { style: { removeProperty: vi.fn() } } };
  const loadUI = vi.fn(async () => 'started');
  return { old, next, registration, serviceWorker, stylesheet, status, document, loadUI };
}
function expectClean(...targets) {
  for (const target of targets) {
    expect([...target.listeners.values()].every(listeners => listeners.size === 0)).toBe(true);
  }
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

test('S5 HTML defers all tool CSS and the UI module until the worker gate finishes', () => {
  const html = readFileSync('public/tools/s5-nature/index.html', 'utf8');
  expect(html).not.toMatch(/<script[^>]+src=["']\.\/ui\.mjs/);
  expect(html).toContain("await import('./web-startup.mjs?sw-policy=3')");
  expect(html).toContain('await startTool()');
  expect(html.match(/data-tool-style=/g)).toHaveLength(4);
  expect(html).not.toMatch(/<link\b[^>]*rel="stylesheet"[^>]*\shref=/);
  expect(html).toContain('style="visibility: hidden"');
  expect(html).toContain('加载失败，请刷新重试。');
});

test('an old controlling worker updates and takes over before tool CSS, data and UI load', async () => {
  const h = harness();
  const updated = deferred();
  h.registration.update.mockImplementation(() => {
    h.registration.installing = h.next;
    h.registration.emit('updatefound');
    return updated.promise;
  });
  const started = startTool({ ...h, location });
  await vi.waitFor(() => expect(h.registration.update).toHaveBeenCalledOnce());
  expect(h.serviceWorker.register).toHaveBeenCalledWith('/sw.js', { updateViaCache: 'none' });
  expect(h.stylesheet.setAttribute).not.toHaveBeenCalled();
  expect(h.loadUI).not.toHaveBeenCalled();
  updated.resolve();
  h.next.state = 'activated';
  h.registration.installing = null;
  h.registration.active = h.next;
  h.next.emit('statechange');
  await Promise.resolve();
  expect(h.loadUI).not.toHaveBeenCalled();
  h.serviceWorker.controller = h.next;
  h.serviceWorker.emit('controllerchange');
  await expect(started).resolves.toBe('started');
  expect(h.stylesheet.setAttribute).toHaveBeenCalledWith('href', './matchup.css');
  expect(h.stylesheet.setAttribute.mock.invocationCallOrder[0]).toBeLessThan(h.loadUI.mock.invocationCallOrder[0]);
  expect(h.loadUI).toHaveBeenCalledOnce();
  expect(h.status.remove).toHaveBeenCalledOnce();
  expect(h.document.body.style.removeProperty).toHaveBeenCalledWith('visibility');
  expectClean(h.serviceWorker, h.registration, h.next, h.stylesheet);
});

test.each(['no registration', 'no service worker', 'known current offline', 'already current'])(
  '%s starts the tool without waiting for a controller change or installing a new cache', async mode => {
    const h = harness();
    if (mode === 'no registration') h.serviceWorker.getRegistration.mockResolvedValue(undefined);
    if (mode === 'no service worker') h.serviceWorker = null;
    if (mode === 'known current offline' || mode === 'already current') {
      h.registration.active = h.next;
      h.serviceWorker.controller = h.next;
      h.registration.update.mockRejectedValue(new Error('offline'));
    }
    await expect(startTool({ ...h, location })).resolves.toBe('started');
    expect(h.loadUI).toHaveBeenCalledOnce();
    expect(h.stylesheet.setAttribute).toHaveBeenCalledOnce();
    if (mode === 'no registration') expect(h.serviceWorker.register).not.toHaveBeenCalled();
    expectClean(h.registration, ...(h.serviceWorker ? [h.serviceWorker] : []));
  });

test('an old unknown controller blocks startup when its upgrade fails offline', async () => {
  const h = harness();
  h.registration.update.mockRejectedValue(new Error('offline'));
  await expect(startTool({ ...h, location })).rejects.toThrow('缓存更新尚未完成');
  expect(h.loadUI).not.toHaveBeenCalled();
  expect(h.stylesheet.setAttribute).not.toHaveBeenCalled();
  expect(h.status.textContent).toBe('缓存更新尚未完成，请刷新重试。');
  expectClean(h.serviceWorker, h.registration, h.next);
});

test('a stalled worker update has a bounded wait, cleans up, and cannot start the UI twice', async () => {
  vi.useFakeTimers();
  const h = harness();
  const updated = deferred();
  h.registration.update.mockImplementation(() => {
    h.registration.installing = h.next;
    h.registration.emit('updatefound');
    return updated.promise;
  });
  const failed = expect(startTool({ ...h, location, timeoutMs: 100 })).rejects.toThrow('缓存更新尚未完成');
  await vi.advanceTimersByTimeAsync(99);
  expect(h.loadUI).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  await failed;
  expect(h.stylesheet.setAttribute).not.toHaveBeenCalled();
  expectClean(h.serviceWorker, h.registration, h.next);
  h.serviceWorker.controller = h.next;
  h.serviceWorker.emit('controllerchange');
  updated.resolve();
  await Promise.resolve();
  expect(h.loadUI).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

test('a delayed registration lookup cannot register a worker after startup timed out', async () => {
  vi.useFakeTimers();
  const h = harness();
  const lookup = deferred();
  h.serviceWorker.getRegistration.mockReturnValue(lookup.promise);
  const failed = expect(prepareToolWorker(h.serviceWorker, location, 100)).rejects.toThrow('缓存更新尚未完成');
  await vi.advanceTimersByTimeAsync(100);
  await failed;
  lookup.resolve(h.registration);
  await Promise.resolve();
  expect(h.serviceWorker.register).not.toHaveBeenCalled();
});

test('controller replacement without a matching capability response never permits startup', async () => {
  vi.useFakeTimers();
  const h = harness();
  h.next.postMessage = h.old.postMessage;
  h.registration.update.mockImplementation(async () => {
    h.serviceWorker.controller = h.next;
    h.registration.active = h.next;
    h.serviceWorker.emit('controllerchange');
  });
  const failed = expect(startTool({ ...h, location, timeoutMs: 100 })).rejects.toThrow('缓存更新尚未完成');
  await vi.advanceTimersByTimeAsync(100);
  await failed;
  expect(h.stylesheet.setAttribute).not.toHaveBeenCalled();
  expect(h.loadUI).not.toHaveBeenCalled();
  expectClean(h.serviceWorker, h.registration);
});

test.each(['https://calculator.test/tools/', 'https://calculator.test/other-sw.js'])(
  'a different worker scope or script is not replaced: %s', async other => {
    const h = harness();
    if (other.endsWith('/')) h.registration.scope = other;
    else h.old.scriptURL = other;
    await expect(prepareToolWorker(h.serviceWorker, location)).resolves.toBe(false);
    expect(h.serviceWorker.register).not.toHaveBeenCalled();
  });

test('the UI stays hidden until its stylesheet loads', async () => {
  const h = harness();
  h.stylesheet.setAttribute.mockImplementation(() => undefined);
  const started = startTool({ ...h, serviceWorker: null, location });
  await vi.waitFor(() => expect(h.stylesheet.setAttribute).toHaveBeenCalledOnce());
  expect(h.loadUI).not.toHaveBeenCalled();
  expect(h.document.body.style.removeProperty).not.toHaveBeenCalled();
  h.stylesheet.emit('load');
  await expect(started).resolves.toBe('started');
  expect(h.document.body.style.removeProperty).toHaveBeenCalledOnce();
  expectClean(h.stylesheet);
});

test.each(['stylesheet', 'UI module'])('%s failure shows a retry message without exposing the uninitialized form', async failure => {
  const h = harness();
  if (failure === 'stylesheet') h.stylesheet.setAttribute.mockImplementation(() => queueMicrotask(() => h.stylesheet.emit('error')));
  else h.loadUI.mockRejectedValue(new Error('module load failed'));
  await expect(startTool({ ...h, serviceWorker: null, location })).rejects.toThrow();
  expect(h.status.textContent).toBe('加载失败，请刷新重试。');
  expect(h.status.remove).not.toHaveBeenCalled();
  expect(h.document.body.style.removeProperty).not.toHaveBeenCalled();
  expectClean(h.stylesheet);
});

test('a stalled stylesheet becomes a visible failure and removes load listeners', async () => {
  vi.useFakeTimers();
  const h = harness();
  h.stylesheet.setAttribute.mockImplementation(() => undefined);
  const failed = expect(startTool({ ...h, serviceWorker: null, location })).rejects.toThrow('stylesheet timed out');
  await vi.advanceTimersByTimeAsync(5000);
  await failed;
  expect(h.status.textContent).toBe('加载失败，请刷新重试。');
  expect(h.loadUI).not.toHaveBeenCalled();
  expectClean(h.stylesheet);
  expect(vi.getTimerCount()).toBe(0);
});
