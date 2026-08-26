import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import bundledRuntimePayload from "../src/data/bundled-runtime.json";
import { expandBundledRuntime } from "../src/data/expand-bundled-runtime.js";
import commonSpiritConfig from "../src/data/common-spirit-config.json";
import {
  LEGACY_COMMON_CONFIG_ENTRY_SIGNATURES,
} from "../src/data/legacy-common-config-signatures.js";
import {
  expandBundledConfigLibrary,
  parseBundledConfigLibrary,
} from "../src/state/config-library.js";

const CONFIG_FILE = resolve(process.cwd(), "src/data/common-spirit-config.json");
const DESKTOP_CONFIG_FILE = resolve(
  process.cwd(),
  "../public/data/presets/pvp-popular-configs.json",
);
const bundledRuntime = expandBundledRuntime(bundledRuntimePayload);

describe("bundled common spirit configuration", () => {
  test("contains the supplied 213-entry PVP library without sensitive fields", () => {
    expect(existsSync(CONFIG_FILE)).toBe(true);
    const text = readFileSync(CONFIG_FILE, "utf8");
    const library = JSON.parse(text);

    expect(library).toMatchObject({
      appVersion: "1.6.2",
      entryCount: 213,
      entryEncoding: "tuple-v1",
      format: "rock-calculator.favorite-config-library",
      schemaVersion: 1,
    });
    expect(library.entries).toHaveLength(213);
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

    expect(parsed.entries).toHaveLength(213);
    expect(parsed.preview).toMatchObject({
      invalidEntries: 0,
      missingSpirits: 0,
      missingSkills: 0,
    });
  });

  test("matches the current desktop popular configuration library", () => {
    const desktopLibrary = JSON.parse(
      readFileSync(DESKTOP_CONFIG_FILE, "utf8"),
    );
    const bundledEntries = expandBundledConfigLibrary(commonSpiritConfig)
      .entries;
    const comparableDesktopEntries = desktopLibrary.entries.map((entry) => ({
      displayIvs: entry.displayIvs,
      natureId: entry.natureId,
      skills: entry.skills,
      spiritId: entry.spiritId,
      traitValues: entry.traitValues ?? {},
    }));

    expect(bundledEntries).toEqual(comparableDesktopEntries);
  });

  test("keeps migration signatures for every entry in the previous 193-entry bundle", () => {
    const currentSpiritIds = new Set(
      expandBundledConfigLibrary(commonSpiritConfig).entries
        .map((entry) => entry.spiritId),
    );
    const legacySpiritIds = Object.keys(
      LEGACY_COMMON_CONFIG_ENTRY_SIGNATURES,
    );

    expect(legacySpiritIds).toHaveLength(193);
    expect(legacySpiritIds.every((spiritId) => currentSpiritIds.has(spiritId)))
      .toBe(true);
  });
});
