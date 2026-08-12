#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const EFFECTIVE_DATE = "2026-08-13";

const RACE_STAT_PATCHES = Object.freeze({
  炮米花: Object.freeze({
    hp: 115,
    magicalAttack: 100,
    magicalDefense: 110,
    physicalAttack: 99,
    physicalDefense: 110,
  }),
  障眼魔: Object.freeze({ hp: 134, magicalDefense: 110, physicalDefense: 96 }),
  流明坎德拉: Object.freeze({ hp: 121, magicalAttack: 104, physicalAttack: 96 }),
  友爱星飞: Object.freeze({ hp: 122, magicalAttack: 116, physicalAttack: 37 }),
  饮雪狂兽: Object.freeze({ magicalAttack: 24, physicalAttack: 85 }),
});

const SKILL_PATCHES = Object.freeze({
  孢子: Object.freeze({ description: "敌方获得3层寄生。" }),
  撒娇: Object.freeze({
    description: "造成魔伤，3连击。自己获得萌化：威力永久+10。",
  }),
  示弱: Object.freeze({
    cost: 2,
    description: "自己获得萌化：速度永久+130。",
  }),
});

const TRAIT_PATCHES = Object.freeze({
  光度换算: Object.freeze({
    description:
      "携带的火系技能获得选择：使用后失去15%生命，光系技能威力永久+30。",
  }),
  冰雪魂魄: Object.freeze({
    description: "天气为暴风雪时，冰系技能威力+100%。",
  }),
});

const SOURCE_PAYLOAD = Object.freeze({
  effectiveDate: EFFECTIVE_DATE,
  label: "S3季中",
  parasitismEndTurnDrainPercent: 2,
  pvpSporeStacks: 3,
  trialSporeStacks: 6,
});

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function requireNamed(collection, name, kind) {
  const entry = collection.find((candidate) =>
    (kind === "精灵" ? candidate.fullName : candidate.name) === name,
  );
  if (!entry) throw new Error(`S3 季中补丁缺少${kind}：${name}`);
  return entry;
}

function recalculateRaceTotal(raceStats) {
  return [
    "hp",
    "speed",
    "physicalAttack",
    "magicalAttack",
    "physicalDefense",
    "magicalDefense",
  ].reduce((total, key) => total + raceStats[key], 0);
}

export function applyS3MidseasonBalance(snapshot) {
  const next = structuredClone(snapshot);
  const source = {
    fetchedAt: `${EFFECTIVE_DATE}T04:00:00.000+08:00`,
    revision: EFFECTIVE_DATE,
    sha256: sha256(JSON.stringify({
      raceStats: RACE_STAT_PATCHES,
      skills: SKILL_PATCHES,
      traits: TRAIT_PATCHES,
      ...SOURCE_PAYLOAD,
    })),
    title: "8月13日季中战斗平衡性调整",
    url: `urn:rock-calculator:official-balance:${EFFECTIVE_DATE}`,
  };

  for (const [name, patch] of Object.entries(RACE_STAT_PATCHES)) {
    const spirit = requireNamed(next.spirits, name, "精灵");
    Object.assign(spirit.raceStats, patch);
    spirit.raceStats.total = recalculateRaceTotal(spirit.raceStats);
    spirit.provenance = { ...spirit.provenance, raceStats: source };
  }
  for (const [name, patch] of Object.entries(SKILL_PATCHES)) {
    const skill = requireNamed(next.skills, name, "技能");
    Object.assign(skill, patch);
    skill.provenance = {
      ...skill.provenance,
      ...(patch.cost === undefined ? {} : { cost: source }),
      ...(patch.description === undefined ? {} : { description: source }),
    };
  }
  for (const [name, patch] of Object.entries(TRAIT_PATCHES)) {
    const trait = requireNamed(next.traits, name, "特性");
    Object.assign(trait, patch);
    trait.provenance = { ...trait.provenance, description: source };
  }

  next.meta = {
    ...next.meta,
    balancePatch: { ...SOURCE_PAYLOAD },
    contentSha256: null,
    id: "s3-2026-08-13-midseason",
    rulesVersion: EFFECTIVE_DATE,
    seasonId: "S3季中",
    snapshotVersion: 2,
    sources: [
      ...(next.meta?.sources ?? []).filter(
        (candidate) => candidate.url !== source.url,
      ),
      source,
    ],
  };
  next.meta.contentSha256 = sha256(JSON.stringify(next));
  return next;
}

async function main() {
  const sourcePath = path.join(PROJECT_ROOT, "public", "data", "current.json");
  const targetPath = path.join(
    PROJECT_ROOT,
    "public",
    "data",
    "seasons",
    "s3-2026-08-13-midseason.json",
  );
  const snapshot = JSON.parse(await readFile(sourcePath, "utf8"));
  const patched = applyS3MidseasonBalance(snapshot);
  const output = `${JSON.stringify(patched, null, 2)}\n`;
  await writeFile(sourcePath, output, "utf8");
  await writeFile(targetPath, output, "utf8");
  console.log(
    `S3季中补丁已写入：spirits=${patched.spirits.length} skills=${patched.skills.length}`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
