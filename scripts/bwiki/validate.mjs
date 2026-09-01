import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const RACE_STAT_KEYS = [
  "hp",
  "speed",
  "physicalAttack",
  "magicalAttack",
  "physicalDefense",
  "magicalDefense",
];

function issue(code, path, message, details = {}) {
  return { code, path, message, ...details };
}

function duplicateIssues(items, keyOf, code, pathPrefix) {
  const seen = new Map();
  const errors = [];
  items.forEach((item, index) => {
    const key = keyOf(item);
    if (!key) return;
    if (seen.has(key)) {
      errors.push(
        issue(code, `${pathPrefix}[${index}]`, `重复键：${key}`, {
          key,
          firstIndex: seen.get(key),
          duplicateIndex: index,
        }),
      );
    } else {
      seen.set(key, index);
    }
  });
  return errors;
}

function validateUniqueSpiritForms(spirits) {
  return [
    ...duplicateIssues(spirits, (spirit) => spirit.id, "DUPLICATE_SPIRIT_ID", "spirits"),
    ...duplicateIssues(
      spirits,
      (spirit) =>
        [spirit.dexNo ?? "", spirit.baseName ?? "", spirit.variantName ?? ""].join("\u241f"),
      "DUPLICATE_SPIRIT_FORM",
      "spirits",
    ),
  ];
}

function validateRaceStats(spirits) {
  const errors = [];
  spirits.forEach((spirit, index) => {
    const stats = spirit.raceStats ?? {};
    const values = RACE_STAT_KEYS.map((key) => stats[key]);
    if (!values.every(Number.isInteger) || !Number.isInteger(stats.total)) {
      errors.push(
        issue(
          "INVALID_RACE_STATS",
          `spirits[${index}].raceStats`,
          "六项种族值和总种族值必须是整数",
          { spiritId: spirit.id },
        ),
      );
      return;
    }
    const sum = values.reduce((total, value) => total + value, 0);
    if (sum !== stats.total) {
      errors.push(
        issue(
          "RACE_STAT_TOTAL_MISMATCH",
          `spirits[${index}].raceStats.total`,
          `种族值总和 ${sum} 与记录值 ${stats.total} 不一致`,
          { spiritId: spirit.id, expected: sum, actual: stats.total },
        ),
      );
    }
  });
  return errors;
}

function validateSkills(skills) {
  return [
    ...duplicateIssues(skills, (skill) => skill.id, "DUPLICATE_SKILL_ID", "skills"),
    ...duplicateIssues(skills, (skill) => skill.name, "DUPLICATE_SKILL_NAME", "skills"),
  ];
}

function validateReferences(snapshot) {
  const spiritIds = new Set(snapshot.spirits.map((spirit) => spirit.id));
  const skillIds = new Set(snapshot.skills.map((skill) => skill.id));
  const traitIds = new Set(snapshot.traits.map((trait) => trait.id));
  const errors = [];

  snapshot.spirits.forEach((spirit, spiritIndex) => {
    for (const traitId of spirit.traitIds ?? []) {
      if (!traitIds.has(traitId)) {
        errors.push(
          issue(
            "UNKNOWN_TRAIT_REFERENCE",
            `spirits[${spiritIndex}].traitIds`,
            `特性引用不存在：${traitId}`,
            { spiritId: spirit.id, traitId },
          ),
        );
      }
    }
  });

  snapshot.learnsets.forEach((learnset, learnsetIndex) => {
    if (!spiritIds.has(learnset.spiritId)) {
      errors.push(
        issue(
          "UNKNOWN_SPIRIT_REFERENCE",
          `learnsets[${learnsetIndex}].spiritId`,
          `精灵引用不存在：${learnset.spiritId}`,
          { spiritId: learnset.spiritId },
        ),
      );
    }
    for (const skillId of learnset.skillIds ?? []) {
      if (!skillIds.has(skillId)) {
        errors.push(
          issue(
            "UNKNOWN_SKILL_REFERENCE",
            `learnsets[${learnsetIndex}].skillIds`,
            `技能引用不存在：${skillId}`,
            { spiritId: learnset.spiritId, skillId },
          ),
        );
      }
    }
  });
  return errors;
}

function validateTypeChart(typeChart) {
  const types = typeChart?.types;
  const matrix = typeChart?.matrix;
  const complete =
    Array.isArray(types) &&
    types.length === 18 &&
    new Set(types).size === 18 &&
    Array.isArray(matrix) &&
    matrix.length === 18 &&
    matrix.every(
      (row) => Array.isArray(row) && row.length === 18 && row.every(Number.isFinite),
    );
  return complete
    ? []
    : [
        issue(
          "INVALID_TYPE_CHART",
          "typeChart",
          "属性矩阵必须包含 18 个唯一属性和完整的 18×18 数值",
        ),
      ];
}

