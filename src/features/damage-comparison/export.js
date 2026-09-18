import { version as appVersion } from "../../../package.json";
import { buildDamageComparisonInput, DAMAGE_COMPARISON_FILTERS, describeDamageComparisonTemplate, getDamageComparisonSelection, getDamageComparisonTargetStatuses } from "../../domain/skill-damage-ranking.js";
import { getTraitView } from "../../domain/calculator-view-model.js";
import { getNature, STAT_LABELS } from "../../domain/natures.js";
import { projectTriggerContext } from "../../domain/trigger-controls.js";
import { getSkillEffectInputs } from "../../domain/skill-effects.js";
import { currentWeather } from "../../state/weather.js";

const headers = ["排名", "精灵／形态", "属性", "满血 HP", "伤害 HP", "承伤比例", "剩余 HP", "结论", "耐久配点", "克制倍率", "冻结覆盖"];
const cleanText = (value) => String(value ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/gu, "");
const markdown = (value) => cleanText(value).replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;").replace(/([\\`*_[\]{}|])/gu, "\\$1").replace(/\r?\n/gu, "<br>");

// 只读取本次已完成的榜单，导出完整筛选结果，不受界面分批显示数量限制。
export function buildDamageComparisonReport(snapshot, source, model, date = new Date()) {
  if (model.loading || model.error || model.ranking?.issue || !model.rows.length) throw new Error("当前没有可导出的结论");
  const direction = source.direction ?? "forward";
  const input = buildDamageComparisonInput({ snapshot, ...source, spirit: model.rows[0].spirit,
    selectedSkillIndex: model.selectedSkillIndex, templateId: model.templateId, inheritTargetStatuses: model.inheritTargetStatuses });
  const selection = model.selection;
  const side = input.sides[selection.sourceSide];
  const entry = getDamageComparisonSelection(snapshot, input, direction, model.selectedSkillIndex).selected.entry;
  const details = typeof entry === "object" ? entry : {};
  const context = { ...input.directions[direction].context, ...details.context,
    ...input.directions[direction].overrides?.context, ...details.overrides?.context };
  const trait = getTraitView(snapshot, selection.spirit, "attacker", selection.options.map((option) => option.skill));
  const controls = [...new Map([...(trait?.inputs ?? []), ...getSkillEffectInputs(selection.selected.skill)].map((control) => [control.id, control])).values()];
  const projected = projectTriggerContext(context, controls);
  const conditions = [...new Set(controls.filter((control) => control.source !== "defenderTrait").map((control) => {
    const value = projected[control.contextKey ?? control.key];
    if (value === undefined) return null;
    const label = control.options?.find((option) => option.value === value)?.label;
    return `${control.label} ${label ?? (typeof value === "boolean" ? value ? "开启" : "关闭" : value)}`;
  }).filter(Boolean))];
  const allocation = Object.entries(STAT_LABELS).map(([key, label]) => `${label}${side.displayIvs[key] ?? 0}`).join("／");
  const filter = Array.isArray(model.filter) ? model.filter[1] === null ? `≥${model.filter[0]}%` : `${model.filter[0]}%–${model.filter[1]}%` : DAMAGE_COMPARISON_FILTERS.find(([key]) => key === model.filter)?.[1] ?? "全部";
  const title = `${selection.spirit.fullName} · ${selection.selected.skill.name} · 承伤结论`;
  const resultRange = (key) => {
    const values = model.rows.map((row) => row.result?.[key]).filter(Number.isFinite);
    if (!values.length) return "未知";
    const min = Math.min(...values), max = Math.max(...values);
    return min === max ? String(min) : `${min}～${max}（因目标而异）`;
  };
  const metadata = [
    ["攻击方", `${selection.spirit.fullName} · 60级 · ${getNature(side.nature).name} · ${allocation}`],
    ["技能", `${selection.selected.skill.name} · ${selection.selected.skill.type} · ${{ physical: "物理", magical: "魔法", dual: "双攻", status: "变化", defense: "防御" }[selection.selected.skill.category] ?? "未知"} · 静态威力 ${resultRange("staticPower")} · 连击 ${resultRange("hitCount")}`],
    ["特性／条件", `${trait?.name ?? "无"}${conditions.length ? `；${conditions.join("；")}` : ""}`],
    ["增益来源", model.gainSummary || "无额外增益"],
    ["耐久模板", describeDamageComparisonTemplate(model.template)],
    ["计算口径", `目标满血；${model.scopeDescription}${model.inheritTargetStatuses ? "" : "；未沿用星陨／冻结（按0层）"}；承伤比例＝伤害／最大生命＋有效冻结层数×5%；冻结不额外扣血；不含回合末结算`],
    ["天气", ({ none: "无天气", rain: "雨天", thunder: "雷暴", sandstorm: "沙暴", blizzard: "暴风雪" })[currentWeather(context)]],
    ["筛选", `${filter}；${model.scope === "all" ? "全部完整种族值形态" : "最终形态＋首领"}；${model.descending ? "承伤从高到低" : "承伤从低到高"}${model.query ? `；搜索：${model.query}` : ""}`],
    ["结果", `${model.rows.length} 个形态（当前筛选完整名单）；未纳入 ${model.ranking.excluded.length} 个`],
    ["版本／时间", `洛克计算器 ${appVersion}；数据 ${snapshot.meta?.id ?? snapshot.meta?.dataVersion ?? snapshot.meta?.version ?? source.state.versions?.data ?? "未知"}；规则 ${snapshot.meta?.rulesVersion ?? snapshot.meta?.ruleVersion ?? source.state.versions?.rules ?? "未知"}；${date.toLocaleString("zh-CN", { hour12: false })}`],
    ["说明", "本表为本次计算结论，不随修改自动重算。实战特性、配点不同，请代入计算器复算。"],
  ];
  const rows = model.rows.map((row) => [row.rank, row.spirit.fullName, row.spirit.types?.join("／") ?? "", row.panelStats.hp,
    row.damage, row.percent / 100, row.remainingHp, row.freezeLethal ? "冻结击倒" : row.lethal ? "可击倒" : "未击倒", describeDamageComparisonTemplate(row.template), row.result?.typeMultiplier ?? "—", (row.freezePercent ?? 0) / 100]);
  const pad = (value) => String(value).padStart(2, "0");
  const stamp = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  const statuses = getDamageComparisonTargetStatuses(input, direction);
  const filename = cleanText(`${selection.spirit.fullName}-${selection.selected.skill.name}-星陨${statuses.starfall}-冻结${statuses.freeze}-${model.template.label}-${filter}-${stamp}`).replace(/[<>:"/\\|?*]/gu, "_");
  return { title, metadata, headers, rows, filename };
}

export function damageComparisonMarkdown(report) {
  return `# ${markdown(report.title)}\n\n${report.metadata.map(([key, value]) => `- ${markdown(key)}：${markdown(value)}`).join("\n")}\n\n| ${report.headers.map(markdown).join(" | ")} |\n| ${report.headers.map(() => "---").join(" | ")} |\n${report.rows.map((row) => `| ${row.map((value, index) => markdown(index === 5 || index === 10 ? `${(value * 100).toFixed(1)}%` : value)).join(" | ")} |`).join("\n")}\n`;
}

export async function downloadDamageComparison(report, format) {
  const content = format === "xlsx" ? await (await import("./export-xlsx.js")).damageComparisonXlsx(report) : damageComparisonMarkdown(report);
  const type = format === "xlsx" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "text/markdown;charset=utf-8";
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${report.filename}.${format}`;
  document.body.append(anchor);
  try { anchor.click(); } finally { anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
}
