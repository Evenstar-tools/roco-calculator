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
});
