// @vitest-environment node
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createServer } from "vite";
import { executeCli } from "../../src/cli/rock-calculator-cli.js";
import { loadWebCalculator } from "../../scripts/cli/web-calculator.mjs";
import { preparePreviewSource } from "../../scripts/build-preview-release.mjs";

const root = process.cwd();
let server;
let calculate;
let web;
let core;
let helpers;
let inputDirectory;
let sourceRoot;
const load = relative => server.ssrLoadModule(path.resolve(sourceRoot, relative).replaceAll("\\", "/"));
const stats = { hp: 100, physicalAttack: 100, magicalAttack: 100, physicalDefense: 100, magicalDefense: 100, speed: 100 };

function fixture() {
  const identity = key => ({ catalogId: "s5-cli-fixture", key, mechanicKey: key });
  const traits = ["minggulong", "abu", "lily-of-valley", "unknown"].map(key => ({
    id: `trait-${key}`, name: key, previewIdentity: identity(key),
  }));
  const spirits = ["ordinary", ...traits.map(trait => trait.name)].map(name => ({
    id: name, fullName: name, name, types: ["普"], raceStats: { ...stats },
    traitIds: name === "ordinary" ? [] : [`trait-${name}`],
    ...(name === "ordinary" ? {} : { previewIdentity: identity(name) }),
  }));
  return {
    meta: { id: "s4-2026-09-10", rulesVersion: "s4-2026-09-10", serverId: "cn", seasonId: "S5", catalogVersion: "latest-fixture", counts: { spirits: 999 } },
    spirits, traits,
    skills: [
      { id: "hit", name: "普通攻击", category: "physical", type: "普", cost: 1, basePower: 60 },
      { id: "dream", name: "筑梦", category: "status", type: "萌", cost: 3, basePower: null },
    ],
    learnsets: spirits.map(spirit => ({ spiritId: spirit.id, skillIds: ["hit", "dream"] })),
    typeChart: null,
  };
}

function battle(attacker = "ordinary", defender = "ordinary") {
  const side = spiritId => ({ spiritId, nature: "neutral", displayIvs: Object.fromEntries(Object.keys(stats).map(key => [key, 60])),
    skills: { single: "hit", four: ["hit", null, null, null] } });
  const direction = () => ({ selectedSkillIndex: 0, selectedDamageSource: "skill", currentHp: null, context: {}, overrides: {} });
  return { mode: "single", level: 60, sides: { attacker: side(attacker), defender: side(defender) },
    directions: { forward: direction(), reverse: direction() } };
}

function cliInput(input) {
  const filename = path.join(inputDirectory, "input.json");
  writeFileSync(filename, JSON.stringify(input), "utf8");
  return ["--input", filename];
}

beforeAll(async () => {
  inputDirectory = mkdtempSync(path.join(tmpdir(), "roco-cli-web-test-"));
  sourceRoot = preparePreviewSource({ root, reuse: true, allowFetch: false }).source;
  server = await createServer({ root: sourceRoot, configFile: false, appType: "custom", server: { middlewareMode: true, watch: null, hmr: false, ws: false },
    optimizeDeps: { noDiscovery: true, include: [] } });
  calculate = await loadWebCalculator(server, sourceRoot);
  web = await load("src/features/balance-comparison/model.js");
  core = await load("src/domain/calculate.js");
  helpers = await load("src/state/trait-values.js");
}, 120000);

afterAll(async () => {
  await server?.close();
  if (inputDirectory) rmSync(inputDirectory, { recursive: true, force: true });
});

