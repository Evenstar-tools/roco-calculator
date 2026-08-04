import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, test } from "vitest";

const temporaryDirectories = [];
const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

const fixtureManifest = {
  shared: ["src/domain/calculate.js"],
  webOnly: [],
};

function serializeManifest(manifest) {
  return `/* SHARED_SOURCE_MANIFEST_START\n${JSON.stringify(manifest, null, 2)}\nSHARED_SOURCE_MANIFEST_END */\n`;
}

const allFullIvs = {
  hp: 60,
  magicalAttack: 60,
  magicalDefense: 60,
  physicalAttack: 60,
  physicalDefense: 60,
  speed: 60,
};

const snapshot = {
  meta: { id: "shared-core-fixture", rulesVersion: "1.0.0" },
  skills: [
    {
      basePower: 80,
      category: "physical",
      id: "skill_fire",
      name: "火焰冲击",
      provenance: { basePower: { source: "fixture" } },
      ruleId: null,
      type: "火",
    },
    {
      basePower: 70,
      category: "magical",
      id: "skill_water",
      name: "水流冲击",
      provenance: { basePower: { source: "fixture" } },
      ruleId: null,
      type: "水",
    },
  ],
  spirits: [
    {
      fullName: "烈火宠物",
      id: "spirit_fire",
      raceStats: {
        hp: 110,
        magicalAttack: 82,
        magicalDefense: 90,
        physicalAttack: 128,
        physicalDefense: 95,
        speed: 116,
      },
      traitIds: [],
      types: ["火"],
    },
    {
      fullName: "水系宠物",
      id: "spirit_water",
      raceStats: {
        hp: 125,
        magicalAttack: 115,
        magicalDefense: 105,
        physicalAttack: 100,
        physicalDefense: 100,
        speed: 90,
      },
      traitIds: [],
      types: ["水"],
    },
  ],
  traits: [],
  typeChart: null,
};

const battleInput = {
  directions: {
    forward: {
      context: {},
      currentHp: 434,
      finalDamageMultiplier: 1,
      hitCount: 1,
      overrides: {},
      reduction: 1,
      selectedSkillIndex: 0,
      starfallStacks: 0,
    },
    reverse: {
      context: {},
      currentHp: 403,
      finalDamageMultiplier: 1,
      hitCount: 1,
      overrides: {},
      reduction: 1,
      selectedSkillIndex: 0,
      starfallStacks: 0,
    },
  },
  level: 60,
  marks: {
    attacker: { negative: null, positive: null },
    defender: { negative: null, positive: null },
  },
  mode: "single",
  schemaVersion: 1,
  sides: {
    attacker: {
      displayIvs: { ...allFullIvs },
      natureMultipliers: { physicalAttack: 1.2 },
      skills: { four: ["skill_fire", null, null, null], single: "skill_fire" },
      spiritId: "spirit_fire",
    },
    defender: {
      displayIvs: { ...allFullIvs },
      natureMultipliers: {},
      skills: { four: ["skill_water", null, null, null], single: "skill_water" },
      spiritId: "spirit_water",
    },
  },
  versions: { data: "shared-core-fixture", rules: "1.0.0" },
};

function createRepositoryFixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), "rock-core-drift-"));
  temporaryDirectories.push(root);
  const sourcePath = path.join(root, "src/domain/calculate.js");
  const mirrorPath = path.join(
    root,
    "miniapp/src/shared/domain/calculate.js",
  );
  const manifestPath = path.join(
    root,
    "scripts/miniapp/shared-source-manifest.mjs",
  );
  mkdirSync(path.dirname(sourcePath), { recursive: true });
  mkdirSync(path.dirname(mirrorPath), { recursive: true });
  mkdirSync(path.dirname(manifestPath), { recursive: true });
  writeFileSync(sourcePath, "export const value = 1;\n");
  writeFileSync(mirrorPath, "export const value = 1;\n");
  writeFileSync(manifestPath, serializeManifest(fixtureManifest));
  execFileSync("git", ["init", "--quiet"], { cwd: root });
  execFileSync("git", ["config", "core.autocrlf", "false"], { cwd: root });
  execFileSync("git", ["config", "user.email", "test@example.invalid"], {
    cwd: root,
  });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: root });
  execFileSync("git", ["add", "."], { cwd: root });
  execFileSync("git", ["commit", "--quiet", "-m", "fixture"], {
    cwd: root,
  });
  return { manifestPath, mirrorPath, root, sourcePath };
}

