// @vitest-environment node
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { expect, test } from "vitest";
import { compareSeasonSnapshots, parseCompareArguments, writeSnapshotComparison } from "../../scripts/bwiki/compare-season-snapshots.mjs";

function fixture() {
  return {
    meta: { id: "fixture-before", rulesVersion: "fixture-rules", seasonId: "fixture-season" },
    spirits: [{ id: "pet-1", fullName: "旧名", types: ["水"], raceStats: { physicalAttack: 80 }, traitIds: ["trait-1"] }],
    skills: [{ id: "skill-1", name: "技能一", cost: 2, basePower: 60, description: "原说明", ruleId: null, ruleParams: null }],
    traits: [{ id: "trait-1", name: "特性一", description: "原特性说明" }],
    learnsets: [{ spiritId: "pet-1", skillIds: ["skill-1", "skill-removed"], acquisitions: { "skill-removed": ["Lv.1"] } }],
  };
}

test("matches stable IDs across renames and preserves all actual field changes", () => {
  const before = fixture();
  const after = structuredClone(before);
  after.meta.id = "fixture-after";
  Object.assign(after.spirits[0], { fullName: "新名", types: ["水", "龙"], raceStats: { physicalAttack: 81 }, traitIds: ["trait-2"] });
  Object.assign(after.skills[0], { name: "技能更名", cost: 1, basePower: 65, description: "新说明", ruleId: "fixture-rule", ruleParams: { cap: 3 } });
  after.traits[0].name = "特性更名";
  after.traits[0].description = "新特性说明";
  const report = compareSeasonSnapshots(before, after);
  expect(report.before.dataVersion).toBe("fixture-before");
  expect(report.after.dataVersion).toBe("fixture-after");
  expect(report.before.serverDeclaration).toBe("legacy-cn");
  expect(report.spirits.added).toEqual([]);
  expect(report.spirits.removed).toEqual([]);
  expect(report.spirits.renamed).toEqual([{ id: "pet-1", before: "旧名", after: "新名" }]);
  expect(report.skills.renamed).toEqual([{ id: "skill-1", before: "技能一", after: "技能更名" }]);
  expect(report.traits.renamed).toEqual([{ id: "trait-1", before: "特性一", after: "特性更名" }]);
  expect(report.spirits.changed[0].fields.map((field) => field.path.join("."))).toEqual(["fullName", "raceStats.physicalAttack", "traitIds", "types"]);
  expect(report.skills.changed[0].fields.map((field) => field.path.join("."))).toEqual(["basePower", "cost", "description", "name", "ruleId", "ruleParams"]);
});

test("reports learnset removals, additions and acquisition changes without guessing replacements", () => {
  const before = fixture();
  const after = structuredClone(before);
  after.learnsets[0].skillIds = ["skill-1", "skill-new"];
  delete after.learnsets[0].acquisitions["skill-removed"];
  const report = compareSeasonSnapshots(before, after);
  expect(report.learnsets.changed[0].skillIds).toEqual({ added: ["skill-new"], removed: ["skill-removed"] });
  expect(report.learnsets.changed[0].fields).toContainEqual({ path: ["acquisitions", "skill-removed"], before: { present: true, value: ["Lv.1"] }, after: { present: false } });
});

test("preserves new records, unknown values and the distinction between field deletion and null", () => {
  const before = fixture();
  const after = structuredClone(before);
  const added = { id: "pet-2", fullName: "合成夹具", raceStats: null, unknown: { value: "未核验", zero: 0, enabled: false } };
  after.spirits.push(added);
  after.traits = [];
  delete after.skills[0].basePower;
  after.skills[0].cost = null;
  after.skills[0].unknown = { value: "未核验", list: [] };
  const beforeCopy = structuredClone(before);
  const afterCopy = structuredClone(after);
  const report = compareSeasonSnapshots(before, after);
  expect(report.spirits.added).toEqual([added]);
  expect(report.traits.removed).toEqual(before.traits);
  expect(report.skills.changed[0].fields).toContainEqual({ path: ["basePower"], before: { present: true, value: 60 }, after: { present: false } });
  expect(report.skills.changed[0].fields).toContainEqual({ path: ["cost"], before: { present: true, value: 2 }, after: { present: true, value: null } });
  expect(report.skills.changed[0].fields).toContainEqual({ path: ["unknown"], before: { present: false }, after: { present: true, value: { value: "未核验", list: [] } } });
  report.spirits.added[0].unknown.value = "report-only";
  expect(before).toEqual(beforeCopy);
  expect(after).toEqual(afterCopy);
});

test("rejects cross-server inputs, conflicting declarations, missing versions and duplicate stable IDs", () => {
  const before = fixture();
  const after = fixture();
  after.meta.serverId = "global";
  expect(() => compareSeasonSnapshots(before, after)).toThrow("different servers");
  before.meta.serverId = "global";
  expect(compareSeasonSnapshots(before, after).before.serverId).toBe("global");
  after.serverId = "cn";
  expect(() => compareSeasonSnapshots(before, after)).toThrow("conflicting serverId");
  delete after.serverId;
  delete after.meta.id;
  expect(() => compareSeasonSnapshots(before, after)).toThrow("missing data version");
  after.meta.id = "fixture-after";
  after.spirits.push(structuredClone(after.spirits[0]));
  expect(() => compareSeasonSnapshots(before, after)).toThrow("duplicate spirits id");
});

test("CLI writes only the requested report and refuses to overwrite source snapshots", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "roco-season-diff-"));
  try {
    const beforePath = path.join(directory, "before.json");
    const afterPath = path.join(directory, "after.json");
    const outputPath = path.join(directory, "report.json");
    const beforeText = `\ufeff${JSON.stringify(fixture(), null, 2)}\r\n`;
    const after = fixture();
    after.meta.id = "fixture-after";
    after.skills[0].basePower = null;
    const afterText = `${JSON.stringify(after)}\n`;
    await writeFile(beforePath, beforeText, "utf8");
    await writeFile(afterPath, afterText, "utf8");
    const result = spawnSync(process.execPath, ["scripts/bwiki/compare-season-snapshots.mjs", "--before", beforePath, "--after", afterPath, "--output", outputPath], { encoding: "utf8", cwd: path.resolve(import.meta.dirname, "../..") });
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout).ok).toBe(true);
    expect(JSON.parse(await readFile(outputPath, "utf8")).after.dataVersion).toBe("fixture-after");
    await expect(writeSnapshotComparison({ beforePath, afterPath, outputPath: beforePath })).rejects.toThrow("must not overwrite");
    expect(await readFile(beforePath, "utf8")).toBe(beforeText);
    expect(await readFile(afterPath, "utf8")).toBe(afterText);
  } finally {
    if (path.dirname(path.resolve(directory)) !== path.resolve(tmpdir()) || !path.basename(directory).startsWith("roco-season-diff-")) {
      throw new Error("Refusing to remove an unexpected test directory");
    }
    await rm(directory, { recursive: true, force: true });
  }
});

test("requires all explicit CLI paths and rejects accidental or repeated flags", () => {
  expect(() => parseCompareArguments(["--before", "before.json", "--after", "after.json"])).toThrow("All three paths");
  expect(() => parseCompareArguments(["--before", "a", "--before", "b"])).toThrow("duplicate");
  expect(() => parseCompareArguments(["--current", "current.json"])).toThrow("Unknown");
});
