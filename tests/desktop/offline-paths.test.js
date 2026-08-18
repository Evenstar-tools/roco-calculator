import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { resolveOfflineAssetPath } from "../../desktop/offline-paths.mjs";

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

  test("offline smoke expects the current production spirit count", () => {
    const desktopMain = readFileSync("desktop/main.mjs", "utf8");
    const snapshot = JSON.parse(
      readFileSync("public/data/current.json", "utf8"),
    );
    const expectedCount = desktopMain.match(/data\.spirits === (\d+)/)?.[1];

    expect(Number(expectedCount)).toBe(snapshot.spirits.length);
  });

  test("desktop runtime does not register a service worker on the app protocol", () => {
    const mainSource = readFileSync("src/main.jsx", "utf8");
    expect(mainSource).toContain(
      'const isDesktopApp = window.location.protocol === "app:";',
    );
    expect(mainSource).toContain("!isDesktopApp");
  });
});
