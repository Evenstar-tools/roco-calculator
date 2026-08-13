import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { withCalculatorExtras } from "../../src/data/snapshot-extras.js";

const scriptPath = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(scriptPath), "../..");
const runtimePath = path.join(projectRoot, "public/data/runtime.json");
const manifestPath = path.join(
  projectRoot,
  "public/assets/spirits/manifest.json",
);
const outputPath = path.join(
  projectRoot,
  "miniapp/src/data/bundled-runtime.json",
);

const runtime = withCalculatorExtras(
  JSON.parse(readFileSync(runtimePath, "utf8")),
);
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const imageUrls = new Map(
  (manifest.assets ?? []).map((asset) => [asset.id, asset.sourceUrl]),
);

const spirits = runtime.spirits.map((spirit) => {
  const imageUrl = imageUrls.get(spirit.id);
  if (!/^https:\/\//u.test(imageUrl ?? "")) {
    throw new Error(`精灵 ${spirit.id} 缺少可用的 HTTPS 图片地址`);
  }
  const {
    hp,
    speed,
    physicalAttack,
    magicalAttack,
    physicalDefense,
    magicalDefense,
  } = spirit.raceStats;
  return {
    id: spirit.id,
    baseName: spirit.baseName,
    variantName: spirit.variantName,
    fullName: spirit.fullName,
    types: spirit.types,
    raceStats: {
      hp,
      speed,
      physicalAttack,
      magicalAttack,
      physicalDefense,
      magicalDefense,
    },
    traitIds: spirit.traitIds,
    traitName: spirit.traitName,
    traitDescription: spirit.traitDescription,
    evolutionChainIds: spirit.evolutionChainIds,
    initials: spirit.initials,
    pinyin: spirit.pinyin,
    imageUrl,
  };
});

const skills = runtime.skills.map((skill) => ({
  ...skill,
  searchText: String(skill.searchText ?? "")
    .split("|")
    .slice(-2)
    .join("|"),
}));

const skillIndexById = new Map(
  skills.map((skill, index) => [skill.id, index]),
);
const learnsetBySpiritId = new Map(
  runtime.learnsets.map((learnset) => [learnset.spiritId, learnset]),
);
const learnsetSkillIndexes = spirits.map((spirit) => {
  const learnset = learnsetBySpiritId.get(spirit.id);
  if (!learnset) throw new Error(`精灵 ${spirit.id} 缺少技能表`);
  return learnset.skillIds.map((skillId) => {
    const skillIndex = skillIndexById.get(skillId);
    if (skillIndex == null) {
      throw new Error(`技能表引用不存在的技能 ${skillId}`);
    }
    return skillIndex;
  });
});

const { learnsets: _learnsets, ...runtimeWithoutLearnsets } = runtime;

const bundledRuntime = {
  ...runtimeWithoutLearnsets,
  learnsetSkillIndexes,
  skills,
  spirits,
};
const output = `${JSON.stringify(bundledRuntime)}\n`;
writeFileSync(outputPath, output, "utf8");
process.stdout.write(
  `Built bundled miniapp runtime with ${spirits.length} portraits (${Buffer.byteLength(output)} bytes).\n`,
);
