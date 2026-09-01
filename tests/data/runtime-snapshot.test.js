import {
  existsSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { expect, test } from "vitest";

test("builds a compact runtime snapshot with precomputed pinyin search data", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "lovepvp-runtime-"));
  const sourcePath = path.join(directory, "source.json");
  const targetPath = path.join(directory, "runtime.json");
  const manifestPath = path.join(directory, "manifest.json");
  const source = {
    meta: {
      id: "s3-fixture",
      rulesVersion: "2026-07-23",
      sources: [{ title: "audit-only" }],
    },
    spirits: [
      {
        asset: { sourceUrl: "https://example.test/spirit.png" },
        evolutionChainNames: ["护主犬", "音速犬"],
        fullName: "音速犬",
        id: "spirit-sonic",
        provenance: { identity: { title: "audit-only" } },
        raceStats: { physicalAttack: 128 },
        traitIds: ["trait-focus"],
        types: ["火"],
      },
      {
        fullName: "护主犬",
        id: "spirit-guard",
        raceStats: { physicalAttack: 90 },
        traitIds: [],
        types: ["火"],
      },
    ],
    skills: [
      {
        basePower: 60,
      category: "magical",
      cost: 1,
      description: "造成魔法伤害。",
      asset: { sourceUrl: "https://example.test/skill-water-ripple.png" },
        id: "skill-water-ripple",
        name: "水之波纹",
        provenance: { basePower: { title: "audit-only" } },
        ruleId: null,
        ruleParams: null,
        type: "水",
      },
    ],
    learnsets: [
      {
        acquisitions: { "skill-water-ripple": ["解锁：Lv.1"] },
        provenance: { skillIds: { title: "audit-only" } },
        skillIds: ["skill-water-ripple"],
        spiritId: "spirit-sonic",
      },
    ],
    traits: [
      {
        affectsDamage: true,
        description: "入场首回合物攻提高。",
        id: "trait-focus",
        name: "专注力",
        provenance: { identity: { title: "audit-only" } },
        ruleId: "physical_power_first_turn",
        ruleParams: { multiplier: 2 },
      },
    ],
    typeChart: {
      matrix: { 火: { 水: 0.5 } },
      source: { title: "audit-only" },
      types: ["火", "水"],
    },
  };
  writeFileSync(sourcePath, JSON.stringify(source), "utf8");
  writeFileSync(
    manifestPath,
    JSON.stringify({
      assets: [
        {
          id: "spirit-sonic",
          localFile: "/assets/spirits/spirit-sonic.png",
        },
      ],
    }),
    "utf8",
  );

  const run = spawnSync(
    process.execPath,
    ["scripts/runtime-snapshot.mjs", sourcePath, targetPath, manifestPath],
    {
      cwd: process.cwd(),
      encoding: "utf8",
    },
  );

  expect(run.status, run.stderr).toBe(0);
  const runtime = JSON.parse(readFileSync(targetPath, "utf8"));
  expect(runtime.spirits[0]).toMatchObject({
    asset: {
      localUrl: "/assets/spirits/spirit-sonic.png",
    },
    evolutionChainIds: ["spirit-guard", "spirit-sonic"],
    fullName: "音速犬",
    initials: "ysq",
    pinyin: "yinsuquan",
  });
  expect(runtime.spirits[0].evolutionChainNames).toBeUndefined();
  expect(runtime.skills[0].searchText).toContain("shuizhibowen");
  expect(runtime.skills[0].searchText).toContain("szbw");
  expect(runtime.skills[0].iconUrl).toBe(
    "https://example.test/skill-water-ripple.png",
  );
  expect(runtime.learnsets[0]).toEqual({
    skillIds: ["skill-water-ripple"],
    spiritId: "spirit-sonic",
  });
  expect(runtime.meta.sources).toBeUndefined();
  expect(runtime.spirits[0].asset.sourceUrl).toBeUndefined();
  expect(runtime.spirits[1].asset).toBeUndefined();
  expect(runtime.spirits[0].provenance).toBeUndefined();
  expect(runtime.skills[0].provenance).toBeUndefined();
  expect(runtime.traits[0].provenance).toBeUndefined();
  expect(runtime.typeChart.source).toBeUndefined();
});

test("keeps the complete production roster, skill library, and local avatar set", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "rock-runtime-production-"));
  const targetPath = path.join(directory, "runtime.json");
  const run = spawnSync(
    process.execPath,
    [
      "scripts/runtime-snapshot.mjs",
      "data/snapshots/current.json",
      targetPath,
      "public/assets/spirits/manifest.json",
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
    },
  );

  expect(run.status, run.stderr).toBe(0);
  const runtime = JSON.parse(readFileSync(targetPath, "utf8"));
  const localAssets = runtime.spirits.filter(
    (spirit) => spirit.asset?.localUrl,
  );
  const localAssetPaths = localAssets.map((spirit) =>
    path.resolve("public", spirit.asset.localUrl.replace(/^\/+/, "")),
  );
  const missingAssets = localAssetPaths.filter(
    (assetPath) => !existsSync(assetPath),
  );

  const snapshot = JSON.parse(
    readFileSync("data/snapshots/current.json", "utf8"),
  );

  expect(snapshot.spirits.length).toBeGreaterThan(0);
  expect(snapshot.skills.length).toBeGreaterThan(0);
  expect(runtime.spirits).toHaveLength(snapshot.spirits.length);
  expect(runtime.skills).toHaveLength(snapshot.skills.length);
  expect(runtime.learnsets).toHaveLength(snapshot.learnsets.length);
  expect(localAssets).toHaveLength(snapshot.spirits.length);
  expect(new Set(localAssetPaths)).toHaveLength(snapshot.spirits.length);
  expect(missingAssets).toEqual([]);
});
