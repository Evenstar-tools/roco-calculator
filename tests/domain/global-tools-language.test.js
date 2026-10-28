import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import { localizeToolText } from "../../src/i18n/useToolLocale.js";
import { localizeType } from "../../src/i18n/type-labels.js";
import { localizeGlobalSkill, localizeGlobalSpirit } from "../../src/runtime/global-entity-localization.js";
import { buildDamageComparisonReport, damageComparisonMarkdown } from "../../src/features/damage-comparison/export.js";
import { damageComparisonXlsx } from "../../src/features/damage-comparison/export-xlsx.js";
import { localizeAcquisitionMethods } from "../../src/features/skill-query/acquisition-text.js";
import { unpackCatalog } from "../../src/features/skill-query/catalog.js";
import { createSkillDamageRanking, getDamageComparisonSelection, getDamageComparisonTemplate, DAMAGE_COMPARISON_SCOPE } from "../../src/domain/skill-damage-ranking.js";
import { createProductInitialState, selectSpirit } from "../../src/state/calculator-session.js";
import { createSpeedTargetCatalog } from "../../src/features/team-ability/domain/ranking-tools.js";
import { resolveSpiritFormRole } from "../../src/features/team-ability/domain/spirit-form-role.js";

const snapshot = JSON.parse(readFileSync("public/data/global-runtime.json", "utf8"));
const catalog = unpackCatalog(JSON.parse(readFileSync("public/data/global/skill-query/catalog.json", "utf8")));
const chinese = /[\u3400-\u9fff]/u;

async function comparisonFixture(templateId = "standard-hp-v1", inheritTargetStatuses = false) {
  const initial = createProductInitialState(snapshot);
  let state = initial;
  for (const [side, name] of [["attacker", "迪莫"], ["defender", "魔力猫"]]) {
    state = selectSpirit(state, { initialState: initial, snapshot, side, spiritId: snapshot.spirits.find(spirit => spirit.fullName === name).id }).state;
  }
  state.mode = "single";
  state.sides.attacker.skills.single = snapshot.skills.find(skill => skill.name === "光球").id;
  state.marks.defender.negative = { id: "starfall", stacks: 3 };
  state.negativeStatuses.defender.freeze = 2;
  const reduced = { ...snapshot, spirits: snapshot.spirits.filter(spirit => ["迪莫", "魔力猫"].includes(spirit.fullName)) };
  const source = { state, direction: "forward" };
  const ranking = await createSkillDamageRanking({ snapshot: reduced, ...source, scope: "all", templateId, inheritTargetStatuses });
  const model = { rows: ranking.rows, ranking, selection: getDamageComparisonSelection(reduced, state), templateId,
    template: getDamageComparisonTemplate(state, "forward", templateId), selectedSkillIndex: 0, scope: "all", filter: "all",
    scopeDescription: DAMAGE_COMPARISON_SCOPE, inheritTargetStatuses };
  return { snapshot: reduced, source, model };
}

test.each(["standard-hp-v1", "user-presets"])("Global %s damage exports translate metadata and templates while retaining calculated numbers", async templateId => {
  const fixture = await comparisonFixture(templateId);
  const before = JSON.stringify(fixture);
  const date = new Date("2026-10-28T00:00:00Z");
  const report = locale => buildDamageComparisonReport(fixture.snapshot, fixture.source, fixture.model, date, { locale });
  const cn = report("zh-CN");
  for (const locale of ["en", "ja"]) {
    const localized = report(locale);
    expect(localized.title).toContain(localizeGlobalSpirit(fixture.model.selection.spirit, locale).fullName);
    expect(localized.title).toContain(localizeGlobalSkill(fixture.model.selection.selected.skill, locale).name);
    expect(localized.rows.map(row => row.filter(value => typeof value === "number"))).toEqual(cn.rows.map(row => row.filter(value => typeof value === "number")));
    const markdown = damageComparisonMarkdown(localized);
    const workbook = unzipSync(damageComparisonXlsx(localized));
    expect(strFromU8(workbook["xl/workbook.xml"])).toContain(localized.sheetName);
    if (locale === "en") {
      expect(markdown).not.toMatch(chinese);
      expect(strFromU8(workbook["xl/worksheets/sheet1.xml"])).not.toMatch(chinese);
      expect(markdown).toContain("Triggered stacks 0");
      expect(markdown).toContain("Starfall and existing Freeze reset to 0");
    } else {
      expect(markdown).toContain("被ダメージ結果");
      expect(markdown).not.toMatch(/触发层数|个体|攻击方|种族|未配置预设/u);
    }
  }
  expect(JSON.stringify(fixture)).toBe(before);
});