describe("CLI fixed-source Web calculation parity", () => {
  test("normal nature, IVs and single-row contract match the core", () => {
    const snapshot = fixture();
    const input = battle();
    input.sides.attacker.nature = "adamant";
    input.sides.attacker.natureMultipliers = { physicalAttack: 1.2, magicalAttack: 0.9 };
    const result = calculate(snapshot, input);
    expect(result.forward.results).toHaveLength(1);
    expect(result.forward.selectedResult.totalDamage).toBe(core.calculateMatchup(snapshot, input).forward.selectedResult.totalDamage);
    expect(result.forward.selectedResult.totalDamage).toBeGreaterThan(calculate(snapshot, battle()).forward.selectedResult.totalDamage);
    expect(result.forward.selectedResult.damagePresentation.damage).toBe(result.forward.selectedResult.totalDamage);
  });

  test("native owner default99 and explicit levels change all combat panels without mutating input", () => {
    const snapshot = fixture();
    const input = battle("minggulong");
    const before = structuredClone(input);
    const current = calculate(snapshot, input);
    const expected = web.buildBalanceComparison({ snapshot, state: input }).afterView.result.selectedResult;
    expect(current.forward.selectedResult.combatPanel).toEqual(expected.combatPanel);
    expect(input).toEqual(before);
    const damages = [99, 89, 79, 60].map(level => calculate(snapshot, {
      ...input, sides: { ...input.sides, attacker: { ...input.sides.attacker, level } },
    }).forward.selectedResult.totalDamage);
    expect(damages[0]).toBe(current.forward.selectedResult.totalDamage);
    expect(damages).toEqual([...damages].sort((left, right) => right - left));
    expect(new Set(damages).size).toBe(4);
  });

  test("two owner levels are independent and below80 incoming trait is mirrored", () => {
    const snapshot = fixture();
    const input = battle("abu", "minggulong");
    input.sides.attacker.level = 80;
    input.sides.defender.level = 99;
    const at99 = calculate(snapshot, input);
    input.sides.defender.level = 79;
    const at79 = calculate(snapshot, input);
    expect(at79.forward.selectedResult.totalDamage).toBeGreaterThan(at99.forward.selectedResult.totalDamage);
    expect(at99.forward.selectedResult.combatPanel.attacker).toEqual(at79.forward.selectedResult.combatPanel.attacker);
    expect(at99.reverse.selectedResult.combatPanel.attacker).not.toEqual(at79.reverse.selectedResult.combatPanel.attacker);
  });

  test("explicit dream and current parasitism use shared settlement; repeated evaluation never adds stacks", () => {
    const snapshot = fixture();
    const input = battle("lily-of-valley");
    input.weather = "dream";
    input.negativeStatuses = { defender: { parasitism: 3 } };
    input.calculationOptions = { includeNegativeStatusSettlement: true };
    const before = structuredClone(input);
    const first = calculate(snapshot, input).forward.selectedResult;
    expect(first.negativeStatusSettlement.stacks.parasitism).toBe(3);
    expect(first.damagePresentation.statusDamage).toBeGreaterThan(0);
    expect(first.damagePresentation.damage).toBe(first.totalDamage + first.negativeStatusSettlement.actualStatusDamage);
    expect(calculate(snapshot, input).forward.selectedResult).toEqual(first);
    expect(input).toEqual(before);
    input.calculationOptions.includeNegativeStatusSettlement = false;
    expect(calculate(snapshot, input).forward.selectedResult.damagePresentation.statusDamage).toBe(0);
  });

  test("selecting dream alone does not invent weather, damage or parasitism", () => {
    const snapshot = fixture();
    const input = battle("lily-of-valley");
    input.sides.attacker.skills.single = "dream";
    input.calculationOptions = { includeNegativeStatusSettlement: true };
    const result = calculate(snapshot, input).forward.selectedResult;
    expect(result.totalDamage).toBeNull();
    expect(result.damagePresentation.statusDamage).toBe(0);
    expect(input).not.toHaveProperty("weather");
  });

  test("unimplemented S5 guard removes damage, panels, gain summaries and settlements", () => {
    const result = calculate(fixture(), battle("unknown")).forward.selectedResult;
    expect(result).toMatchObject({ status: "unsupported", totalDamage: null, hpPercent: null,
      gainSources: {}, formulaSteps: [], negativeStatusSettlement: null });
    expect(result.combatPanel).toBeUndefined();
    expect(result.damagePresentation.damage).toBeNull();
  });

  test("legacy global level and unauthorized owner level are explicitly rejected", () => {
    expect(() => calculate(fixture(), { ...battle(), level: 99 })).toThrow("顶层 level");
    const input = battle();
    input.sides.attacker.level = 99;
    expect(() => calculate(fixture(), input)).toThrow("普通精灵");
    input.sides.attacker.spiritId = "minggulong";
    input.sides.attacker.ignoreTraits = true;
    expect(() => calculate(fixture(), input)).toThrow("禁用特性");
  });

  test("executeCli stays synchronous, uses injected data counts and source metadata, and retains explicit inputs", () => {
    const snapshot = fixture();
    const options = { cwd: root, projectRoot: root, snapshotOverride: snapshot, calculateOverride: calculate,
      sourceMetadata: { sourceRevision: "fixture-revision" } };
    const meta = executeCli(["meta"], options);
    expect(meta.engine).toMatchObject({ dataVersion: "s4-2026-09-10", seasonId: "S5", catalogVersion: "latest-fixture", sourceRevision: "fixture-revision" });
    expect(meta.counts.spirits).toBe(5);
    const input = { attacker: { spirit: "minggulong", skill: "普通攻击", nature: "固执", level: 89 },
      defender: { spirit: "ordinary", skill: "普通攻击" }, weather: "dream",
      calculationOptions: { includeNegativeStatusSettlement: true }, negativeStatuses: { defender: { parasitism: 3 } } };
    const result = executeCli(["calculate", ...cliInput(input)], options);
    expect(result).not.toBeInstanceOf(Promise);
    expect(result.results.forward.selected.negativeStatusSettlement.stacks.parasitism).toBe(3);
    expect(result.results.forward.selected.damagePresentation.statusDamage).toBeGreaterThan(0);
    const global = executeCli(["meta", "--server", "global"], options);
    expect(global.engine.seasonId).not.toBe("S5");
    expect(global.engine.sourceRevision).toBeNull();
  });

  test("native traitValues materialize into both roles and agree with explicit owner level", async () => {
    const snapshot = fixture();
    const input = battle("minggulong");
    const { getS5PreviewTraitInputs } = await load("src/domain/s5-preview-traits.js");
    const control = getS5PreviewTraitInputs(snapshot.traits[0]).find(entry => entry.contextKey.endsWith("BattleLevel"));
    input.sides.attacker.traitValues = { [helpers.canonicalTraitControlKey(control)]: 79 };
    const native = calculate(snapshot, input);
    delete input.sides.attacker.traitValues;
    input.sides.attacker.level = 79;
    const explicit = calculate(snapshot, input);
    expect(native.forward.selectedResult.totalDamage).toBe(explicit.forward.selectedResult.totalDamage);
    expect(native.reverse.selectedResult.totalDamage).toBe(explicit.reverse.selectedResult.totalDamage);
  });
});
