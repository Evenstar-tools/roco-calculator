import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import {
  buildBundledAssetHeaders,
  resolveOfflineAssetPath,
} from "../../desktop/offline-paths.mjs";

describe("offline desktop asset routing", () => {
  const clientRoot = path.resolve("dist/client");

  test("maps the desktop origin root to the bundled app shell", () => {
    expect(
      resolveOfflineAssetPath("app://calculator/", clientRoot),
    ).toBe(path.join(clientRoot, "index.html"));
  });

  test("maps data and asset requests into the bundled client directory", () => {
    expect(
      resolveOfflineAssetPath(
        "app://calculator/data/runtime.json?v=20",
        clientRoot,
      ),
    ).toBe(path.join(clientRoot, "data", "runtime.json"));
  });

  test("rejects traversal outside the bundled client directory", () => {
    expect(
      resolveOfflineAssetPath(
        "app://calculator/%2e%2e/%2e%2e/secret.txt",
        clientRoot,
      ),
    ).toBeNull();
  });

  test("offline smoke keeps the bundled app protocol available", () => {
    const desktopMain = readFileSync("desktop/main.mjs", "utf8");
    expect(desktopMain).not.toContain("enableNetworkEmulation({ offline: true })");
    expect(desktopMain).toContain("protocol.registerBufferProtocol");
    expect(desktopMain).toContain('getAttribute("aria-label")');
    expect(desktopMain).not.toContain('"text/javascript; charset=utf-8"');
  });

  test("offline smoke derives its data expectations from the bundled snapshot", () => {
    const desktopMain = readFileSync("desktop/main.mjs", "utf8");

    expect(desktopMain).not.toMatch(/data\.(?:spirits|skills|learnsets) === \d/u);
    expect(desktopMain).toContain("data.spirits === data.declaredSpirits");
    expect(desktopMain).toContain("data.skills === data.declaredSkills");
    expect(desktopMain).toContain("data.learnsets === data.spirits");
    expect(desktopMain).toContain("data.portraits === data.spirits");
  });

  test("the shipped snapshot satisfies the offline smoke invariants", () => {
    const snapshot = JSON.parse(
      readFileSync("data/snapshots/current.json", "utf8"),
    );

    expect(snapshot.spirits.length).toBeGreaterThan(0);
    expect(snapshot.skills.length).toBeGreaterThan(0);
    expect(snapshot.meta.counts.spirits).toBe(snapshot.spirits.length);
    expect(snapshot.meta.counts.skills).toBe(snapshot.skills.length);
    expect(snapshot.learnsets).toHaveLength(snapshot.spirits.length);
  });

  test("HTML responses include a strict content-security-policy", () => {
    const htmlHeaders = buildBundledAssetHeaders("text/html");
    const policy = htmlHeaders["content-security-policy"];

    expect(policy).toContain("default-src 'self' app:");
    expect(policy).toContain("script-src 'self' app:");
    expect(policy).toContain("style-src 'self' app: 'unsafe-inline'");
    expect(policy).toContain("object-src 'none'");
    expect(policy).not.toMatch(/script-src[^;]*'unsafe-inline'/u);
    expect(htmlHeaders["cache-control"]).toBe("no-store");
    expect(buildBundledAssetHeaders("text/css")["content-security-policy"])
      .toBeUndefined();

    const desktopMain = readFileSync("desktop/main.mjs", "utf8");
    expect(desktopMain).toContain("buildBundledAssetHeaders");
  });

  test("desktop runtime does not register a service worker on the app protocol", () => {
    const mainSource = readFileSync("src/main.jsx", "utf8");
    expect(mainSource).toContain(
      'const isDesktopApp = window.location.protocol === "app:";',
    );
    expect(mainSource).toContain("!isDesktopApp");
  });
});
