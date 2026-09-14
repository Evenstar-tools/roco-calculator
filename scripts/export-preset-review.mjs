import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { withCalculatorExtras } from "../src/data/snapshot-extras.js";
import { getTraitView } from "../src/domain/calculator-view-model.js";
import { getNature } from "../src/domain/natures.js";
import { canonicalTraitControlKey } from "../src/state/trait-values.js";
import { parseFavoriteConfigLibrary } from "../src/state/favorite-config-library.js";

// 只生成核对副本，不覆盖用户已经填写的清单，也不修改产品预设。
const outputDirectory = process.argv[2];
if (!outputDirectory) throw new Error("用法：node scripts/export-preset-review.mjs <核对目录>");
const sourceText = readFileSync("public/data/presets/pvp-popular-configs.json", "utf8");
const library = JSON.parse(sourceText);
const snapshot = withCalculatorExtras(JSON.parse(readFileSync("public/data/runtime.json", "utf8")));
const parsed = parseFavoriteConfigLibrary(sourceText, { snapshot });
if (parsed.entries.length !== library.entryCount || parsed.warnings.length) throw new Error("预设校验未通过，停止导出");
const jsonPath = path.join(outputDirectory, "常用精灵预设-可导入.json");
const reviewPath = path.join(outputDirectory, "预设核对清单.md");
if (existsSync(jsonPath) || existsSync(reviewPath)) throw new Error("核对文件已存在，请先保存人工修改，再选择新目录");
const escape = (value) => String(value ?? "—").replaceAll("|", "\\|").replaceAll("\n", " ");
const stats = ["hp", "physicalAttack", "magicalAttack", "speed", "physicalDefense", "magicalDefense"];
const lines = [
  "# 常用精灵预设核对清单",
  "",
  `共 ${library.entryCount} 条，按原预设顺序排列。此文件用于逐项核对，可直接填写最后两列；可导入 JSON 保留完整配置。`,
  "",
  "个体顺序：生命／物攻／魔攻／速度／物防／魔防。技能按装备顺序展示，不截断额外技能槽。",
  "特性参数标注“默认”的项没有单独保存，导入后采用程序默认值；无可调参数不代表特性无效。",
  "",
  `配置来源：应用导出 ${library.exportedAt}；以随附 JSON 的完整配置为准。`,
  "",
  "| 序号 | 精灵 | 性格 | 个体 | 配招 | 特性及参数 | 已核对 | 修改意见 |",
  "|---:|---|---|---|---|---|---|---|",
];
for (const [index, entry] of library.entries.entries()) {
  const spirit = snapshot.spirits.find((item) => item.id === entry.spiritId);
  const controls = new Map();
  for (const role of ["attacker", "defender"]) {
    for (const control of getTraitView(snapshot, spirit, role)?.inputs ?? []) {
      if (control.scope !== "battle") controls.set(canonicalTraitControlKey(control), control);
    }
  }
  const parameters = [...controls].map(([key, control]) => {
    const explicit = Object.hasOwn(entry.traitValues ?? {}, key);
    const value = explicit ? entry.traitValues[key] : control.defaultValue;
    const label = typeof value === "boolean" ? (value ? "开启" : "关闭") : value;
    return `${control.label}=${label ?? "未设"}${control.suffix ?? ""}${explicit ? "" : "（默认）"}`;
  });
  const cells = [index + 1, spirit.fullName, getNature(entry.natureId).name, stats.map((key) => entry.displayIvs[key]).join("／"), entry.skills.map((id) => snapshot.skills.find((skill) => skill.id === id)?.name ?? "空槽").join("／"), `${spirit.traitName}：${parameters.join("；") || "无可调参数"}`, "待核对", ""];
  lines.push(`| ${cells.map(escape).join(" | ")} |`);
}
mkdirSync(outputDirectory, { recursive: true });
writeFileSync(jsonPath, sourceText, "utf8");
writeFileSync(reviewPath, `${lines.join("\n")}\n`, "utf8");
console.log(JSON.stringify({ entries: library.entryCount, jsonPath, reviewPath }));
