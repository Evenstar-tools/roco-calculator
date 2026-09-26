import { expect, test, vi } from "vitest";
import { loadRum } from "../../src/analytics/rum.js";

test("the installed SDK sends PV and events without the page query or referrer", async () => {
  const requests = [];
  const originalUrl = location.href;
  history.replaceState({}, "", "/?private-input=secret#private-lineup");
  const open = vi.spyOn(XMLHttpRequest.prototype, "open").mockImplementation(function (_method, url) {
    this.testUrl = url;
  });
  const header = vi.spyOn(XMLHttpRequest.prototype, "setRequestHeader").mockImplementation(() => {});
  const send = vi.spyOn(XMLHttpRequest.prototype, "send").mockImplementation(function (body) {
    requests.push({ url: this.testUrl, body });
    Object.defineProperty(this, "readyState", { configurable: true, value: 4 });
    Object.defineProperty(this, "status", { configurable: true, value: 200 });
    Object.defineProperty(this, "responseText", { configurable: true, value: '{"retcode":0,"configs":[],"ttl":3600}' });
    Object.defineProperty(this, "response", { configurable: true, value: '{"retcode":0,"configs":[],"ttl":3600}' });
    this.dispatchEvent(new Event("readystatechange"));
  });
  let transport;
  try {
    transport = await loadRum({ id: "local-test-only", version: "2.0.1", visitorId: "anonymous-test-visitor" });
    transport.send({ name: "page_view", feature: "calculator", sessionId: "test-session", id: "event-0001", at: 1000 });
    await vi.waitFor(() => {
      expect(requests.some(({ url }) => url.includes("/collect/pv"))).toBe(true);
      expect(requests.some(({ url }) => url.includes("/collect/events"))).toBe(true);
    }, { timeout: 5000 });
    expect(JSON.stringify(requests)).not.toMatch(/private-input|private-lineup|secret/);
    expect(requests.every(({ url }) => ["/rateConfig", "/collect/pv", "/collect/events"].includes(new URL(url).pathname))).toBe(true);
  } finally {
    transport?.destroy();
    open.mockRestore();
    header.mockRestore();
    send.mockRestore();
    history.replaceState({}, "", originalUrl);
  }
});
