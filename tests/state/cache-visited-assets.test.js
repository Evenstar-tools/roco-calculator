import { expect, test, vi } from "vitest";
import { observeVisitedAssets } from "../../src/runtime/cache-visited-assets.js";

const origin = "https://calculator.test";
const resource = (path) => ({ name: `${origin}${path}` });

function harness() {
  const resources = [];
  const listeners = {};
  const controller = { postMessage: vi.fn() };
  const serviceWorker = { controller, addEventListener: (type, listener) => { listeners[type] = listener; } };
  const performance = { getEntriesByType: vi.fn(() => resources) };
  let observeResources;
  class PerformanceObserver {
    constructor(callback) { observeResources = callback; }
    observe() {}
  }
  const report = observeVisitedAssets(serviceWorker, { origin, performance, PerformanceObserver });
  const complete = (entries) => { resources.push(...entries); observeResources({ getEntries: () => entries }); };
  return { resources, listeners, controller, serviceWorker, performance, report, complete };
}

test("resource completions scan and send only new URLs instead of replaying the full history", () => {
  const { report, complete, performance, controller } = harness();
  report();
  for (let index = 0; index < 250; index += 1) complete([resource(`/assets/skills/skill_${index.toString(16).padStart(16, "0")}.png`)]);
  expect(performance.getEntriesByType).toHaveBeenCalledTimes(1);
  expect(controller.postMessage.mock.calls.reduce((total, [message]) => total + message.urls.length, 0)).toBe(250);
});

test("a new service worker receives visited resources once, including those loaded before control", () => {
  const { resources, complete, serviceWorker, listeners, report } = harness();
  serviceWorker.controller = null;
  complete([resource("/assets/initial-Ab123456.js")]);
  const controller = { postMessage: vi.fn() };
  serviceWorker.controller = controller;
  listeners.controllerchange();
  report();
  expect(controller.postMessage).toHaveBeenCalledExactlyOnceWith({ type: "CACHE_VISITED_ASSETS", urls: resources.map(({ name }) => name) });
  const updatedController = { postMessage: vi.fn() };
  serviceWorker.controller = updatedController;
  listeners.controllerchange();
  expect(updatedController.postMessage).toHaveBeenCalledExactlyOnceWith({ type: "CACHE_VISITED_ASSETS", urls: resources.map(({ name }) => name) });
});

test("duplicate completions do not replay URLs and only own-origin public assets are reported", () => {
  const { complete, report, controller } = harness();
  const entries = [resource("/assets/main-Ab123456.js"), resource("/global-assets/assets/tool-Cd123456.js"),
    resource("/assets/main-Ab123456.js#fragment"), resource("/api/status"), resource("/data/runtime.json"),
    { name: "https://external.test/assets/icon.png" }, { name: "invalid URL" }];
  complete(entries);
  complete(entries);
  report();
  expect(controller.postMessage).toHaveBeenCalledExactlyOnceWith({ type: "CACHE_VISITED_ASSETS", urls: [entries[0].name, entries[1].name] });
});
