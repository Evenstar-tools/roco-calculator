import { useToolLocale as useLocale } from "../i18n/useToolLocale.js";
import { useEffect, useMemo, useRef, useState } from "react";
import { createDurabilityRanking, getDurabilityMultipliers, STANDARD_DURABILITY_TEMPLATES } from "../features/team-ability/domain/durability-ranking.js";
import { ElementIcon } from "./ElementIcon.jsx";
import "../styles/type-candidates.css";

const metrics = { combined: "综合", physical: "物理", magical: "魔法" };

export default function TypeCandidates({ type, snapshot, onClose, onApply }) {
  const { typeName, t } = useLocale();
  const root = useRef(null);
  useEffect(() => { root.current?.scrollIntoView?.({ block: "start" }); }, []);
  const [metric, setMetric] = useState("combined");
  const [query, setQuery] = useState("");
  const [templateId, setTemplateId] = useState("standard-hp-v1");
  const [multiplier, setMultiplier] = useState("all");
  const [selectedId, setSelectedId] = useState(null);
  const bins = useMemo(() => getDurabilityMultipliers(snapshot.typeChart).filter(value => value < 1), [snapshot.typeChart]);
  const ranking = useMemo(() => createDurabilityRanking({ spirits: snapshot.spirits, spiritFilterRevision: snapshot.meta?.revisions?.spiritFilter, typeChart: snapshot.typeChart, attackType: type, multipliers: multiplier === "all" ? bins : [Number(multiplier)], sortBy: metric, templateId, query, includeLevelVariants: false }), [snapshot, type, multiplier, bins, metric, templateId, query]);
  const rows = [...ranking.immuneRows, ...ranking.rows];
  const selected = rows.find(row => row.spiritId === selectedId);
  return <section ref={root} className="type-candidates" aria-label={t("{v0}属性抗性候选", { v0: type })} onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); onClose(); } }}>
    <header><h3><ElementIcon type={type} size={22} />{" "}{t("抗性候选 · 耐久排行")}</h3><button type="button" onClick={onClose}>{t("返回矩阵")}</button></header>
    <div className="tc-controls"><input aria-label={t("搜索抗性候选")} placeholder={t("名称、图鉴号或别名")} value={query} onChange={event => setQuery(event.target.value)} />
      <select aria-label={t("候选抗性倍率")} value={multiplier} onChange={event => setMultiplier(event.target.value)}><option value="all">{t("全部抗性")}</option>{bins.map(value => <option key={value} value={value}>{value === 0 ? t("免疫") : `×${value}`}</option>)}</select>
      <select aria-label={t("候选耐久模板")} value={templateId} onChange={event => setTemplateId(event.target.value)}>{Object.values(STANDARD_DURABILITY_TEMPLATES).map(template => <option key={template.id} value={template.id}>{t(template.label)}</option>)}</select>
      <select aria-label={t("候选排序")} value={metric} onChange={event => setMetric(event.target.value)}>{Object.entries(metrics).map(([id, label]) => <option key={id} value={id}>{t(label)}{t("有效耐久")}</option>)}</select>
    </div>
    <p>{rows.length}{t("只 · 按")}{metrics[metric]}{t("有效耐久降序 · 不含特性及环境效果")}</p>
    {selected ? <div className="tc-detail"><strong>{t(selected.spirit.fullName)}</strong><span>{selected.spirit.types?.map(typeName).join(" / ")} · ×{selected.multiplier}</span><span>HP {selected.panelStats.hp}{" "}{t("· 物防")}{" "}{selected.panelStats.physicalDefense}{" "}{t("· 魔防")}{" "}{selected.panelStats.magicalDefense}</span><button type="button" onClick={() => onApply(selected.spirit, ranking.template)}>{t("代入防御方复算")}</button><small>{t("采用当前耐久模板；代入后按实际特性复算。")}</small></div> : null}
    {[["免疫（不参与数值排名）", ranking.immuneRows], ["耐久候选", ranking.rows]].map(([label, entries]) => entries.length ? <div key={label}><h4>{t(label)}</h4><div className="tc-roster">{entries.map(row => <button key={row.spiritId} type="button" aria-label={t("查看{v0}，{v1}", { v0: row.spirit.fullName, v1: row.multiplier === 0 ? "免疫" : `耐久排名${row.filteredRank[metric]}` })} aria-pressed={selectedId === row.spiritId} onClick={() => setSelectedId(selectedId === row.spiritId ? null : row.spiritId)}>
      <small>{row.multiplier === 0 ? t("免疫") : `#${row.filteredRank[metric]} · ×${row.multiplier}`}</small>{row.spirit.asset?.localUrl || row.spirit.imageUrl ? <img alt="" src={row.spirit.asset?.localUrl ?? row.spirit.imageUrl} /> : null}<span>{t(row.spirit.fullName)}</span><b>{row.multiplier === 0 ? "—" : row.durability.display[metric].toLocaleString("zh-CN")}</b>
    </button>)}</div></div> : null)}
    {!rows.length ? <p>{t("没有符合当前筛选的候选。")}</p> : null}
  </section>;
}
