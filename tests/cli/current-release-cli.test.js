// @vitest-environment node
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { executeCurrentCli } from "../../scripts/cli/current-release.mjs";

const root = process.cwd();
const pin = JSON.parse(readFileSync(path.join(root, "config/preview-release.json"), "utf8"));
const globalPin = JSON.parse(readFileSync(path.join(root, "config/global-release.json"), "utf8"));
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
  test.each([0, 1, 2, 1000])("current CN overcharge accepts %s charges without a power cap", (count) => {
    const explained = run(["explain", "--input", "-", "--direction", "forward"], {
      attacker: { spirit: "波普鹿", skill: { name: "过充电", context: { s5OverchargeChargeCount: count } } },
      defender: { spirit: "迪莫", skill: "光球" },
    });
    expect(explained.ok).toBe(true);
    expect(explained.engine.sourceRevision).toBe(pin.sourceRevision);
    expect(explained.result.status).toBe("exact");
    expect(explained.result.formulaSteps).toContainEqual(expect.objectContaining({
      label: "层数缩放威力", input: count, before: 65, after: 65 + 30 * count,
    }));
  }, 120_000);

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
    expect(run(["search", "spirit", "圣龙阿布"]).results).toEqual([]);
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

  test.each([[99, 39, 195], [150, 90, 450]])("super Abu level %s uses the current Web passive: %s stacks and %s percent", (level, stacks, percent) => {
    const explained = run(["explain", "--input", "-", "--direction", "forward"], {
      attacker: { spirit: "超能阿布", skill: "偷袭", level },
      defender: { spirit: "迪莫", skill: "光球" },
    });
    expect(explained.ok).toBe(true);
    expect(explained.engine.sourceRevision).toBe(pin.sourceRevision);
    expect(explained.result.formulaSteps.find(({ label }) => label === "等级系数与攻防比").input.level).toBe(level);
    expect(explained.result.formulaSteps).toContainEqual(expect.objectContaining({
      input: expect.objectContaining({
        summary: `当前等级 ${level}；被动 ${stacks} 层 · 物攻 +${percent}%`,
        effects: expect.arrayContaining([{ kind: "physical-attack-percent", amount: percent }]),
      }),
    }));
  }, 120_000);

  test("owner-specific CLI level bounds reject invalid inputs instead of clamping", () => {
    const input = { attacker: { spirit: "阿布", skill: "偷袭", level: 150 }, defender: { spirit: "迪莫", skill: "光球" } };
    const explained = run(["explain", "--input", "-", "--direction", "forward"], input);
    expect(explained.ok).toBe(true);
    expect(explained.result.formulaSteps.find(({ label }) => label === "等级系数与攻防比").input.level).toBe(150);
    for (const attacker of [
      { spirit: "阿布", skill: "偷袭", level: 151 },
      { spirit: "超能阿布", skill: "偷袭", level: 151 },
      { spirit: "冥古龙", skill: "荒芜之噬", level: 100 },
      { spirit: "迪莫", skill: "光球", level: 61 },
      { spirit: "阿布", skill: "偷袭", level: 150, ignoreTraits: true },
    ]) {
      expect(run(["calculate", "--input", "-"], { ...input, attacker })).toMatchObject({
        ok: false, error: { code: "INPUT_VALIDATION_FAILED", field: "attacker.level" },
      });
    }
    const schema = run(["schema"]).compactInput.fields.side.level;
    expect(schema).toContain("阿布家族1到150");
    expect(schema).toContain("冥古龙1到99");
    expect(schema).toContain("普通精灵仅60");
  }, 120_000);

  test("unreleased discovery keyword returns the 27 Web placeholders without making the label calculable", () => {
    const search = run(["search", "spirit", "未开放", "--limit", "40"]);
    expect(search.ok).toBe(true);
    expect(search.results).toHaveLength(27);
    expect(search.results.every(spirit => spirit.calculationStatus === "pending-race-stats")).toBe(true);
    expect(search.results.some(spirit => spirit.name === "圣龙阿布")).toBe(false);
    const spirit = search.results[0];
    expect(run(["search", "spirit", spirit.id]).results).toContainEqual(spirit);
    expect(run(["search", "spirit", spirit.name]).results).toContainEqual(spirit);
    const input = { attacker: { spirit: spirit.id, skill: "光球" }, defender: { spirit: "迪莫", skill: "光球" } };
    expect(run(["calculate", "--input", "-"], input).error.code).toBe("SPIRIT_DATA_UNAVAILABLE");
    input.attacker.spirit = "未开放";
    const invalidName = run(["calculate", "--input", "-"], input);
    expect(invalidName.error.code).toBe("ENTITY_NOT_FOUND");
    expect(invalidName.error.candidates).toEqual([]);
    expect(run(["search", "spirit", "未开放", "--limit", "40", "--server", "global"]).results).toEqual([]);
  }, 120_000);

});

describe("default CLI follows the independent verified international release", () => {
  const input = { attacker: { spirit: "迪莫", skill: "光球" }, defender: { spirit: "水蓝蓝", skill: "水炮" } };

  test("missing international pin never falls back to CN or a historical snapshot", async () => {
    await expect(executeCurrentCli(["meta", "--server", "global"], { cwd: root, projectRoot: path.join(root, "config") }))
      .rejects.toThrow("缺少国际服发布 pin");
  });

  test("meta, search and schema use global S3; CN-only entities stay unavailable", () => {
    const meta = run(["meta", "--server", "global"]);
    expect(meta.engine).toMatchObject({ serverId: "global", availability: "verified", seasonId: "S3",
      dataVersion: globalPin.dataVersion, rulesVersion: globalPin.rulesVersion, sourceRevision: globalPin.sourceRevision });
    expect(meta.engine.catalogVersion).toBe(globalPin.dataVersion);
    expect(meta.counts.spirits).toBeGreaterThan(0);
    expect(meta.counts.skills).toBeGreaterThan(0);
    expect(run(["search", "skill", "筑梦", "--server=global"]).results).toEqual([]);
    expect(run(["search", "spirit", "圣龙阿布", "--server", "global"]).results).toEqual([]);
    expect(run(["schema", "--server", "global"]).servers.global).toContain("已核验");
    expect(run(["schema"]).servers.global).toContain("已核验");
  }, 120_000);

  test("flag and JSON-only server selection agree and explicit cross-server claims fail", () => {
    const byFlag = run(["calculate", "--input", "-", "--server=global"], input);
    const byJson = run(["calculate", "--input", "-"], { ...input, serverId: "global" });
    expect(byJson.ok).toBe(true);
    expect(byJson.engine.sourceRevision).toBe(globalPin.sourceRevision);
    expect(byJson.results).toEqual(byFlag.results);
    expect(byJson.inputDigest).toBe(byFlag.inputDigest);
    expect(byJson.results.forward.selected.totalDamage).toBeGreaterThan(0);
    const mismatchedServer = run(["calculate", "--input", "-", "--server", "cn"], { ...input, serverId: "global" });
    expect(mismatchedServer.error.code).toBe("SERVER_MISMATCH");
    const mismatchedVersion = run(["calculate", "--input", "-"], { ...input, serverId: "global", dataVersion: "s4-2026-09-10" });
    expect(mismatchedVersion.error.code).toBe("INCOMPATIBLE_SERVER_VERSION");
    const cnEntity = run(["calculate", "--input", "-", "--server", "global"], {
      ...input, attacker: { spirit: "冥古龙", skill: "荒芜之噬" },
    });
    expect(cnEntity.ok).toBe(false);
    expect(cnEntity.error.code).toBe("ENTITY_NOT_FOUND");
  }, 120_000);
});
