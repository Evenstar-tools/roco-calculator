import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

function readJson(relativePath) {
  return JSON.parse(
    fs.readFileSync(path.join(repositoryRoot, relativePath), "utf8"),
  );
}

describe("desktop v1.6.2 miniapp parity", () => {
  test("pins the miniapp to web core 1.6.2", () => {
    expect(readJson("package.json").version).toBe("1.6.2");
    expect(readJson("miniapp/package.json").version).toBe("1.1.0");
  });

  test.each([
    "src/domain/negative-status.js",
    "src/domain/negative-status-rules.js",
    "miniapp/src/shared/domain/negative-status.js",
    "miniapp/src/shared/domain/negative-status-rules.js",
  ])("includes %s", (relativePath) => {
    expect(fs.existsSync(path.join(repositoryRoot, relativePath))).toBe(true);
  });

  test("defaults important new features to off", async () => {
    const { createInitialState } = await import("../../src/state/defaults.js");
    const state = createInitialState({ meta: {}, skills: [], spirits: [] });

    expect(state.calculationOptions.includeNegativeStatusSettlement).toBe(false);
  });
});
