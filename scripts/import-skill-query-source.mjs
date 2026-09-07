import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

// CSV 内技能效果可以包含逗号和换行，不能逐行 split 代替解析。
export function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i += 1; }
      else quoted = !quoted;
    } else if (!quoted && (char === "," || char === "\n")) {
      row.push(cell.replace(/\r$/, "")); cell = "";
      if (char === "\n") { rows.push(row); row = []; }
    } else cell += char;
  }
  if (quoted) throw new Error("CSV 引号未闭合");
  if (cell || row.length) { row.push(cell.replace(/\r$/, "")); rows.push(row); }
  return rows;
}

const [sourcePath, outputPath = "data/skill-query/s3-source.json"] = process.argv.slice(2);
if (sourcePath) {
  const source = JSON.parse(await readFile(sourcePath, "utf8"));
  if (source.has_more) throw new Error("源表尚未完整读取");
  const rows = parseCsv(source.annotated_csv.replace(/^\[row=\d+\] /gm, ""));
  const expectedHeaders = ["技能ID", "技能名称", "归属赛季", "属性", "种类", "能耗", "威力", "目标", "技能效果", "学习面数量", "学习面", "默认学习", "血脉学习", "技能石学习"];
  if (JSON.stringify(rows.shift()) !== JSON.stringify(expectedHeaders)) throw new Error("源表列结构变化，请核对字段");
  const numeric = (value) => /^\d+(\.\d+)?$/.test(value) ? Number(value) : null;
  const split = (value) => value ? value.split("、").map((name) => name.trim()).filter(Boolean) : [];
  const skills = rows.filter((row) => row.some(Boolean)).map((row, index) => {
    if (row.length !== 14 || !/^\d+$/.test(row[0])) throw new Error(`第 ${index + 2} 行格式错误`);
    return {
      gameId: row[0], name: row[1], introducedSeason: row[2], type: row[3], category: row[4],
      cost: numeric(row[5]), basePower: numeric(row[6]), target: row[7], description: row[8],
      sourceLearnerCount: numeric(row[9]), learners: split(row[10]),
      methods: { default: split(row[11]), bloodline: split(row[12]), stone: split(row[13]) },
      sourceRow: index + 2,
    };
  });
  if (new Set(skills.map((skill) => skill.gameId)).size !== skills.length) throw new Error("重复技能 ID");
  const result = { schemaVersion: 1, season: "S3", source: { url: "https://my.feishu.cn/sheets/HUsoszW53h1lUqtnVAocOlFxnIT?sheet=EzhsQ5", revision: source.revision, range: source.actual_range }, skills };
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(result, null, 2) + "\n", "utf8");
  const mismatches = skills.filter((skill) => new Set(skill.learners).size !== skill.sourceLearnerCount);
  console.log(JSON.stringify({ outputPath, skills: skills.length, countDiscrepancies: mismatches.map((skill) => ({ name: skill.name, stated: skill.sourceLearnerCount, unique: new Set(skill.learners).size })) }));
}