function validateCounts(snapshot, options) {
  const errors = [];
  if (
    options.expectedSpiritCount != null &&
    snapshot.spirits.length !== options.expectedSpiritCount
  ) {
    errors.push(
      issue(
        "SPIRIT_COUNT_MISMATCH",
        "spirits",
        `精灵形态数量应为 ${options.expectedSpiritCount}，实际为 ${snapshot.spirits.length}`,
        { expected: options.expectedSpiritCount, actual: snapshot.spirits.length },
      ),
    );
  }
  if (
    options.expectedSkillCount != null &&
    snapshot.skills.length !== options.expectedSkillCount
  ) {
    errors.push(
      issue(
        "SKILL_COUNT_MISMATCH",
        "skills",
        `唯一技能数量应为 ${options.expectedSkillCount}，实际为 ${snapshot.skills.length}`,
        { expected: options.expectedSkillCount, actual: snapshot.skills.length },
      ),
    );
  }
  return errors;
}

function validateNoPrivatePaths(snapshot) {
  const errors = [];
  const localPathPattern = /(?:file:\/\/\/|(?:^|[^A-Za-z])[A-Za-z]:[\\/])/u;
  const stack = [{ path: "snapshot", value: snapshot }];

  while (stack.length > 0 && errors.length < 20) {
    const { path, value } = stack.pop();
    if (typeof value === "string") {
      if (localPathPattern.test(value)) {
        errors.push(
          issue(
            "PRIVATE_PATH_EXPOSED",
            path,
            "公开快照不得包含构建机本地路径",
          ),
        );
      }
      continue;
    }
    if (!value || typeof value !== "object") continue;
    if (Array.isArray(value)) {
      value.forEach((item, index) =>
        stack.push({ path: `${path}[${index}]`, value: item }),
      );
      continue;
    }
    for (const [key, item] of Object.entries(value)) {
      stack.push({ path: `${path}.${key}`, value: item });
    }
  }

  return errors;
}

export function validateSnapshot(snapshot, options = {}) {
  const normalized = {
    spirits: Array.isArray(snapshot?.spirits) ? snapshot.spirits : [],
    skills: Array.isArray(snapshot?.skills) ? snapshot.skills : [],
    learnsets: Array.isArray(snapshot?.learnsets) ? snapshot.learnsets : [],
    traits: Array.isArray(snapshot?.traits) ? snapshot.traits : [],
    typeChart: snapshot?.typeChart,
  };
  const errors = [
    ...validateUniqueSpiritForms(normalized.spirits),
    ...validateRaceStats(normalized.spirits),
    ...validateSkills(normalized.skills),
    ...validateReferences(normalized),
    ...validateTypeChart(normalized.typeChart),
    ...validateCounts(normalized, options),
    ...validateNoPrivatePaths(snapshot),
  ];
  return {
    ok: errors.length === 0,
    errors,
    counts: {
      spirits: normalized.spirits.length,
      skills: normalized.skills.length,
      learnsets: normalized.learnsets.length,
      traits: normalized.traits.length,
    },
  };
}

function countOption(argv, flag) {
  const index = argv.indexOf(flag);
  if (index < 0) return undefined;
  const value = Number(argv[index + 1]);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${flag} 需要一个正整数`);
  }
  return value;
}

async function main() {
  const argv = process.argv.slice(2);
  const file = argv.find((token) => !token.startsWith("--") && token.endsWith(".json"));
  if (!file) {
    throw new Error(
      "用法：node scripts/bwiki/validate.mjs <snapshot.json> [--expect-spirits <数量>] [--expect-skills <数量>]",
    );
  }
  const snapshot = JSON.parse(await readFile(file, "utf8"));
  // 默认期望来自快照自身声明的 meta.counts：校验数组与声明一致，赛季增删不需要改脚本。
  const result = validateSnapshot(snapshot, {
    expectedSpiritCount:
      countOption(argv, "--expect-spirits") ?? snapshot.meta?.counts?.spirits,
    expectedSkillCount:
      countOption(argv, "--expect-skills") ?? snapshot.meta?.counts?.skills,
  });
  const duplicateSpiritForms = result.errors.filter(
    ({ code }) => code === "DUPLICATE_SPIRIT_FORM",
  ).length;
  const raceStatMismatches = result.errors.filter(
    ({ code }) => code === "RACE_STAT_TOTAL_MISMATCH",
  ).length;
  console.log(`spirits=${result.counts.spirits}`);
  console.log(`skills=${result.counts.skills}`);
  console.log(`duplicateSpiritForms=${duplicateSpiritForms}`);
  console.log(`raceStatMismatches=${raceStatMismatches}`);
  console.log(`status=${result.ok ? "valid" : "invalid"}`);
  if (!result.ok) console.error(JSON.stringify(result.errors, null, 2));
  process.exitCode = result.ok ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
