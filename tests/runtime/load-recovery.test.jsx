import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { SpiritImage } from "../../src/components/SpiritImage.jsx";
import { LocaleProvider } from "../../src/i18n/LocaleContext.jsx";
import { FeatureBoundary } from "../../src/runtime/FeatureBoundary.jsx";
import { hasNewerBuild, loadWithRecovery, recoverableLazy, reloadForNewBuild, reportRecoveredReload, resetFailedLoads } from "../../src/runtime/chunk-recovery.js";
import { eventMetadata } from "../../src/analytics/metrics-core.js";

function memoryStorage() {
  const data = new Map();
  return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
}

describe("loadWithRecovery", () => {
  test("retries once before succeeding", async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue("module");
    await expect(loadWithRecovery(load, { delay: 0, reloadForNew: vi.fn() })).resolves.toBe("module");
    expect(load).toHaveBeenCalledTimes(2);
  });

  test("rejects when no newer build exists", async () => {
    const error = new Error("offline");
    await expect(loadWithRecovery(() => Promise.reject(error), { delay: 0, reloadForNew: async () => false })).rejects.toBe(error);
  });

  test("stays pending while the page reloads", async () => {
    const outcome = vi.fn();
    loadWithRecovery(() => Promise.reject(new Error("gone")), { delay: 0, reloadForNew: async () => true }).then(outcome, outcome);
    await new Promise((resolve) => { setTimeout(resolve, 20); });
    expect(outcome).not.toHaveBeenCalled();
  });
});

