import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import bundledRuntimePayload from "../src/data/bundled-runtime.json";
import { expandBundledRuntime } from "../src/data/expand-bundled-runtime.js";
import commonSpiritConfig from "../src/data/common-spirit-config.json";
import {
  expandBundledConfigLibrary,
  parseBundledConfigLibrary,
} from "../src/state/config-library.js";

const CONFIG_FILE = resolve(process.cwd(), "src/data/common-spirit-config.json");
const bundledRuntime = expandBundledRuntime(bundledRuntimePayload);

describe("bundled common spirit configuration", () => {
  test("contains the supplied 193-entry PVP library without sensitive fields", () => {
    expect(existsSync(CONFIG_FILE)).toBe(true);
    const text = readFileSync(CONFIG_FILE, "utf8");
    const library = JSON.parse(text);

    expect(library).toMatchObject({
      appVersion: "1.4.6",
      entryCount: 193,
      entryEncoding: "tuple-v1",
      format: "rock-calculator.favorite-config-library",
      schemaVersion: 1,
    });
    expect(library.entries).toHaveLength(193);
    expect(library.entries.every((entry) => Array.isArray(entry)))
      .toBe(true);
    expect(text).not.toMatch(
      /appSecret|secretKey|privateKey|openid|password/iu,
    );
  });

  test("all supplied entries remain usable with the current bundled data", () => {
    const parsed = parseBundledConfigLibrary(
      expandBundledConfigLibrary(commonSpiritConfig),
      { snapshot: bundledRuntime },
    );

    expect(parsed.entries).toHaveLength(193);
    expect(parsed.preview).toMatchObject({
      invalidEntries: 0,
      missingSpirits: 0,
      missingSkills: 0,
    });
  });
});
