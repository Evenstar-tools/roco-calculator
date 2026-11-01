// @vitest-environment node
import { existsSync, readFileSync } from "node:fs";
import { beforeAll, describe, expect, test } from "vitest";
import { applyS5Candymo } from "../../scripts/bwiki/apply-s5-candymo.mjs";
import { buildS5BwikiSnapshot, buildS5BwikiRuntime } from "../../scripts/s5-bwiki-runtime.mjs";
import { buildS5PopularConfigLibrary } from "../../scripts/s5-preview-presets.mjs";
import { withWebPreview } from "../../src/features/s5-preview/with-web-preview.js";
import { chooseDefaultSkillIds, getLegalSkillIds } from "../../src/domain/skill-loadout.js";
import { getNature } from "../../src/domain/natures.js";
import { unpackCatalog, skillLearners } from "../../src/features/skill-query/catalog.js";
import { withS5AnnouncementCatalog } from "../../src/features/skill-query/s5-announcement-catalog.js";
import { spiritSkills } from "../../src/features/skill-query/query-model.js";
import { packS5RuntimeRelations, restoreS5RuntimeRelations } from "../../src/data/s5-runtime-relations.js";
import { resolveSpiritFormRole } from "../../src/features/team-ability/domain/spirit-form-role.js";
import { selectSpirit, selectFourSkill, getRestorableDefaultSkills, restoreDefaultSkills } from "../../src/state/calculator-session.js";
import { createInitialState } from "../../src/state/defaults.js";
import { buildCalculatorViewModel } from "../../src/domain/calculator-view-model.js";
import { getSkillEffectInputs } from "../../src/domain/skill-effects.js";
import { describeSkillResolution } from "../../src/domain/skill-presentation.js";
import { createCalculatorSessionStore } from "../../src/runtime/workspace-store.js";
import { withS5PreviewCalculationGuard } from "../../src/features/s5-preview/calculation-guard.js";

const read = file => JSON.parse(readFileSync(file, "utf8"));
const evidence = read("data/reviewed/candymo-s5-20261101.json");
const names = ["阿布", "超能阿布", "呆呆铃", "跳跳铃", "铃兰夫人"];
const dragonDefaults = ["圣龙狂斩", "龙之爪牙", "画龙点睛", "光之矛"];
const lilyDefaults = ["维管束重构", "恋恋不舍", "筑梦", "根吸收"];

