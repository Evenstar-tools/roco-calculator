import { useEffect, useRef, useState } from "react";
import { CaretDown, CaretUp, DownloadSimple, MagnifyingGlass, SlidersHorizontal, X } from "@phosphor-icons/react";
import { useDamageComparison } from "../features/damage-comparison/useDamageComparison.js";
import DamageRangeFilter from "./DamageRangeFilter.jsx";
import { buildDamageComparisonReport, downloadDamageComparison } from "../features/damage-comparison/export.js";

const portrait = (spirit) => spirit?.asset?.localUrl ?? spirit?.imageUrl;
const focusable = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), [href]';

export default function DamageComparisonDialog({ snapshot, source, preferences, onPreferencesChange, onClose, onImport }) {
  const model = useDamageComparison(snapshot, source, preferences, onPreferencesChange);
  const dialog = useRef(null);
  const exportControl = useRef(null);
  const restored = useRef(false);
  useEffect(() => {
    if (model.loading || restored.current) return;
    restored.current = true;
    if (model.expanded) document.getElementById(`damage-detail-${model.expanded}`)?.scrollIntoView?.({ block: "center" });
  }, [model.loading, model.expanded]);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportError, setExportError] = useState("");
  const canExport = !model.loading && !model.error && !model.ranking?.issue && model.rows.length > 0;
  useEffect(() => {
    if (!exportOpen) return;
    const dismiss = (event) => { if (!exportControl.current?.contains(event.target)) setExportOpen(false); };
    document.addEventListener("mousedown", dismiss);
    return () => document.removeEventListener("mousedown", dismiss);
  }, [exportOpen]);
  async function exportResults(format) {
    if (!canExport || exportBusy) return;
    setExportBusy(true);
    setExportError("");
    try {
      const report = buildDamageComparisonReport(snapshot, source, model);
      await downloadDamageComparison(report, format);
      setExportOpen(false);
      requestAnimationFrame(() => exportControl.current?.querySelector("button")?.focus());
    } catch { setExportError("导出失败，请重试"); }
    finally { setExportBusy(false); }
  }
  useEffect(() => {
    const trigger = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.querySelector(focusable)?.focus();
    return () => { document.body.style.overflow = overflow; if (trigger?.isConnected) trigger.focus({ preventScroll: true }); };
  }, []);
  function onKeyDown(event) {
    if (event.key === "Escape" && exportOpen) {
      event.preventDefault(); event.stopPropagation(); setExportOpen(false);
      exportControl.current?.querySelector("button")?.focus(); return;
    }
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); }
    if (event.key !== "Tab") return;
    const controls = [...dialog.current.querySelectorAll(focusable)].filter((node) => node.getClientRects().length);
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }
  return <div className="damage-comparison-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={dialog} className="damage-comparison" role="dialog" aria-modal="true" aria-label="承伤对比" onKeyDown={onKeyDown}>
      <header className="dc-web-heading"><h2>承伤对比</h2><div className="dc-web-heading-actions">
        <div className="dc-web-export" ref={exportControl}>
          <button type="button" disabled={!canExport || exportBusy} aria-expanded={exportOpen} aria-controls="dc-export-formats" onClick={() => setExportOpen(!exportOpen)}><DownloadSimple size={18} />{exportBusy ? "导出中" : "导出"}</button>
          {exportOpen ? <div className="dc-web-export-formats" id="dc-export-formats" role="group" aria-label="导出格式">
            <small>导出当前筛选的全部结果</small>
            <button type="button" disabled={!canExport || exportBusy} onClick={() => exportResults("xlsx")}>Excel（.xlsx）</button>
            <button type="button" disabled={!canExport || exportBusy} onClick={() => exportResults("md")}>Markdown（.md）</button>
          </div> : null}
        </div>
        <button type="button" aria-label="关闭承伤对比" onClick={onClose}><X size={20} /></button>
      </div></header>
      <div className="dc-web-source">
        {portrait(model.selection.spirit) ? <img alt="" src={portrait(model.selection.spirit)} /> : null}
        <strong>{model.selection.spirit?.fullName}</strong>
        <select aria-label="比较技能" value={model.selection.index} onChange={(event) => model.setSelectedSkillIndex(Number(event.target.value))}>{model.selection.options.map(({ index, skill }) => <option key={index} value={index}>{skill.name}</option>)}</select>
        <small>{model.scopeDescription}</small>
        {model.gainSummary ? <small>增益来源：{model.gainSummary}</small> : null}
      </div>
      <div className="dc-web-search"><label><MagnifyingGlass size={18} aria-hidden="true" /><input aria-label="搜索承伤精灵" placeholder="搜索名称、别名或图鉴号" value={model.query} onChange={(event) => model.setQuery(event.target.value)} /></label><button type="button" aria-expanded={model.filtersOpen} aria-controls="dc-filter-options" onClick={() => model.setFiltersOpen(!model.filtersOpen)}><SlidersHorizontal size={18} />筛选</button></div>
      <div id="dc-filter-options" className={`dc-web-options${model.filtersOpen ? " is-open" : ""}`}>
        <label>耐久模板<select aria-label="承伤耐久模板" value={model.templateId} onChange={(event) => model.setTemplateId(event.target.value)}>{model.templates.map((template) => <option key={template.id} value={template.id}>{template.label}</option>)}</select></label>
        <label>形态范围<select aria-label="承伤形态范围" value={model.scope} onChange={(event) => model.setScope(event.target.value)}><option value="final">最终形态＋首领</option><option value="all">全部完整种族值形态</option></select></label>
        <select aria-label="承伤排序" value={model.descending ? "desc" : "asc"} onChange={(event) => model.setDescending(event.target.value === "desc")}><option value="asc">承伤从低到高</option><option value="desc">承伤从高到低</option></select>
      </div>
      <div className="dc-web-filters" role="group" aria-label="承伤筛选"><DamageRangeFilter value={model.filter} onChange={model.setFilter} /><label className="dc-web-inherit"><input type="checkbox" checked={model.inheritTargetStatuses} onChange={(event) => model.setInheritTargetStatuses(event.target.checked)} />沿用星陨／冻结</label></div>
      <div className="dc-web-summary"><span role="status">{model.loading ? `正在计算 ${model.progress?.completed ?? 0}/${snapshot.spirits.length}` : `${model.rows.length} 只 · ${model.template.label}`}</span></div>
      <div className="dc-web-scroll" aria-busy={model.loading} onScroll={(event) => {
        const { scrollHeight, scrollTop, clientHeight } = event.currentTarget;
        if (!model.loading && model.rows.length > model.limit && scrollHeight - scrollTop - clientHeight <= 160) model.showMore();
      }}>
        {model.error || model.ranking?.issue ? <p className="dc-web-empty" role="status">{model.error || model.ranking.issue}</p> : null}
        {model.rows.length > 0 ? <div className="dc-web-columns" aria-hidden="true"><span>排名</span><span>精灵</span><span className="dc-web-effectiveness">克制</span><span>伤害 HP</span><span>承伤比例</span></div> : null}
        {model.rows.slice(0, model.limit).map((row) => {
          const expanded = model.expanded === row.spirit.id;
          const freezePercent = row.freezePercent ?? 0;
          const damagePercent = row.damagePercent ?? row.percent;
          const breakdown = `伤害${damagePercent.toFixed(1)}%＋冻结${freezePercent}%`;
          return <div key={row.spirit.id} className={`dc-web-item${expanded ? " is-expanded" : ""}`}>
            <button type="button" className="dc-web-row" aria-label={`查看${row.spirit.fullName}承伤详情`} aria-expanded={expanded} aria-controls={`damage-detail-${row.spirit.id}`} onClick={() => model.setExpanded(expanded ? null : row.spirit.id)}>
              <span className="dc-web-rank">{row.rank}</span>
              <span className="dc-web-identity">{portrait(row.spirit) ? <img alt="" src={portrait(row.spirit)} loading="lazy" /> : null}<span><strong>{row.spirit.fullName}{row.template.presetFallback ? <span className="dc-web-no-preset">无预设</span> : null}</strong><small>{row.spirit.types?.join(" · ")}<span className="dc-web-mobile-damage"> · 伤害 {row.damage} HP</span></small></span></span>
              <span className="dc-web-effectiveness" title="当前技能的属性克制倍率" aria-label={`克制倍率 ${Number.isFinite(row.result?.typeMultiplier) ? row.result.typeMultiplier : "不适用"}`}>{Number.isFinite(row.result?.typeMultiplier) ? row.result.typeMultiplier : "—"}</span>
              <span className="dc-web-damage">{row.damage}</span>
              <span className={`dc-web-score${row.lethal ? " is-ko" : row.percent < 50 ? " is-low" : " is-mid"}`}><span className="dc-web-track" role="img" aria-label={breakdown} title={breakdown}>{freezePercent > 0 ? <span className="dc-web-freeze" style={{ width: `${freezePercent}%` }} /> : null}<span style={{ width: `${Math.min(100 - freezePercent, damagePercent)}%` }} /></span><span><strong>{row.percent.toFixed(1)}%</strong>{freezePercent > 0 ? <small className="dc-web-freeze-breakdown">{breakdown}</small> : null}<small>{row.freezeLethal ? "冻结击倒" : row.lethal ? "本次可击倒" : `剩余 ${row.remainingHp} HP`}</small></span>{expanded ? <CaretUp size={16} /> : <CaretDown size={16} />}</span>
            </button>
            {expanded ? <div className="dc-web-detail" id={`damage-detail-${row.spirit.id}`}>
              <div><strong>{row.spirit.fullName}</strong><p>生命 {row.panelStats.hp} · 物防 {row.panelStats.physicalDefense} · 魔防 {row.panelStats.magicalDefense}</p><p>本次伤害 {row.damage} · 剩余 {row.remainingHp} HP</p>{freezePercent > 0 ? <p className="dc-web-freeze-detail">冻结斩杀≤{row.freezeThresholdHp} HP · 伤害后{row.remainingAfterDirect} HP · 冻结不额外扣血</p> : row.freezeImmune && model.inheritTargetStatuses ? <p className="dc-web-freeze-detail">冰系免疫冻结</p> : null}<small>{model.templateDescription(row)}<br />{model.loadoutDescription(row)}<br />本榜不计防守方特性，代入后恢复特性及预设参数。</small></div>
              <button type="button" className="dc-web-primary" onClick={() => onImport(row.spirit, model.templateId, model.selectedSkillIndex, model.inheritTargetStatuses)}>代入防守方复算</button>
            </div> : null}
          </div>;
        })}
        {!model.loading && !model.error && !model.ranking?.issue && !model.rows.length ? <div className="dc-web-empty"><p>没有符合当前筛选的结果</p><button type="button" onClick={() => { model.setQuery(""); model.setFilter("all"); }}>清除搜索与筛选</button></div> : null}
      </div>
      <footer>{exportError ? <span role="alert">{exportError}</span> : "点行只看详情 · 搜索不改名次 · 实际对局请代入复算"}</footer>
    </section>
  </div>;
}
