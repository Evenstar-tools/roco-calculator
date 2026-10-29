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
    transport.send({ name: "calculation_ready", feature: "calculator", sessionId: "test-session", id: "event-0002", at: 1001, result_kind: "damage", secret: "private-input" });
    // 切换后才发送 EN 队列，再发送 JP 事件，覆盖真实 SDK 延迟批次归属。
    history.replaceState({}, "", "/jp/?private-input=secret#private-lineup");
    transport.send({ name: "page_view", feature: "calculator", sessionId: "test-session", id: "event-en", at: 1002, pageUrl: "https://rococalc.top/en/" });
    transport.send({ name: "page_view", feature: "calculator", sessionId: "test-session", id: "event-jp", at: 1003, pageUrl: "https://rococalc.top/jp/" });
    await vi.waitFor(() => {
      expect(requests.some(({ url }) => url.includes("/collect/pv"))).toBe(true);
      for (const path of ["/", "/en/", "/jp/"]) {
        expect(requests.some(({ url }) => url.includes("/collect/events") && new URL(url).searchParams.get("from") === `https://rococalc.top${path}`)).toBe(true);
      }
    }, { timeout: 5000 });
    for (const [eventId, path] of [["event-en", "/en/"], ["event-jp", "/jp/"]]) {
      const batch = requests.find(({ body }) => String(body).includes(eventId));
      expect(new URL(batch.url).searchParams.get("from")).toBe(`https://rococalc.top${path}`);
    }
    expect(JSON.stringify(requests)).not.toMatch(/private-input|private-lineup|secret/);
    expect(JSON.stringify(requests)).toContain("result_kind");
    expect(JSON.stringify(requests)).toContain("damage");
    expect(requests.every(({ url }) => ["/rateConfig", "/collect/pv", "/collect/events"].includes(new URL(url).pathname))).toBe(true);
  } finally {
    transport?.destroy();
    open.mockRestore();
    header.mockRestore();
    send.mockRestore();
    history.replaceState({}, "", originalUrl);
  }
});