test("Global export retains selected status counts and Common class distinct from neutral nature", async () => {
  const fixture = await comparisonFixture("standard-hp-v1", true);
  fixture.model.rows[0] = { ...fixture.model.rows[0], spirit: { ...fixture.model.rows[0].spirit, types: ["普通"] } };
  const report = buildDamageComparisonReport(fixture.snapshot, fixture.source, fixture.model, new Date("2026-10-28T00:00:00Z"), { locale: "en" });
  expect(report.rows[0][2]).toBe("Common");
  expect(report.metadata[5][1]).toContain("3 stacks");
  expect(report.metadata[5][1]).toContain("Existing Freeze: 2 stacks");
});

test("every Global skill acquisition method has a translated display without modifying catalog filter keys", () => {
  const methods = [...new Set(catalog.seasons.flatMap(season => season.learnsets.flatMap(learnset => Object.values(learnset.acquisitions ?? {}).flat())))];
  const original = [...methods];
  expect(methods.length).toBeGreaterThan(50);
  const unresolved = methods.filter(method => chinese.test(localizeAcquisitionMethods([method], "en")));
  expect(unresolved).toEqual([]);
  const bubble = snapshot.skills.find(skill => skill.name === "气泡");
  for (const locale of ["en", "ja"]) {
    expect(localizeAcquisitionMethods(["解锁：[技能石]气泡"], locale)).toContain(localizeGlobalSkill(bubble, locale).name);
    expect(localizeAcquisitionMethods(["解锁：普通系血脉"], locale)).toContain(localizeType("普通", locale));
  }
  expect(localizeAcquisitionMethods(["解锁：Lv.7"], "en")).toBe("Learned at Lv. 7");
  expect(localizeAcquisitionMethods(["解锁：Lv.7"], "zh-CN")).toBe("解锁：Lv.7");
  expect(methods).toEqual(original);
});

test("Global final forms remain eligible in rankings with their namespaced IDs", () => {
  const names = ["迪莫", "魔力猫", "音速犬", "波普鹿"];
  const spirits = snapshot.spirits.filter(spirit => names.includes(spirit.fullName));
  for (const spirit of spirits) {
    const originalId = { ...spirit, id: spirit.reference.sourceId };
    expect(resolveSpiritFormRole(spirit)).toEqual(resolveSpiritFormRole(originalId));
  }
  const targets = createSpeedTargetCatalog({ snapshot: { ...snapshot, spirits }, profiles: ["positive-max"] });
  expect(new Set(targets.map(target => target.name))).toEqual(new Set(names));
});

test("real Global ranking qualifiers and Drive traces render whole English phrases", () => {
  const targets = createSpeedTargetCatalog({ snapshot, profiles: ["positive-max", "special"] });
  const labels = [...new Set(targets.flatMap(target => [target.qualifier, target.specialLabel, target.profileLabel]).filter(Boolean))];
  expect(labels.filter(label => chinese.test(localizeToolText(label, "en")))).toEqual([]);
  expect(localizeToolText("{slot} 号位-{layers}", "en", { slot: 1, layers: 0 })).toBe("Slot 1 · 0");
  expect(localizeToolText("第 2 回合 · 轮班 · 额外传动 · 使用后", "en")).toBe("Turn 2 · Gear Shift · Extra Drive · After use");
  expect(localizeToolText("啮合传递：自身 1 + 向心力 1 = 2 层", "en")).toBe("Gear Transfer: base 1 + Centripetal Force 1 = 2 Drive");
});
