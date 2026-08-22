import { existsSync, readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { withCalculatorExtras } from "../../src/data/snapshot-extras.js";
import {
  FAVORITE_CONFIG_LIBRARY_FORMAT,
  parseFavoriteConfigLibrary,
} from "../../src/state/favorite-config-library.js";

const presetPath = "public/data/presets/pvp-popular-configs.json";

test("内置常用精灵配置包含并可校验 193 只精灵", () => {
  expect(existsSync(presetPath)).toBe(true);
  if (!existsSync(presetPath)) return;

  const libraryText = readFileSync(presetPath, "utf8");
  const library = JSON.parse(libraryText);
  const snapshot = withCalculatorExtras(JSON.parse(
    readFileSync("public/data/runtime.json", "utf8"),
  ));
  const parsed = parseFavoriteConfigLibrary(libraryText, {
    currentVersions: {
      data: snapshot.meta.id,
      rules: snapshot.meta.rulesVersion,
    },
    snapshot,
  });

  expect(library.format).toBe(FAVORITE_CONFIG_LIBRARY_FORMAT);
  expect(library.entryCount).toBe(193);
  expect(library.entries).toHaveLength(193);
  expect(parsed.entries).toHaveLength(193);
  expect(parsed.preview.missingSpirits).toBe(0);
  expect(parsed.preview.unknownTraitFields).toBe(0);
  expect(parsed.preview.invalidEntries).toBe(0);
});
