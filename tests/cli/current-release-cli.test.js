// @vitest-environment node
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { executeCurrentCli } from "../../scripts/cli/current-release.mjs";

const root = process.cwd();
const pin = JSON.parse(readFileSync(path.join(root, "config/preview-release.json"), "utf8"));
const entry = path.join(root, "scripts/cli/rock-calculator.mjs");

function run(args, input) {
  const result = spawnSync(process.execPath, [entry, ...args], {
    cwd: root, encoding: "utf8", timeout: 120_000,
    input: input === undefined ? undefined : JSON.stringify(input),
  });
  expect(result.error).toBeUndefined();
  if (result.status === 0) {
    expect(result.stderr).toBe("");
    expect(result.stdout.trim().split("\n")).toHaveLength(1);
    return JSON.parse(result.stdout);
  }
  expect(result.stdout).toBe("");
  return { exitCode: result.status, ...JSON.parse(result.stderr) };
}

describe("default CLI follows the pinned CN Web release", () => {
  test("missing current-source configuration never falls back to a historical snapshot", async () => {
    await expect(executeCurrentCli(["meta"], { cwd: root, projectRoot: path.join(root, "config") }))
      .rejects.toThrow("不会退回旧快照");
  });

  test("meta identifies the actual S5 source and current entities are searchable", () => {
    const meta = run(["meta"]);
    expect(meta.engine).toMatchObject({
      serverId: "cn", seasonId: "S5", sourceRevision: pin.sourceRevision,
    });
    expect(meta.engine.catalogVersion).toMatch(/^s5-/u);
    expect(meta.counts.spirits).toBeGreaterThan(622);
    expect(meta.counts.skills).toBeGreaterThan(581);
    const search = run(["search", "skill", "筑梦", "--spirit", "鸡麻麻"]);
    expect(search.results).toContainEqual(expect.objectContaining({
      id: "skill_preview_s5_dream-building", name: "筑梦", cost: 7, basePower: null,
    }));
  }, 120_000);

  test("calculate and explain use the Web default special level, not the old level-60 core", () => {
    const input = {
      attacker: { spirit: "冥古龙", skill: "荒芜之噬" },
      defender: { spirit: "迪莫", skill: "光球" },
    };
    const calculated = run(["calculate", "--input", "-"], input);
    const explained = run(["explain", "--input", "-", "--direction", "forward"], input);
    expect(calculated.ok).toBe(true);
    expect(explained.engine.sourceRevision).toBe(pin.sourceRevision);
    expect(explained.result.totalDamage).toBe(calculated.results.forward.selected.totalDamage);
    expect(calculated.results.forward.skills).toHaveLength(1);
    expect(explained.result.formulaSteps.find(({ label }) => label === "等级系数与攻防比").input.level).toBe(99);
    const level89 = run(["explain", "--input", "-", "--direction", "forward"], {
      ...input, attacker: { ...input.attacker, level: 89 },
    });
    expect(level89.result.formulaSteps.find(({ label }) => label === "等级系数与攻防比").input.level).toBe(89);
    expect(level89.result.combatPanel.attacker.physicalAttack).toBeLessThan(explained.result.combatPanel.attacker.physicalAttack);
  }, 120_000);

  test("CN runtime injection cannot introduce S5 entities into the unverified global CLI", () => {
    const meta = run(["meta", "--server", "global"]);
    expect(meta.engine).toMatchObject({ serverId: "global", availability: "unverified", dataVersion: null });
    expect(meta.counts).toBeNull();
    const search = run(["search", "skill", "筑梦", "--server", "global"]);
    expect(search.exitCode).toBe(2);
    expect(search.ok).toBe(false);
    expect(search.error.code).toBe("SERVER_DATA_UNVERIFIED");
  }, 120_000);
});