describe("reloadForNewBuild", () => {
  test("reloads once per guard window", async () => {
    const storage = memoryStorage();
    const reload = vi.fn();
    const options = { storage, reload, now: () => 1000, check: async () => true };
    await expect(reloadForNewBuild(options)).resolves.toBe(true);
    await expect(reloadForNewBuild(options)).resolves.toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  test("does not reload without a newer build or without storage", async () => {
    const reload = vi.fn();
    await expect(reloadForNewBuild({ storage: memoryStorage(), reload, now: () => 1000, check: async () => false })).resolves.toBe(false);
    await expect(reloadForNewBuild({ storage: { getItem() { throw new Error("blocked"); } }, reload, check: async () => true })).resolves.toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  test("reports a recovered reload only once", () => {
    const storage = memoryStorage();
    storage.setItem("rock-calculator.chunk-reload.v1", JSON.stringify({ at: 1, pendingReport: true }));
    reportRecoveredReload({ storage });
    expect(JSON.parse(storage.getItem("rock-calculator.chunk-reload.v1"))).toEqual({ at: 1 });
  });
});

describe("hasNewerBuild", () => {
  const doc = { querySelectorAll: () => [{ src: new URL("/assets/main-OLD12345.js", location.href).href }] };
  const app = (src) => `<div id="root"></div><script type="module" src="${src}"></script>`;
  const html = (body, ok = true, contentType = "text/html; charset=utf-8") => vi.fn(async () => ({
    ok,
    headers: new Headers({ "Content-Type": contentType }),
    text: async () => body,
  }));

  test("compares the running entry with the current HTML", async () => {
    await expect(hasNewerBuild({ doc, pathname: "/", fetchImpl: html(app("/assets/main-NEW12345.js")) })).resolves.toBe(true);
    await expect(hasNewerBuild({ doc, pathname: "/", fetchImpl: html(app("/assets/main-OLD12345.js")) })).resolves.toBe(false);
    await expect(hasNewerBuild({ doc, pathname: "/", fetchImpl: html(`<!-- /assets/main-OLD12345.js -->${app("/assets/main-NEW12345.js")}`) })).resolves.toBe(true);
  });

  test.each([
    ["non-HTML response", app("/assets/main-NEW12345.js"), "text/plain"],
    ["200 error page", "<html><body>Temporarily unavailable</body></html>", "text/html"],
    ["classic script", '<div id="root"></div><script src="/assets/main-NEW12345.js"></script>', "text/html"],
    ["missing application root", '<script type="module" src="/assets/main-NEW12345.js"></script>', "text/html"],
    ["foreign origin", app("https://other.example/assets/main-NEW12345.js"), "text/html"],
    ["another region entry", app("/global-assets/assets/main-NEW12345.js"), "text/html"],
    ["unrelated module", app("/assets/tool-NEW12345.js"), "text/html"],
  ])("does not treat %s as a new application build", async (_name, body, contentType) => {
    await expect(hasNewerBuild({ doc, pathname: "/", fetchImpl: html(body, true, contentType) })).resolves.toBe(false);
  });

  test.each([
    ["/cn/", "/assets/"],
    ["/pre/", "/pre/assets/"],
    ["/en/", "/global-assets/assets/"],
    ["/jp/", "/global-assets/assets/"],
  ])("recognizes the module entry for %s", async (pathname, assets) => {
    const regionalDoc = { querySelectorAll: () => [{ src: new URL(`${assets}main-OLD12345.js`, location.href).href }] };
    await expect(hasNewerBuild({ doc: regionalDoc, pathname, fetchImpl: html(app(`${assets}main-NEW12345.js`)) })).resolves.toBe(true);
    await expect(hasNewerBuild({ doc: regionalDoc, pathname, fetchImpl: html(app(`${assets}main-OLD12345.js`)) })).resolves.toBe(false);
  });

  test.each(["https://other.example/", new URL("/en/", location.href).href])("rejects an entry redirected to %s", async (url) => {
    const fetchImpl = vi.fn(async () => ({ ...(await html(app("/assets/main-NEW12345.js"))()), url }));
    await expect(hasNewerBuild({ doc, pathname: "/", fetchImpl })).resolves.toBe(false);
  });

  test("treats failures as no newer build", async () => {
    await expect(hasNewerBuild({ doc, pathname: "/", fetchImpl: html("", false) })).resolves.toBe(false);
    await expect(hasNewerBuild({ doc, pathname: "/", fetchImpl: vi.fn().mockRejectedValue(new Error("offline")) })).resolves.toBe(false);
    await expect(hasNewerBuild({ doc: { querySelectorAll: () => [] }, pathname: "/", fetchImpl: html("") })).resolves.toBe(false);
  });

  test("bypasses caches", async () => {
    const fetchImpl = html("");
    await hasNewerBuild({ doc, pathname: "/en/", fetchImpl });
    expect(fetchImpl.mock.calls[0][0]).toMatch(/^\/en\/\?build-check=\d+$/);
    expect(fetchImpl.mock.calls[0][1]).toEqual({ cache: "no-store", signal: expect.any(AbortSignal) });
  });

  test.each(["fetch", "body"])("stops a pending %s check without blocking recovery", async (stage) => {
    vi.useFakeTimers();
    try {
      const pending = new Promise(() => {});
      const fetchImpl = vi.fn(() => stage === "fetch" ? pending : Promise.resolve({
        ok: true,
        headers: new Headers({ "Content-Type": "text/html" }),
        text: () => pending,
      }));
      const outcome = vi.fn();
      hasNewerBuild({ doc, pathname: "/", fetchImpl }).then(outcome);
      await vi.advanceTimersByTimeAsync(5000);
      expect(outcome).toHaveBeenCalledWith(false);
      expect(fetchImpl.mock.calls[0][1].signal.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  test("clears the deadline after a completed check", async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = html(app("/assets/main-NEW12345.js"));
      await expect(hasNewerBuild({ doc, pathname: "/", fetchImpl })).resolves.toBe(true);
      expect(vi.getTimerCount()).toBe(0);
      await vi.advanceTimersByTimeAsync(5000);
      expect(fetchImpl.mock.calls[0][1].signal.aborted).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("FeatureBoundary", () => {
  beforeEach(() => { vi.spyOn(console, "error").mockImplementation(() => {}); });
  afterEach(() => { vi.restoreAllMocks(); });

  function Crash() { throw new Error("broken"); }

  test("keeps failures inside the tool and can close it", () => {
    const onClose = vi.fn();
    render(<main><p>计算器</p><FeatureBoundary onClose={onClose} fallback={null}><Crash /></FeatureBoundary></main>);
    expect(screen.getByText("计算器")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("这个功能没有打开");
    fireEvent.click(screen.getByRole("button", { name: "关闭" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("hides the close action when the tool has no close handler", () => {
    render(<FeatureBoundary fallback={null}><Crash /></FeatureBoundary>);
    expect(screen.queryByRole("button", { name: "关闭" })).toBeNull();
    expect(screen.getByRole("button", { name: "重新加载" })).toBeTruthy();
  });

  test("a failed lazy tool loads again after reset", async () => {
    const load = vi.fn().mockRejectedValue(new Error("gone"));
    const Tool = recoverableLazy(load);
    const view = render(<FeatureBoundary onClose={() => {}} fallback={<p>加载中</p>}><Tool /></FeatureBoundary>);
    await screen.findByRole("alert", {}, { timeout: 3000 });
    const calls = load.mock.calls.length;
    view.unmount();
    resetFailedLoads();
    load.mockResolvedValue({ default: () => <p>工具内容</p> });
    render(<FeatureBoundary onClose={() => {}} fallback={<p>加载中</p>}><Tool /></FeatureBoundary>);
    await screen.findByText("工具内容");
    expect(load.mock.calls.length).toBeGreaterThan(calls);
  });
});

describe("SpiritImage", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });
  const image = (container) => container.querySelector("img");
  const failAndWait = (container, ms = 12000) => {
    fireEvent.error(image(container));
    act(() => { vi.advanceTimersByTime(ms); });
  };

  test("retries stable portraits through the fixed cache-recovery URL", () => {
    const src = "/assets/spirits/spirit_0123456789abcdef.png";
    const { container } = render(<SpiritImage src={src} name="迪莫" alt="" />);
    const first = image(container);
    expect(first.getAttribute("src")).toBe(src);
    failAndWait(container);
    expect(image(container)).not.toBe(first);
    expect(image(container).getAttribute("src")).toBe(`${src}?image-retry=1`);
    failAndWait(container);
    expect(image(container).getAttribute("src")).toBe(`${src}?image-retry=1`);
  });

  test.each([
    "https://external.test/assets/spirits/spirit_0123456789abcdef.png",
    "/assets/spirits/spirit_0123456789abcdef.png?version=2",
    "/assets/skills/skill_0123456789abcdef.png",
    "/pre/assets/spirits/spirit_0123456789abcdef.png",
    "/assets/spirits/custom.png",
    "data:image/png;base64,AA==",
  ])("does not change URLs outside the portrait recovery contract: %s", (src) => {
    const { container } = render(<SpiritImage src={src} name="迪莫" alt="" />);
    failAndWait(container);
    expect(image(container).getAttribute("src")).toBe(src);
  });

  test("accepts an absolute same-origin portrait without accumulating parameters", () => {
    const path = "/assets/spirits/spirit_0123456789abcdef.png";
    const { container } = render(<SpiritImage src={`${window.location.origin}${path}`} name="迪莫" alt="" />);
    for (let i = 0; i < 3; i += 1) failAndWait(container);
    expect(image(container).getAttribute("src")).toBe(`${path}?image-retry=1`);
  });

  test("shows the name after retries run out and retries when online", () => {
    const src = "/global-assets/assets/spirits/spirit_0123456789abcdef.webp";
    const { container } = render(<SpiritImage src={src} name="迪莫" alt="" />);
    for (let i = 0; i < 3; i += 1) failAndWait(container);
    fireEvent.error(image(container));
    expect(image(container)).toBeNull();
    expect(screen.getByText("迪莫").className).toContain("spirit-image-fallback");
    act(() => { window.dispatchEvent(new Event("online")); });
    expect(image(container).getAttribute("src")).toBe(`${src}?image-retry=1`);
  });

  test("a new source starts over", () => {
    const { container, rerender } = render(<SpiritImage src="/a.png" name="迪莫" alt="" />);
    for (let i = 0; i < 3; i += 1) failAndWait(container);
    fireEvent.error(image(container));
    rerender(<SpiritImage src="/b.png" name="水灵" alt="" />);
    expect(image(container).getAttribute("src")).toBe("/b.png");
  });

  test.each([["en", "Blazehound"], ["ja", "フレイス"]])("keeps the spirit name in %s after image failure", (locale, name) => {
    const { container } = render(<LocaleProvider locale={locale}><SpiritImage src="/a.png" name="音速犬" alt="" /></LocaleProvider>);
    for (let i = 0; i < 3; i += 1) failAndWait(container);
    fireEvent.error(image(container));
    expect(screen.getByText(name).className).toContain("spirit-image-fallback");
    expect(screen.getByText(name).title).toBe(name);
  });

  test("passes image attributes through", () => {
    const { container } = render(<SpiritImage src="/a.png" name="迪莫" alt="迪莫" loading="lazy" width="44" className="portrait" />);
    expect(image(container).getAttribute("loading")).toBe("lazy");
    expect(image(container).getAttribute("width")).toBe("44");
    expect(image(container).className).toBe("portrait");
    expect(image(container).hasAttribute("data-load-retrying")).toBe(false);
  });
});

test("load failure metadata only allows fixed values", () => {
  expect(eventMetadata("load_failure", { kind: "chunk", outcome: "reload", secret: "x" })).toEqual({ kind: "chunk", outcome: "reload" });
  expect(eventMetadata("load_failure", { kind: "https://private", outcome: "reload" })).toEqual({ outcome: "reload" });
});
