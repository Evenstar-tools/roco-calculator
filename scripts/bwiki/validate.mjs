import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { NATURES } from "../../src/domain/natures.js";

const RACE_STAT_KEYS = [
  "hp",
  "speed",
  "physicalAttack",
  "magicalAttack",
  "physicalDefense",
  "magicalDefense",
];
const NATURE_IDS = new Set(NATURES.map(({ id }) => id));

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
    const isPendingPlaceholder =
      spirit.calculationStatus === "pending-race-stats";
    if (
      spirit.calculationStatus !== undefined &&
      !isPendingPlaceholder
    ) {
      errors.push(
        issue(
          "INVALID_CALCULATION_STATUS",
          `spirits[${index}].calculationStatus`,
          "计算状态仅允许缺省或 pending-race-stats",
          { spiritId: spirit.id, value: spirit.calculationStatus },
        ),
      );
    }
    if (isPendingPlaceholder) {
      if (spirit.raceStats !== null) {
        errors.push(
          issue(
            "INVALID_PLACEHOLDER_RACE_STATS",
            `spirits[${index}].raceStats`,
            "待核实占位形态的种族值必须保持 null",
            { spiritId: spirit.id },
          ),
        );
      }
      return;
    }
    const stats = spirit.raceStats ?? {};
    const values = RACE_STAT_KEYS.map((key) => stats[key]);
    if (
      !values.every((value) => Number.isInteger(value) && value > 0) ||
      !Number.isInteger(stats.total)
    ) {
      errors.push(
        issue(
          "INVALID_RACE_STATS",
          `spirits[${index}].raceStats`,
          "六项种族值必须是正整数，总种族值必须是整数",
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

function validatePreviewDefaults(spirits) {
  const errors = [];
  spirits.forEach((spirit, index) => {
    if (spirit.previewDefaults === undefined) return;
    const { displayIvs, natureId } = spirit.previewDefaults ?? {};
    const validIvs = displayIvs &&
      Object.keys(displayIvs).length === RACE_STAT_KEYS.length &&
      RACE_STAT_KEYS.every((key) => displayIvs[key] === 0 || displayIvs[key] === 60) &&
      RACE_STAT_KEYS.filter((key) => displayIvs[key] === 60).length === 3;
    if (
      spirit.calculationStatus === "pending-race-stats" ||
      !NATURE_IDS.has(natureId) ||
      !validIvs
    ) {
      errors.push(
        issue(
          "INVALID_PREVIEW_DEFAULTS",
          `spirits[${index}].previewDefaults`,
          "前瞻默认配置需要有效性格和恰好三项 60 个体，且不能用于占位形态",
          { spiritId: spirit.id },
        ),
      );
    }
  });
  return errors;
}

function validateSkills(skills) {
  const allowedTypes = new Set([
    "普通", "草", "火", "水", "光", "地", "冰", "龙", "电",
    "毒", "虫", "武", "翼", "萌", "幽", "恶", "机械", "幻",
  ]);
  const allowedCategories = new Set(["physical", "magical", "status", "defense"]);
  const errors = [
    ...duplicateIssues(skills, (skill) => skill.id, "DUPLICATE_SKILL_ID", "skills"),
    ...duplicateIssues(skills, (skill) => skill.name, "DUPLICATE_SKILL_NAME", "skills"),
  ];
  skills.forEach((skill, index) => {
    const isPendingPlaceholder =
      skill.calculationStatus === "pending-skill-data";
    if (
      skill.calculationStatus !== undefined &&
      !isPendingPlaceholder
    ) {
      errors.push(
        issue(
          "INVALID_SKILL_CALCULATION_STATUS",
          `skills[${index}].calculationStatus`,
          "技能计算状态仅允许缺省或 pending-skill-data",
          { skillId: skill.id, value: skill.calculationStatus },
        ),
      );
    }
    const hasKnownType = skill.type !== null;
    const hasKnownCategory = skill.category !== null;
    if (
      isPendingPlaceholder &&
      (
        hasKnownType !== hasKnownCategory ||
        (hasKnownType && !allowedTypes.has(skill.type)) ||
        (hasKnownCategory && !allowedCategories.has(skill.category)) ||
        ["cost", "basePower", "ruleId", "ruleParams"]
          .some((key) => skill[key] !== null && skill[key] !== undefined)
      )
    ) {
      errors.push(
        issue(
          "INVALID_PENDING_SKILL_PARAMETER",
          `skills[${index}]`,
          "待确认技能只允许成对写入已核实的属性与类别，能耗、威力和规则参数必须留空",
          { skillId: skill.id },
        ),
      );
    }
  });
  return errors;
}

function validateReferences(snapshot) {
  const spiritIds = new Set(snapshot.spirits.map((spirit) => spirit.id));
  const pendingSpiritIds = new Set(
    snapshot.spirits
      .filter(({ calculationStatus }) =>
        calculationStatus === "pending-race-stats"
      )
      .map((spirit) => spirit.id),
  );
  const skillIds = new Set(snapshot.skills.map((skill) => skill.id));
  const traitIds = new Set(snapshot.traits.map((trait) => trait.id));
  const pendingLearnsetIds = new Set();
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
    const learnsetSkillIds = new Set(learnset.skillIds ?? []);
    if (pendingSpiritIds.has(learnset.spiritId)) {
      pendingLearnsetIds.add(learnset.spiritId);
      if (
        !Array.isArray(learnset.skillIds) ||
        learnset.skillIds.length !== 0
      ) {
        errors.push(
          issue(
            "PENDING_SPIRIT_LEARNSET_NOT_EMPTY",
            `learnsets[${learnsetIndex}].skillIds`,
            "待核实占位形态的学习面必须为空数组",
            { spiritId: learnset.spiritId },
          ),
        );
      }
    }
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
    if (
      learnset.defaultSkillIds !== undefined &&
      !Array.isArray(learnset.defaultSkillIds)
    ) {
      errors.push(
        issue(
          "INVALID_DEFAULT_SKILL_IDS",
          `learnsets[${learnsetIndex}].defaultSkillIds`,
          "默认技能必须是数组",
          { spiritId: learnset.spiritId },
        ),
      );
    }
    for (const skillId of learnset.defaultSkillIds ?? []) {
      if (!skillIds.has(skillId) || !learnsetSkillIds.has(skillId)) {
        errors.push(
          issue(
            "INVALID_DEFAULT_SKILL_REFERENCE",
            `learnsets[${learnsetIndex}].defaultSkillIds`,
            `默认技能不在该精灵学习面中：${skillId}`,
            { spiritId: learnset.spiritId, skillId },
          ),
        );
      }
    }
  });
  for (const spiritId of pendingSpiritIds) {
    if (!pendingLearnsetIds.has(spiritId)) {
      errors.push(
        issue(
          "MISSING_PENDING_SPIRIT_LEARNSET",
          "learnsets",
          "待核实占位形态必须有一条空学习面记录",
          { spiritId },
        ),
      );
    }
  }
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
    ...validatePreviewDefaults(normalized.spirits),
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
