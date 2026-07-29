import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";
import { parseDetailPage } from "../../scripts/bwiki/parse-detail.mjs";
import { parseSpiritRows } from "../../scripts/bwiki/parse-spirits.mjs";
import { parseSkillRows } from "../../scripts/bwiki/parse-skills.mjs";
import {
  findDetailRevisionDrift,
  parseSpiritCsv,
} from "../../scripts/bwiki/build-snapshot.mjs";
import {
  applyReviewedOverrides,
  upstreamFingerprint,
} from "../../scripts/bwiki/reviewed-overrides.mjs";
import {
  collectAssetPlan,
  readImageDimensions,
  resolvePublicAssetPath,
} from "../../scripts/bwiki/sync-assets.mjs";

const spiritSource = {
  title: "精灵筛选",
  url: "https://wiki.biligame.com/rocom/精灵筛选",
  revision: 41360,
  fetchedAt: "2026-07-23T00:00:00.000Z",
  sha256: "spirit-fixture",
};

const skillSource = {
  title: "技能筛选",
  url: "https://wiki.biligame.com/rocom/技能筛选",
  revision: 40653,
  fetchedAt: "2026-07-23T00:00:00.000Z",
  sha256: "skill-fixture",
};

describe("BWIKI row parsers", () => {
  test("keeps a branch form as an independent spirit with provenance", async () => {
    const html = await readFile("scripts/fixtures/spirit-row.html", "utf8");
    const [spirit] = parseSpiritRows(html, spiritSource);

    expect(spirit).toMatchObject({
      dexNo: "046",
      baseName: "卡瓦重",
      fullName: "卡瓦重（火山附近的样子）",
      variantName: "火山附近的样子",
      stage: "三阶",
      sourceCategory: "地区形态",
      types: ["草", "火"],
      raceStats: {
        hp: 78,
        speed: 130,
        physicalAttack: 86,
        magicalAttack: 19,
        physicalDefense: 64,
        magicalDefense: 62,
        total: 439,
      },
      asset: {
        sourceUrl: "https://patchwiki.biligame.com/images/rocom/c/cd/jzimextx73dohm2hagj3idigj301136.png",
        width: 128,
        height: 128,
      },
      source: { title: "精灵筛选", revision: 41360 },
      provenance: {
        raceStats: { title: "精灵筛选", revision: 41360 },
      },
    });
    expect(spirit.id).toMatch(/^spirit_[0-9a-f]{16}$/);
  });

  test("parses one unique skill with provenance and a real asset URL", async () => {
    const html = await readFile("scripts/fixtures/skill-row.html", "utf8");
    const skills = parseSkillRows(html, skillSource);

    expect(skills).toHaveLength(1);
    expect(skills[0]).toMatchObject({
      name: "风力冲击",
      type: "翼",
      category: "physical",
      cost: 2,
      basePower: 80,
      description: "造成物理伤害。",
      ruleId: null,
      asset: {
        sourceUrl: "https://patchwiki.biligame.com/images/rocom/0/01/example-skill.png",
        width: 128,
        height: 128,
      },
      source: { title: "技能筛选", revision: 40653 },
      provenance: {
        basePower: { title: "技能筛选", revision: 40653 },
      },
    });
    expect(skills[0].id).toMatch(/^skill_[0-9a-f]{16}$/);
  });

  test("parses detail traits, unique learnset skills, and type relations", async () => {
    const html = await readFile("scripts/fixtures/detail-page.html", "utf8");
    const detail = parseDetailPage(html, {
      title: "卡瓦重（火山附近的样子）",
      url: "https://wiki.biligame.com/rocom/卡瓦重（火山附近的样子）",
      revision: 41234,
    });

    expect(detail).toMatchObject({
      trait: {
        name: "诈死",
        description: "自己力竭时，少损失1点魔力。",
      },
      skills: [{ name: "火苗", acquisition: ["解锁：Lv.1", "技能石"] }],
      evolutionNames: ["卡卡虫", "卡瓦重（火山附近的样子）"],
      typeRelations: {
        type: "火",
        strongAgainst: ["冰", "机械", "草", "虫"],
        resistedBy: ["地", "水", "龙"],
      },
      portraitAsset: {
        sourceUrl: "https://patchwiki.biligame.com/images/rocom/2/2c/7qezwl2nb2ymfw4dos2vu163szd9p2h.png",
        width: 1024,
        height: 1024,
      },
    });
    expect(detail.skills).toHaveLength(1);
  });

  test("normalizes the verified S3 CSV as independent forms", () => {
    const csv = [
      "图鉴号,名称,形态说明,阶数,属性,形态来源,生命,速度,物攻,魔攻,物防,魔防,总种族值,特性",
      "046,卡瓦重,火山附近的样子,三阶,草|火,地区形态,78,130,86,19,64,62,439,诈死:自己力竭时，少损失1点魔力。",
    ].join("\n");
    const [spirit] = parseSpiritCsv(csv, spiritSource);

    expect(spirit).toMatchObject({
      dexNo: "046",
      baseName: "卡瓦重",
      variantName: "火山附近的样子",
      fullName: "卡瓦重（火山附近的样子）",
      types: ["草", "火"],
      raceStats: { total: 439 },
    });
  });

  test("plans stable local paths and reads PNG dimensions", () => {
    const snapshot = {
      spirits: [
        {
          id: "spirit_one",
          fullName: "卡瓦重",
          asset: {
            sourceUrl: "https://patchwiki.biligame.com/images/rocom/a/b/spirit.png",
          },
        },
      ],
      meta: {
        assetSources: {
          elements: {
            火: "https://patchwiki.biligame.com/images/rocom/a/b/fire.png",
          },
        },
      },
    };
    const plan = collectAssetPlan(snapshot);
    const pngHeader = Buffer.from(
      "89504e470d0a1a0a0000000d4948445200000080000000400806000000",
      "hex",
    );

    expect(plan.spirits[0]).toMatchObject({
      id: "spirit_one",
      localFile: "/assets/spirits/spirit_one.png",
    });
    expect(plan.elements[0]).toMatchObject({
      id: "火",
      localFile: "/assets/elements/fire.png",
    });
    expect(readImageDimensions(pngHeader)).toEqual({ width: 128, height: 64 });
    expect(resolvePublicAssetPath("/assets/elements/fire.png")).toMatch(
      /public[\\/]assets[\\/]elements[\\/]fire\.png$/u,
    );
  });

  test("applies reviewed rule IDs only when the upstream fingerprint matches", () => {
    const skill = {
      id: "skill_flash",
      name: "闪击",
      type: "翼",
      category: "physical",
      cost: 4,
      basePower: 60,
      description: "造成物伤，速度比敌方越高，本次技能威力越高。",
      ruleId: null,
      ruleParams: null,
      provenance: {},
    };
    const trait = {
      id: "trait_focus",
      name: "专注力",
      description: "入场首回合，获得物攻+100%。",
      provenance: {},
    };
    const overrides = [
      {
        id: "override_skill_flash",
        entityType: "skill",
        targetName: "闪击",
        upstreamFingerprint: upstreamFingerprint("skill", skill),
        values: { ruleId: "speed_difference", ruleParams: null },
        source: { title: "已审技能规则" },
      },
      {
        id: "override_trait_focus",
        entityType: "trait",
        targetName: "专注力",
        upstreamFingerprint: upstreamFingerprint("trait", trait),
        values: {
          ruleId: "physical_power_first_turn",
          ruleParams: { multiplier: 2 },
          affectsDamage: true,
        },
        source: { title: "已审特性规则" },
      },
    ];
    const result = applyReviewedOverrides([skill], [trait], overrides);

    expect(result.stale).toEqual([]);
    expect(result.skills[0]).toMatchObject({
      ruleId: "speed_difference",
      provenance: { ruleId: { title: "已审技能规则" } },
    });
    expect(result.traits[0]).toMatchObject({
      ruleId: "physical_power_first_turn",
      ruleParams: { multiplier: 2 },
      affectsDamage: true,
      provenance: { ruleId: { title: "已审特性规则" } },
    });
  });

  test("marks a reviewed override stale after upstream content changes", () => {
    const skill = {
      id: "skill_flash",
      name: "闪击",
      type: "翼",
      category: "physical",
      cost: 4,
      basePower: 60,
      description: "已变化的上游描述",
      ruleId: null,
      ruleParams: null,
      provenance: {},
    };
    const result = applyReviewedOverrides([skill], [], [
      {
        id: "override_skill_flash",
        entityType: "skill",
        targetName: "闪击",
        upstreamFingerprint: "old-fingerprint",
        values: { ruleId: "speed_difference" },
        source: { title: "已审技能规则" },
      },
    ]);

    expect(result.skills[0].ruleId).toBeNull();
    expect(result.stale).toEqual([
      expect.objectContaining({ id: "override_skill_flash", status: "stale" }),
    ]);
  });

  test("can review a trait as non-damage without inventing a damage rule", () => {
    const trait = {
      id: "trait_moisture",
      name: "浸润",
      description: "使用水系技能后，全技能能耗-1。",
      provenance: {},
    };
    const result = applyReviewedOverrides([], [trait], [
      {
        id: "override_trait_moisture_no_damage",
        entityType: "trait",
        targetName: "浸润",
        upstreamFingerprint: upstreamFingerprint("trait", trait),
        values: {
          ruleId: null,
          ruleParams: null,
          affectsDamage: false,
        },
        source: { title: "已审非伤害特性规则" },
      },
    ]);

    expect(result.stale).toEqual([]);
    expect(result.traits[0]).toMatchObject({
      ruleId: null,
      ruleParams: null,
      affectsDamage: false,
      provenance: {
        affectsDamage: { title: "已审非伤害特性规则" },
      },
    });
  });

  test("detects stale detail pages before reusing cached learnsets", () => {
    const drift = findDetailRevisionDrift(
      [
        { fullName: "音速犬", cachedRevision: 39296 },
        { fullName: "水灵", cachedRevision: 39000 },
      ],
      new Map([
        ["音速犬", { revision: 39296 }],
        ["水灵", { revision: 40123 }],
      ]),
    );

    expect(drift).toEqual([
      {
        fullName: "水灵",
        cachedRevision: 39000,
        liveRevision: 40123,
      },
    ]);
  });
});