function projectCalculation(result) {
  return Object.fromEntries(
    ["forward", "reverse"].map((direction) => [
      direction,
      result[direction].results.map((entry) => ({
        additionalDamage: entry.additionalDamage ?? 0,
        actualPower: entry.effectivePower ?? null,
        error: entry.error ?? entry.reason ?? null,
        singleHitDamage:
          Number.isFinite(entry.mainDamage) && entry.hitCount > 0
            ? entry.mainDamage / entry.hitCount
            : null,
        status: entry.status,
        totalDamage: entry.totalDamage ?? null,
      })),
    ]),
  );
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe("miniapp shared calculator core", () => {
  test("manifest classifies every Web domain module exactly once", async () => {
    const { getManifestCoverage } = await import(
      "../../scripts/miniapp/shared-source-manifest.mjs"
    );
    const coverage = getManifestCoverage({ repositoryRoot });

    expect(coverage.duplicates).toEqual([]);
    expect(coverage.unclassified).toEqual([]);
    expect(coverage.missing).toEqual([]);
  });

  test("manifest reports a classified state source that is missing", async () => {
    const { getManifestCoverage } = await import(
      "../../scripts/miniapp/shared-source-manifest.mjs"
    );
    const root = mkdtempSync(path.join(os.tmpdir(), "rock-core-manifest-"));
    temporaryDirectories.push(root);
    mkdirSync(path.join(root, "src/domain"), { recursive: true });
    mkdirSync(path.join(root, "src/state"), { recursive: true });
    writeFileSync(path.join(root, "src/domain/calculate.js"), "export {};\n");

    expect(
      getManifestCoverage({
        manifest: {
          shared: [
            "src/domain/calculate.js",
            "src/state/defaults.js",
          ],
          webOnly: [],
        },
        repositoryRoot: root,
      }).missing,
    ).toEqual(["src/state/defaults.js"]);
  });

  test("working-tree drift is reported before files are staged", async () => {
    const { getCoreDrift } = await import(
      "../../scripts/miniapp/check-core-drift.mjs"
    );
    const fixture = createRepositoryFixture();
    writeFileSync(fixture.mirrorPath, "export const value = 2;\n");

    const drift = getCoreDrift({
      manifest: fixtureManifest,
      repositoryRoot: fixture.root,
      scopes: ["working-tree"],
    });

    expect(drift).toEqual([
      expect.objectContaining({
        mirrorPath: "miniapp/src/shared/domain/calculate.js",
        scope: "working-tree",
        sourcePath: "src/domain/calculate.js",
        type: "content-mismatch",
      }),
    ]);
  });

  test("index-only drift is reported independently from the working tree", async () => {
    const { getCoreDrift } = await import(
      "../../scripts/miniapp/check-core-drift.mjs"
    );
    const fixture = createRepositoryFixture();
    writeFileSync(fixture.sourcePath, "export const value = 2;\n");
    execFileSync("git", ["add", "src/domain/calculate.js"], {
      cwd: fixture.root,
    });

    expect(
      getCoreDrift({
        manifest: fixtureManifest,
        repositoryRoot: fixture.root,
        scopes: ["index"],
      }),
    ).toEqual([
      expect.objectContaining({ scope: "index", type: "content-mismatch" }),
    ]);
  });

  test("HEAD-only drift is reported on a clean checkout", async () => {
    const { getCoreDrift } = await import(
      "../../scripts/miniapp/check-core-drift.mjs"
    );
    const fixture = createRepositoryFixture();
    writeFileSync(fixture.sourcePath, "export const value = 2;\n");
    execFileSync("git", ["add", "src/domain/calculate.js"], {
      cwd: fixture.root,
    });
    execFileSync("git", ["commit", "--quiet", "-m", "drift source"], {
      cwd: fixture.root,
    });

    expect(
      getCoreDrift({
        manifest: fixtureManifest,
        repositoryRoot: fixture.root,
        scopes: ["HEAD"],
      }),
    ).toEqual([
      expect.objectContaining({ scope: "HEAD", type: "content-mismatch" }),
    ]);
  });

  test("index independently reports a newly staged unclassified domain source", async () => {
    const { getCoreDrift } = await import(
      "../../scripts/miniapp/check-core-drift.mjs"
    );
    const fixture = createRepositoryFixture();
    const newRulePath = path.join(fixture.root, "src/domain/new-rule.js");
    writeFileSync(newRulePath, "export const newRule = true;\n");
    execFileSync("git", ["add", "src/domain/new-rule.js"], {
      cwd: fixture.root,
    });
    unlinkSync(newRulePath);

    expect(
      getCoreDrift({
        repositoryRoot: fixture.root,
        scopes: ["index"],
      }),
    ).toContainEqual({
      scope: "index",
      sourcePath: "src/domain/new-rule.js",
      type: "unclassified-source",
    });
  });

  test("HEAD independently reports a newly committed unclassified domain source", async () => {
    const { getCoreDrift } = await import(
      "../../scripts/miniapp/check-core-drift.mjs"
    );
    const fixture = createRepositoryFixture();
    writeFileSync(
      path.join(fixture.root, "src/domain/new-rule.js"),
      "export const newRule = true;\n",
    );
    execFileSync("git", ["add", "src/domain/new-rule.js"], {
      cwd: fixture.root,
    });
    execFileSync("git", ["commit", "--quiet", "-m", "new rule"], {
      cwd: fixture.root,
    });

    expect(
      getCoreDrift({
        repositoryRoot: fixture.root,
        scopes: ["HEAD"],
      }),
    ).toContainEqual({
      scope: "HEAD",
      sourcePath: "src/domain/new-rule.js",
      type: "unclassified-source",
    });
  }, 15_000);

  test("each scope uses its own manifest classification", async () => {
    const { getCoreDrift } = await import(
      "../../scripts/miniapp/check-core-drift.mjs"
    );
    const fixture = createRepositoryFixture();
    const newRulePath = path.join(fixture.root, "src/domain/new-rule.js");
    writeFileSync(newRulePath, "export const newRule = true;\n");
    writeFileSync(
      fixture.manifestPath,
      serializeManifest({
        shared: ["src/domain/calculate.js"],
        webOnly: ["src/domain/new-rule.js"],
      }),
    );
    execFileSync(
      "git",
      ["add", "src/domain/new-rule.js", "scripts/miniapp/shared-source-manifest.mjs"],
      { cwd: fixture.root },
    );
    writeFileSync(fixture.manifestPath, serializeManifest(fixtureManifest));

    expect(
      getCoreDrift({ repositoryRoot: fixture.root, scopes: ["index"] }),
    ).toEqual([]);
    expect(
      getCoreDrift({ repositoryRoot: fixture.root, scopes: ["working-tree"] }),
    ).toContainEqual({
      scope: "working-tree",
      sourcePath: "src/domain/new-rule.js",
      type: "unclassified-source",
    });
  });

  test("missing mirror cannot pass even when the source also disappears", async () => {
    const { getCoreDrift } = await import(
      "../../scripts/miniapp/check-core-drift.mjs"
    );
    const fixture = createRepositoryFixture();
    unlinkSync(fixture.sourcePath);
    unlinkSync(fixture.mirrorPath);

    expect(
      getCoreDrift({
        manifest: fixtureManifest,
        repositoryRoot: fixture.root,
        scopes: ["working-tree"],
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "missing-source" }),
        expect.objectContaining({ type: "missing-mirror" }),
      ]),
    );
  });

  test("extra mirror files are reported and removed by sync", async () => {
    const { getCoreDrift } = await import(
      "../../scripts/miniapp/check-core-drift.mjs"
    );
    const { syncSharedCore } = await import(
      "../../scripts/miniapp/sync-core.mjs"
    );
    const fixture = createRepositoryFixture();
    const extraPath = path.join(
      fixture.root,
      "miniapp/src/shared/domain/removed-rule.js",
    );
    writeFileSync(extraPath, "export const stale = true;\n");

    expect(
      getCoreDrift({
        manifest: fixtureManifest,
        repositoryRoot: fixture.root,
        scopes: ["working-tree"],
      }),
    ).toEqual([
      expect.objectContaining({
        mirrorPath: "miniapp/src/shared/domain/removed-rule.js",
        scope: "working-tree",
        type: "extra-mirror",
      }),
    ]);

    syncSharedCore({
      manifest: fixtureManifest,
      sourceRoot: fixture.root,
      targetRoot: path.join(fixture.root, "miniapp/src/shared"),
    });
    expect(() => readFileSync(extraPath)).toThrow();
  });

  test("sync copies canonical bytes and never writes back to Web source", async () => {
    const { syncSharedCore } = await import(
      "../../scripts/miniapp/sync-core.mjs"
    );
    const fixture = createRepositoryFixture();
    const sourceBytes = Buffer.from([0x65, 0x78, 0x70, 0x6f, 0x72, 0x74, 0x0a]);
    writeFileSync(fixture.sourcePath, sourceBytes);
    writeFileSync(fixture.mirrorPath, "different\n");

    syncSharedCore({
      manifest: fixtureManifest,
      sourceRoot: fixture.root,
      targetRoot: path.join(fixture.root, "miniapp/src/shared"),
    });

    expect(readFileSync(fixture.sourcePath)).toEqual(sourceBytes);
    expect(readFileSync(fixture.mirrorPath)).toEqual(sourceBytes);
  });

  test("Web and miniapp entry points return the same golden calculation fields", async () => {
    const [{ calculateMatchup: webCalculate }, { calculateMatchup: miniCalculate }] =
      await Promise.all([
        import("../../src/domain/calculate.js"),
        import("../../miniapp/src/shared/domain/calculate.js"),
      ]);

    const webResult = projectCalculation(webCalculate(snapshot, battleInput));
    const miniResult = projectCalculation(miniCalculate(snapshot, battleInput));

    expect(webResult).toEqual({
      forward: [{
        additionalDamage: 0,
        actualPower: 50,
        error: null,
        singleHitDamage: 60,
        status: "exact",
        totalDamage: 60,
      }],
      reverse: [{
        additionalDamage: 0,
        actualPower: 175,
        error: null,
        singleHitDamage: 180,
        status: "exact",
        totalDamage: 180,
      }],
    });
    expect(miniResult).toEqual(webResult);
  });

  test("Web and miniapp preserve the same needs-input result", async () => {
    const [{ calculateMatchup: webCalculate }, { calculateMatchup: miniCalculate }] =
      await Promise.all([
        import("../../src/domain/calculate.js"),
        import("../../miniapp/src/shared/domain/calculate.js"),
      ]);
    const unresolvedSkill = {
      basePower: 1,
      category: "physical",
      id: "skill_enemy_power",
      name: "怨力打击",
      provenance: { ruleId: { source: "fixture" } },
      ruleId: "enemy_skill_power_multiplier",
      ruleParams: {
        contextKey: "enemySkillPower",
        multiplier: 3,
      },
      type: "恶",
    };
    const unresolvedSnapshot = {
      ...snapshot,
      skills: [...snapshot.skills, unresolvedSkill],
    };
    const unresolvedInput = {
      ...battleInput,
      sides: {
        ...battleInput.sides,
        attacker: {
          ...battleInput.sides.attacker,
          skills: {
            four: [unresolvedSkill.id, null, null, null],
            single: unresolvedSkill.id,
          },
        },
      },
    };

    const webResult = projectCalculation(
      webCalculate(unresolvedSnapshot, unresolvedInput),
    );
    const miniResult = projectCalculation(
      miniCalculate(unresolvedSnapshot, unresolvedInput),
    );

    expect(webResult.forward[0]).toEqual({
      additionalDamage: 0,
      actualPower: null,
      error: "需要敌方技能威力",
      singleHitDamage: null,
      status: "needs_input",
      totalDamage: null,
    });
    expect(miniResult).toEqual(webResult);
  });

  test("current worktree, index, and HEAD all match the manifest", async () => {
    const { getCoreDrift } = await import(
      "../../scripts/miniapp/check-core-drift.mjs"
    );

    expect(
      getCoreDrift({
        repositoryRoot,
        scopes: ["working-tree", "index", "HEAD"],
      }),
    ).toEqual([]);
  }, 10_000);
});