describe("reviewed Candymo S5 gaps", () => {
  let snapshot, runtime;
  beforeAll(async () => {
    snapshot = await buildS5BwikiSnapshot();
    runtime = restoreS5RuntimeRelations(packS5RuntimeRelations(await buildS5BwikiRuntime()));
  }, 30000);

  test("keeps saved owner IDs and independent boss identity, replacing only confirmed placeholders", () => {
    const expected = [
      ["spirit_preview_s5_abu", "final", [126, 105, 122, 45, 80, 100], "圣龙的心愿", "abu"],
      ["spirit_preview_s5_super-abu", "boss", [126, 105, 122, 45, 80, 100], "圣龙的守护", "super-abu"],
      ["spirit_preview_s5_daidailing", "growth", [82, 27, 49, 66, 69, 36], "幸福铃音", "lily-of-valley"],
      ["spirit_preview_s5_tiaotiaoling", "growth", [109, 37, 65, 88, 92, 48], "幸福铃音", "lily-of-valley"],
      ["spirit_preview_s5_lily-of-valley", "final", [136, 46, 81, 110, 115, 60], "幸福铃音", "lily-of-valley"],
    ];
    for (const [index, [id, formRole, stats, traitName, mechanicKey]] of expected.entries()) {
      const spirit = runtime.spirits.find(entry => entry.id === id);
      expect(spirit).toMatchObject({ fullName: names[index], formRole, traitName, introducedSeason: "S5",
        previewIdentity: { raceStatsPlaceholder: false, formalIdPending: false }, changeInfo: { isNew: true } });
      expect(resolveSpiritFormRole(spirit)).toMatchObject({ formRole, formRoleStatus: "verified" });
      expect(spirit.changeInfo.isFinal || spirit.stage === "首领").toBe(true);
      expect(["hp", "physicalAttack", "physicalDefense", "magicalAttack", "magicalDefense", "speed"]
        .map(key => spirit.raceStats[key])).toEqual(stats);
      const trait = runtime.traits.find(entry => spirit.traitIds.includes(entry.id));
      expect(trait).toMatchObject({ id: id.replace("spirit_", "trait_"), name: traitName,
        previewIdentity: { mechanicKey } });
    }
    expect(runtime.spirits.find(entry => entry.fullName === "超能阿布").stage).toBe("首领");
    expect(runtime.spirits.some(entry => entry.fullName === "铃兰")).toBe(false);
    const old = withWebPreview(read("data/snapshots/current.json"));
    const id = "spirit_preview_s5_boss-abu";
    const { previewDefaults, ...unchangedBoss } = snapshot.spirits.find(entry => entry.id === id);
    expect(unchangedBoss).toEqual(old.spirits.find(entry => entry.id === id));
    expect(previewDefaults).toMatchObject({ authority: "user", natureId: "naughty" });
    expect(resolveSpiritFormRole(unchangedBoss).formRole).toBe("unknown");
    expect(snapshot.learnsets.find(entry => entry.spiritId === id).skillIds).toEqual([]);
  });

  test("both family directions, defaults and three learning methods survive runtime packing", () => {
    for (const [index, name] of names.entries()) {
      const spirit = runtime.spirits.find(entry => entry.fullName === name);
      const familyNames = spirit.evolutionChainIds.map(id => runtime.spirits.find(entry => entry.id === id).fullName);
      expect(familyNames).toEqual(index < 2 ? names.slice(0, 2) : names.slice(2));
      const pool = runtime.learnsets.find(entry => entry.spiritId === spirit.id);
      expect(pool.skillIds).toHaveLength(index < 2 ? 45 : 44);
      expect(pool.bloodlineSkillIds).toHaveLength(18);
      expect(chooseDefaultSkillIds(runtime, spirit.id).map(id => runtime.skills.find(skill => skill.id === id).name))
        .toEqual(index < 2 ? dragonDefaults : lilyDefaults);
      expect(Object.values(pool.acquisitions).flat()).toContain("技能石");
      expect(Object.values(pool.acquisitions).flat()).toContain("普通系血脉");
      expect(JSON.stringify(pool.acquisitions)).not.toMatch(/Lv\.(?:null|undefined)/u);
    }
    const slash = runtime.skills.find(skill => skill.name === "圣龙狂斩");
    expect(slash).toMatchObject({ category: "physical", type: "龙", cost: 3, basePower: 160,
      s5LevelChangeRule: "saint-dragon-slash" });
    expect(runtime.learnsets.find(pool => pool.spiritId === "spirit_preview_s5_abu").acquisitions[slash.id])
      .toEqual(["默认学习"]);
    expect(runtime.skills.find(skill => skill.name === "画龙点睛")).toMatchObject({ category: "status", cost: 1, basePower: null });
  });

  test("normal skill query sees the new skill, learners and exact family acquisition text", () => {
    const catalog = unpackCatalog(read("public/data/skill-query/catalog.json"));
    const season = withS5AnnouncementCatalog(catalog, runtime).seasons.find(entry => entry.id === "S5");
    const slash = season.skills.find(skill => skill.name === "圣龙狂斩");
    expect(skillLearners(season, slash.id).map(spirit => spirit.fullName).sort()).toEqual(["超能阿布", "阿布"].sort());
    const vascular = season.skills.find(skill => skill.name === "维管束重构");
    const learners = skillLearners(season, vascular.id);
    for (const name of names.slice(2)) {
      expect(learners).toContainEqual(expect.objectContaining({ fullName: name, methods: ["默认学习 Lv.20"] }));
      const spirit = season.spirits.find(entry => entry.fullName === name);
      expect(spiritSkills(season, spirit.id)).toHaveLength(44);
    }
  });

  test("presets contain four complete configured additions with valid natures and preserve the original library", () => {
    const base = read("public/data/presets/pvp-popular-configs.json");
    const raw = buildS5PopularConfigLibrary();
    expect(raw.entries.slice(0, base.entries.length)).toEqual(base.entries);
    const library = buildS5PopularConfigLibrary(runtime);
    expect(library.entryCount).toBe(249);
    for (const name of ["阿布", "超能阿布", "铃兰夫人", "圣龙阿布"]) {
      const spirit = runtime.spirits.find(entry => entry.fullName === name);
      const entry = library.entries.find(item => item.spiritId === spirit.id);
      expect(entry.skills).toEqual(chooseDefaultSkillIds(runtime, spirit.id));
      expect(getNature(entry.natureId).id).toBe(entry.natureId);
      expect(Object.values(entry.displayIvs).filter(value => value === 60)).toHaveLength(3);
    }
  });

  test("user Abu family defaults apply on selection and restore without inventing boss learning relations", () => {
    const ivs = { hp: 60, physicalAttack: 60, physicalDefense: 0, magicalAttack: 0, magicalDefense: 0, speed: 60 };
    for (const name of ["阿布", "超能阿布", "圣龙阿布"]) {
      const spirit = runtime.spirits.find(entry => entry.fullName === name);
      for (const side of ["attacker", "defender"]) {
        const initialState = createInitialState(runtime);
        const selected = selectSpirit(initialState, { initialState, side, snapshot: runtime, spiritId: spirit.id }).state;
        expect(selected.sides[side]).toMatchObject({ nature: "naughty", displayIvs: ivs });
        const defaults = chooseDefaultSkillIds(runtime, spirit.id);
        expect(defaults.map(id => runtime.skills.find(skill => skill.id === id).name)).toEqual(dragonDefaults);
        expect(selected.sides[side].skills.four.map(entry => typeof entry === "string" ? entry : entry.skillId)).toEqual(defaults);
        const cleared = selectFourSkill(selected, { side, snapshot: runtime, index: 3, skillId: null }).state;
        expect(getRestorableDefaultSkills(cleared, { side, snapshot: runtime })).toEqual(defaults);
        const restored = restoreDefaultSkills(cleared, { side, snapshot: runtime }).state;
        expect(restored.sides[side].skills.four.map(entry => typeof entry === "string" ? entry : entry.skillId)).toEqual(defaults);
        const personalConfiguration = { ...selected.sides[side], natureId: "adamant", nature: "adamant",
          displayIvs: { ...ivs, hp: 17 }, skills: { single: null, four: [null, null, null, null] } };
        const personal = selectSpirit(initialState, { initialState, side, snapshot: runtime, spiritId: spirit.id, personalConfiguration }).state;
        expect(personal.sides[side]).toMatchObject({ nature: "adamant", displayIvs: { hp: 17 }, skills: { four: [null, null, null, null] } });
      }
    }
    expect(getLegalSkillIds(runtime, "spirit_preview_s5_boss-abu")).toEqual([]);
    expect(runtime.learnsets.find(pool => pool.spiritId === "spirit_preview_s5_boss-abu").acquisitions ?? {}).toEqual({});
  });

  test("Lily's two default attacks calculate, persist their conditions and keep energy recovery separate from cost", () => {
    const lily = runtime.spirits.find(entry => entry.fullName === "铃兰夫人");
    const defender = runtime.spirits.find(entry => entry.fullName === "烈火守护");
    const state = createInitialState(runtime);
    state.mode = "four";
    state.sides.attacker.spiritId = lily.id;
    state.sides.attacker.skills.four = chooseDefaultSkillIds(runtime, lily.id);
    state.sides.defender.spiritId = defender.id;
    state.sides.defender.skills.four = chooseDefaultSkillIds(runtime, defender.id);
    const evaluate = state => withS5PreviewCalculationGuard(buildCalculatorViewModel({ snapshot: runtime, state, activeDirection: "forward" }), runtime, state);
    const initial = evaluate(state).skillResultsByDirection.forward;
    expect(initial.slice(0, 2).map(result => result.status)).toEqual(["exact", "exact"]);
    expect(initial.slice(0, 2).every(result => result.totalDamage > 0)).toBe(true);
    expect(initial.slice(0, 2).map(result => result.resolvedPower)).toEqual([110, 110]);
    for (const index of [0, 1]) {
      const skillId = state.sides.attacker.skills.four[index];
      const skill = runtime.skills.find(entry => entry.id === skillId);
      const [control] = getSkillEffectInputs(skill);
      expect(skill.s5StatusEffectPending).toBeUndefined();
      state.sides.attacker.skills.four[index] = { skillId, context: { [control.id]: true } };
    }
    const records = new Map();
    const storage = { getItem: key => records.get(key) ?? null, setItem: (key, value) => records.set(key, value) };
    createCalculatorSessionStore({ storage }).saveSession({ present: state, past: [], future: [] });
    const restored = createCalculatorSessionStore({ storage }).loadSession().present;
    expect(restored.sides.attacker.skills).toEqual(state.sides.attacker.skills);
    for (let repeat = 0; repeat < 2; repeat += 1) {
      const active = evaluate(restored).skillResultsByDirection.forward;
      expect(active.slice(0, 2).map(result => result.resolvedPower)).toEqual([110, 140]);
      expect(active.slice(0, 2).map(result => result.skillCost)).toEqual([4, 4]);
      expect(active[0].totalDamage).toBe(initial[0].totalDamage);
      expect(describeSkillResolution(active[0])).toBe("回复3能量（伤害不变）");
    }
  });

  test("local art and trait icons are present while reused skill icons and Abu portrait remain intact", () => {
    for (const name of names) {
      const spirit = runtime.spirits.find(entry => entry.fullName === name);
      const trait = runtime.traits.find(entry => spirit.traitIds.includes(entry.id));
      expect(existsSync(`public${spirit.asset.localUrl}`)).toBe(true);
      expect(existsSync(`public${trait.iconUrl}`)).toBe(true);
    }
    expect(runtime.spirits.find(entry => entry.fullName === "阿布").asset.localUrl).toBe("/assets/spirits/s5-preview/abu.png");
    for (const name of ["圣龙狂斩", "龙之爪牙", "画龙点睛", "维管束重构", "恋恋不舍"]) {
      const icon = runtime.skills.find(entry => entry.name === name).iconUrl;
      expect(icon).toMatch(/^\/assets\/skills\//u);
      expect(existsSync(`public${icon}`)).toBe(true);
    }
  });

  test("rejects mismatched game identities and non-CN sources; repeat overlay is pure and idempotent", () => {
    const before = structuredClone(snapshot);
    expect(applyS5Candymo(snapshot, evidence)).toEqual(snapshot);
    expect(snapshot).toEqual(before);
    const bad = structuredClone(evidence);
    bad.skills.find(skill => skill.name === "防御").sourceId = 999999;
    expect(() => applyS5Candymo(snapshot, bad)).toThrow("技能身份冲突");
    expect(() => applyS5Candymo({ ...snapshot, meta: { ...snapshot.meta, serverId: "global" } }, evidence)).toThrow("完整国服");
    expect(() => applyS5Candymo(read("data/snapshots/current.json"), evidence)).toThrow("完整国服");
    expect(read("data/snapshots/current.json").meta).not.toHaveProperty("s5CandymoSync");
    expect(snapshot.meta.s5CandymoSync.authority).toBe("third-party-game-data-site");
  });
});
