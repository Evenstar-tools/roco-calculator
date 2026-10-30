import { ArrowLeft, ArrowsIn, ArrowsOut, MagnifyingGlass, SlidersHorizontal, X } from "@phosphor-icons/react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ELEMENT_TYPES } from "../domain/type-chart.js";
import { createDurabilityRanking, selectDurabilityRanking, getDurabilityMultipliers, STANDARD_DURABILITY_TEMPLATES } from "../features/team-ability/domain/durability-ranking.js";
import { SpeedOverview } from "./AbilityWorkbench.jsx";
import { createSpeedTargetCatalog, selectSpeedRanking, DEFAULT_RANKING_PROFILES, RANKING_METRIC_LABELS, multiplierSummary, multiplierTone } from "../features/team-ability/domain/ranking-tools.js";
import SpeedDetail from "./SpeedDetail.jsx";
import BaseSpeedOverview from "./BaseSpeedOverview.jsx";
import "../styles/23-rankings.css";
import { useRuntime } from "../runtime/RuntimeContext.jsx";
import { useToolLocale as useLocale } from "../i18n/useToolLocale.js";
import { useModalFocus } from "../hooks/useModalFocus.js";

const portrait = (spirit) => spirit?.asset?.localUrl ?? spirit?.imageUrl;
const number = (value) => value == null ? "—" : value.toLocaleString("zh-CN");
const toggle = (values, value) => values.includes(value) ? values.filter((entry) => entry !== value) : [...values, value];
const tableMetrics = ["physical", "magical", "combined"];

function MultiplierControls({ bins, selected, onChange }) {
  const { t } = useLocale();
  const all = selected.length === bins.length;
  return <div className="rank-multipliers" aria-label={t("承伤倍率多选")}>
    <label className="rank-multiplier"><input type="checkbox" checked={all} ref={(node) => { if (node) node.indeterminate = !all && selected.length > 0; }} onChange={() => onChange(all ? [] : bins)} />{t("全选")}</label>
    {bins.map((value) => <label key={value} className={`rank-multiplier rank-tone--${multiplierTone(value)}${selected.includes(value) ? " is-checked" : ""}`}><input type="checkbox" checked={selected.includes(value)} onChange={() => onChange(toggle(selected, value))} />×{value}</label>)}
    <div className="rank-quick"><button type="button" onClick={() => onChange(bins.filter((value) => value < 1))}>{t("选抵抗")}</button><button type="button" onClick={() => onChange(bins.filter((value) => value > 1))}>{t("选弱点")}</button></div>
  </div>;
}

function ReadonlyDetail({ entry, attackType, templateId, onBack }) {
  const { typeName, t } = useLocale();
  const back = useRef(null);
  const levelVariant = entry.level !== 60;
  useEffect(() => { back.current?.focus(); }, [entry]);
  return <section className="rank-detail" aria-label={t("榜单配置详情")}>
    <button type="button" ref={back} onClick={onBack}><ArrowLeft size={16} />{t("返回榜单")}</button>
    <div className="rank-detail__identity">{portrait(entry.spirit) ? <img alt="" loading="lazy" decoding="async" src={portrait(entry.spirit)} /> : null}<div><h3>{t(entry.name)}</h3><p>{t(entry.spirit.types?.map(typeName).join(" · "))}</p></div></div>
    {entry.speed != null ? <><h4>{t("速度")}{" "}{entry.speed}</h4><p>{t(entry.qualifier)}</p><p>{t("该档配置的显示值，不代表所有配置的速度。")}</p></> : <>
      <h4>{t(STANDARD_DURABILITY_TEMPLATES[templateId].label)} · {entry.level}{t("级统一模板")}</h4>
      <p>{t("生命／物防／魔防个体均为60 · 其他个体为0")}</p><p>HP {entry.panelStats.hp}{" "}{t("· 物防")}{" "}{entry.panelStats.physicalDefense}{" "}{t("· 魔防")}{" "}{entry.panelStats.magicalDefense}</p>
      {levelVariant ? <p>{t("对60级攻击方 · 等级特性承伤 ×{multiplier}", { multiplier: entry.incomingDamageMultiplier })}</p> : null}
      {entry.passiveLabel ? <p>{t(entry.passiveDescription)} · {t("物防")} {entry.basePanelStats.physicalDefense}→{entry.panelStats.physicalDefense} · {t("魔防")} {entry.basePanelStats.magicalDefense}→{entry.panelStats.magicalDefense}</p> : null}
      <table><thead><tr><th>{t("指标")}</th><th>{t(entry.passiveLabel ? "特性后耐久" : levelVariant ? "面板耐久" : "基础耐久")}</th>{attackType || levelVariant ? <th>{attackType ? <>{typeName(attackType)}{t("系有效耐久")}</> : t("有效耐久")}</th> : null}</tr></thead><tbody>{Object.entries(RANKING_METRIC_LABELS).map(([key, label]) => <tr key={key}><th>{t(label)}</th><td>{number((entry.panelDurability ?? entry.baseDurability ?? entry.durability).display[key])}</td>{attackType || levelVariant ? <td>{number(entry.durability.display[key])}</td> : null}</tr>)}</tbody></table>
      {levelVariant ? <p>{t(attackType ? "面板耐久 ÷ 等级特性承伤倍率 ÷ 属性倍率" : "面板耐久 ÷ 等级特性承伤倍率")}</p> : null}
      {attackType ? <p className={`rank-tone--${multiplierTone(entry.multiplier)}`}>{typeName(attackType)} ×{entry.multiplier}{entry.multiplier === 0 ? <> · {t("属性免疫，独立分组，不参与数值排名")}</> : !levelVariant ? <> · {t("基础耐久 ÷ 属性倍率")}</> : null}</p> : null}
    </>}
    <p className="rank-note">{t("只读查看，不改变双方参数或队伍配置。不含未注明的特性、天气及技能效果。")}</p>
  </section>;
}

export function DurabilityRankingView({ snapshot, backButtonRef, currentRowRef, currentSpiritId, onBack, metric, setMetric, query, setQuery, roleFilter, setRoleFilter, templateId, setTemplateId, resistance, setResistance, standalone = false }) {
  const { typeName, t } = useLocale();
  const bins = useMemo(() => getDurabilityMultipliers(snapshot.typeChart), [snapshot.typeChart]);
  const [localResistance, setLocalResistance] = useState({ attackType: "", multipliers: bins });
  const { attackType, multipliers } = resistance ?? localResistance;
  const updateResistance = setResistance ?? setLocalResistance;
  const [more, setMore] = useState(false);
  const [detail, setDetail] = useState(null);
  const [includePassiveVariants, setIncludePassiveVariants] = useState(true);
  const detailTrigger = useRef(null);
  useEffect(() => {
    backButtonRef?.current?.focus({ preventScroll: true });
    currentRowRef?.current?.scrollIntoView?.({ block: "center" });
  }, [backButtonRef, currentRowRef]);
  const baseRanking = useMemo(() => createDurabilityRanking({ spirits: snapshot.spirits, traits: snapshot.traits, includePassiveVariants, spiritFilterRevision: snapshot.meta?.revisions?.spiritFilter, attackType, multipliers, typeChart: snapshot.typeChart, templateId, filter: roleFilter === "all" ? undefined : (row) => row.formRole === roleFilter }), [snapshot, includePassiveVariants, attackType, multipliers, templateId, roleFilter]);
  const ranking = useMemo(() => selectDurabilityRanking(baseRanking, { query, sortBy: metric }), [baseRanking, query, metric]);
  const rows = [...ranking.immuneRows, ...ranking.rows];
  const hasLevelVariants = [...baseRanking.immuneRows, ...baseRanking.rows].some(row => row.level !== 60);
  const currentEntryId = [...baseRanking.immuneRows, ...baseRanking.rows].find(row => row.spiritId === currentSpiritId && !row.passiveLabel)?.id;
  const closeDetail = () => { setDetail(null); requestAnimationFrame(() => detailTrigger.current?.focus({ preventScroll: true })); };
  const reset = () => { setQuery(""); setRoleFilter("all"); setTemplateId("standard-hp-v1"); setIncludePassiveVariants(true); updateResistance({ attackType: "", multipliers: bins }); };
  return <section aria-label={t("完整耐久榜")} className="rank-view" onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); if (detail) closeDetail(); else if (more) setMore(false); else onBack(); } }}>
    {!standalone ? <header className="rank-context-header"><button onClick={onBack} ref={backButtonRef} type="button"><ArrowLeft size={17} />{t("返回能力分析")}</button><div><h4>{t("标准耐久榜")}</h4><small>{t("最终形态与首领 · 搜索不改变名次")}</small></div></header> : null}
    {detail ? <ReadonlyDetail entry={detail} attackType={attackType} templateId={templateId} onBack={closeDetail} /> : null}
    <div className="rank-view__content" hidden={Boolean(detail)}>
      <div className="rank-toolbar"><label className="rank-search"><MagnifyingGlass size={17} aria-hidden="true" /><input aria-label={t("搜索耐久榜精灵")} value={query} placeholder={t("搜索名称、图鉴号或别名")} onChange={(event) => setQuery(event.target.value)} /></label>
        <select aria-label={t("承受属性")} value={attackType} onChange={(event) => updateResistance({ attackType: event.target.value, multipliers })}><option value="">{t("不限属性")}</option>{(snapshot.typeChart?.types ?? ELEMENT_TYPES).map((type) => <option key={type} value={type}>{typeName(type)}</option>)}</select>
        <button type="button" aria-expanded={more} onClick={() => setMore(!more)} className="rank-filter-button"><SlidersHorizontal size={17} />{t("筛选")}</button>
      </div>
      {attackType ? <MultiplierControls bins={bins} selected={multipliers} onChange={(selected) => updateResistance({ attackType, multipliers: selected })} /> : null}
      <div className={`rank-options${more ? " is-open" : ""}`}>
        <label>{t("耐久模板")}<select aria-label={t("耐久榜模板")} onChange={(event) => setTemplateId(event.target.value)} value={templateId}>{Object.values(STANDARD_DURABILITY_TEMPLATES).map((template) => <option key={template.id} value={template.id}>{t(template.label)}</option>)}</select></label>
        <label>{t("形态范围")}<select aria-label={t("形态筛选")} onChange={(event) => setRoleFilter(event.target.value)} value={roleFilter}><option value="all">{t("最终形态 + 首领")}</option><option value="final">{t("仅最终形态")}</option><option value="boss">{t("仅首领")}</option></select></label>
        <label><input type="checkbox" checked={includePassiveVariants} onChange={event => setIncludePassiveVariants(event.target.checked)} />{t("特殊配置")}</label>
        <small>{hasLevelVariants ? t("含冥古龙等级面板及承伤；") : ""}{t("仅计注明的特性，不计天气和技能。")}</small>
        {more ? <button type="button" className="rank-options-done" onClick={() => setMore(false)}>{t("完成筛选")}</button> : null}
      </div>
      <div aria-label={t("排行指标")} className="rank-metrics" role="group">{Object.entries(RANKING_METRIC_LABELS).map(([key, label]) => <button aria-pressed={metric === key} key={key} onClick={() => setMetric(key)} type="button">{t(label)}</button>)}</div>
      <div className="rank-summary"><span role="status">{t(multiplierSummary(attackType, multipliers, bins))} · {ranking.counts.visible}{rows.some(row => row.level !== 60 || row.passiveLabel) ? t("档") : t("只")}</span><button onClick={reset} type="button">{t("重置")}</button></div>
      {currentSpiritId && !rows.some((row) => row.spiritId === currentSpiritId) ? <p className="rank-note">{t("参照精灵不符合当前筛选，不计入候选。")}</p> : null}
      <div className="rank-table-scroll">
        <table aria-label={t("标准耐久完整榜")} className={`rank-table rank-table--${metric}`}><thead><tr><th>{t("排名")}</th><th>{t("精灵")}</th>{attackType ? <th className="rank-type-column">{typeName(attackType)}{t("倍率")}</th> : null}{tableMetrics.map((key) => <th key={key} className={`rank-value--${key}`} aria-sort={metric === key ? "descending" : "none"}>{attackType ? t("有效") : ""}{t(RANKING_METRIC_LABELS[key])}</th>)}</tr></thead><tbody>
          {rows.map((entry) => <tr aria-current={entry.id === currentEntryId ? "true" : undefined} key={entry.id} ref={entry.id === currentEntryId ? currentRowRef : undefined}>
            <td>{entry.multiplier === 0 ? t("免疫") : entry.filteredRank[metric]}</td><th scope="row"><button className="rank-spirit" onClick={(event) => { detailTrigger.current = event.currentTarget; setDetail(entry); }} type="button">{portrait(entry.spirit) ? <img alt="" loading="lazy" decoding="async" src={portrait(entry.spirit)} /> : null}<span>{t(entry.name)}<small>{t(entry.spirit.types?.map(typeName).join(" · "))} <span className="rank-form">· {entry.formRole === "boss" ? t("首领") : t("最终形态")}</span></small>{attackType ? <small className={`rank-mobile-mult rank-tone--${multiplierTone(entry.multiplier)}`}>{typeName(attackType)} ×{entry.multiplier}</small> : null}</span></button></th>
            {attackType ? <td className={`rank-type-column rank-tone--${multiplierTone(entry.multiplier)}`}>×{entry.multiplier}</td> : null}
            {tableMetrics.map((key) => <td key={key} className={`rank-value--${key}${metric === key ? " rank-active-value" : ""}`}>{number(entry.durability.display[key])}</td>)}
          </tr>)}
        </tbody></table>
        {!rows.length ? <div className="rank-empty"><h4>{attackType && !multipliers.length ? t("尚未勾选倍率") : t("没有符合当前条件的结果")}</h4><p>{t("可以调整倍率、名称或形态范围。")}</p><button type="button" onClick={reset}>{t("重置筛选")}</button></div> : null}
      </div>
      <footer className="rank-footer">{t("搜索不改名次 · 点击精灵查看模板详情")}{" "}<span>{t("已排除")}{" "}{ranking.counts.excluded}{" "}{t("条无效或非目标形态数据")}</span></footer>
    </div>
  </section>;
}

const StandaloneDurability = memo(function StandaloneDurability({ snapshot, onClose }) {
  const [metric, setMetric] = useState("combined");
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [templateId, setTemplateId] = useState("standard-hp-v1");
  return <DurabilityRankingView {...{snapshot, metric, setMetric, query, setQuery, roleFilter, setRoleFilter, templateId, setTemplateId}} onBack={onClose} standalone />;
});

const StandaloneSpeed = memo(function StandaloneSpeed({ snapshot, onClose }) {
  const { t } = useLocale();
  const [view, setView] = useState("actual");
  const [baseVisited, setBaseVisited] = useState(false);
  const [location, setLocation] = useState(null);
  const [baseLocation, setBaseLocation] = useState(null);
  const [baseQuery, setBaseQuery] = useState("");
  const [query, setQuery] = useState("");
  const [queryMode, setQueryMode] = useState("auto");
  const [profiles, setProfiles] = useState([...DEFAULT_RANKING_PROFILES]);
  const [detail, setDetail] = useState(null);
  const trigger = useRef(null);
  const catalog = useMemo(() => createSpeedTargetCatalog({ snapshot, profiles }), [snapshot, profiles]);
  const targets = useMemo(() => selectSpeedRanking(catalog, { query, queryMode }).flatMap((group) => group.targets.map((target) => ({...target, id: `${target.profileId}:${target.id}`}))), [catalog, query, queryMode]);
  const back = () => {setDetail(null); requestAnimationFrame(() => trigger.current?.focus({preventScroll:true}));};
  const locate = (profileId, speed) => { setDetail(null); setProfiles([profileId]); setQueryMode("auto"); setQuery(""); setLocation({ speed }); setView("actual"); };
  const showView = (next) => { if (next === "base") setBaseVisited(true); setView(next); };
  const detailPanel = detail ? <SpeedDetail entry={detail} snapshot={snapshot} reference={/^\d+$/.test(query) ? Number(query) : null} onClose={back} onLocate={locate} /> : null;
  return <section className="rank-view" aria-label={t("速度线榜单")} onKeyDown={(event) => {if (event.key === "Escape" && detail) {event.stopPropagation(); back();}}}>
    <div className="rank-view__content">
      <div className="speed-view-switch" role="group" aria-label={t("速度榜视图")}>{[["actual", "实速排行"], ["base", "按种族速查"]].map(([id, label]) => <button type="button" key={id} aria-pressed={view === id} onClick={() => { setDetail(null); showView(id); }}>{t(label)}</button>)}</div>
      <div className="speed-view-body" hidden={view !== "base"}>{baseVisited && <BaseSpeedOverview location={baseLocation} detail={detail} detailPanel={detailPanel} snapshot={snapshot} query={baseQuery} onQueryChange={setBaseQuery} onDetail={(target) => { trigger.current = document.activeElement; setDetail(detail?.id === target.id ? null : target); }} onLocate={locate} />}</div>
      <div className="speed-view-body" hidden={view !== "actual"}>
      <SpeedOverview onLocateBase={(base) => { setDetail(null); setQuery(""); setBaseQuery(""); setBaseLocation({ base }); showView("base"); }} location={location} locateTargetId={location?.targetId} onLocateResult={(speed, targetId) => { setDetail(null); setQuery(""); setLocation({ speed, targetId }); }} detail={detail} detailPanel={detailPanel} standalone targets={targets} query={query} queryMode={queryMode} onQueryModeChange={setQueryMode} onQueryChange={(value) => { setLocation(null); setQueryMode("auto"); setQuery(value); }} profileIds={profiles} onProfilesChange={setProfiles} onBack={onClose} onTargetChange={(id) => {trigger.current = document.activeElement; setDetail(detail?.id === id ? null : targets.find((target) => target.id === id));}} />
      {!targets.length ? <p className="rank-empty">{t("没有符合当前口径或搜索条件的速度档位。")}</p> : null}
      <footer className="rank-footer">{t("极 / 满 / 性 / 无 / 减：速度口径 · 特：条件触发 · 点头像看详情")}</footer>
      </div>
    </div>
  </section>;
});

export default function RankingsPanel(props) {
  const { release } = useRuntime();
  const { t } = useLocale();
  const root = useRef(null);
  useModalFocus(Boolean(props.kind) && !release.capabilities.calculate, root, props.onClose);
  if (release.capabilities.calculate) return <VerifiedRankingsPanel {...props} />;
  if (!props.kind) return null;
  const title = props.kind === "speed" ? "速度线排行" : "耐久排行";
  return <div className="rank-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) props.onClose(); }}>
    <div className="rank-dialog" role="dialog" aria-modal="true" aria-label={t(title)} ref={root} tabIndex={-1}>
      <header className="rank-dialog__heading"><h2>{t(title)}</h2><button aria-label={t("关闭排行榜")} onClick={props.onClose} type="button"><X size={20} /></button></header>
      <div className="rank-tool-host"><p className="rank-empty" role="status">{t("国际服数值与规则待核验，暂不可排行。")}</p></div>
    </div>
  </div>;
}

function VerifiedRankingsPanel({ kind, snapshot, onClose }) {
  const { t } = useLocale();
  const root = useRef(null);
  const [expanded, setExpanded] = useState(false);
  if (kind !== "speed" && expanded) setExpanded(false);
  const expandedRef = useRef(false);
  const resizePanel = useCallback((next) => { expandedRef.current = next; setExpanded(next); }, []);
  const [visited, setVisited] = useState(() => ({ [kind]: true }));
  if (kind && !visited[kind]) setVisited({ ...visited, [kind]: true });
  const close = useRef(onClose);
  const closePanel = useCallback(() => {
    if (expandedRef.current) resizePanel(false);
    else close.current();
  }, [resizePanel]);
  useEffect(() => { close.current = onClose; }, [onClose]);
  useEffect(() => { expandedRef.current = expanded; }, [expanded]);
  useEffect(() => {
    const mobile = window.matchMedia("(max-width: 600px)");
    const restore = () => { if (mobile.matches) resizePanel(false); };
    mobile.addEventListener?.("change", restore);
    return () => mobile.removeEventListener?.("change", restore);
  }, [resizePanel]);
  useEffect(() => {
    if (!kind) return undefined;
    const previousOverflow = document.body.style.overflow;
    const trigger = document.activeElement;
    document.body.style.overflow = "hidden";
    root.current?.querySelector(".rank-dialog__close")?.focus({ preventScroll: true });
    const keydown = (event) => {
      if (event.key === "Escape") { event.preventDefault(); closePanel(); }
      if (event.key !== "Tab") return;
      const nodes = [...root.current.querySelectorAll('button, input, select, [href]')].filter((node) => !node.disabled && !node.closest('[hidden]') && node.getClientRects().length);
      if (event.shiftKey && document.activeElement === nodes[0]) {event.preventDefault(); nodes.at(-1)?.focus();}
      else if (!event.shiftKey && document.activeElement === nodes.at(-1)) {event.preventDefault(); nodes[0]?.focus();}
    };
    document.addEventListener("keydown", keydown);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener("keydown", keydown); if (trigger?.isConnected) trigger.focus?.({ preventScroll: true }); else document.querySelector('[aria-label="打开菜单"]')?.focus(); };
  }, [kind, closePanel]);
  return <div className={`rank-overlay${expanded && kind === "speed" ? " is-expanded" : ""}`} hidden={!kind} onMouseDown={(event) => {if(event.target === event.currentTarget) onClose();}}>
    <div className="rank-dialog" role="dialog" aria-modal="true" aria-label={kind === "speed" ? t("速度线排行") : t("耐久排行")} ref={root}>
      <header className="rank-dialog__heading"><h2>{kind === "speed" ? t("速度线排行") : t("耐久排行")}</h2><div className="rank-dialog__actions">
        {kind === "speed" ? <button className="rank-expand" type="button" aria-label={t(expanded ? "退出全屏" : "全屏展示")} title={t(expanded ? "退出全屏" : "全屏展示")} aria-pressed={expanded} onClick={() => resizePanel(!expanded)}>{expanded ? <ArrowsIn size={19} /> : <ArrowsOut size={19} />}<span>{t(expanded ? "退出全屏" : "全屏展示")}</span></button> : null}
        <button className="rank-dialog__close" aria-label={t("关闭排行榜")} onClick={onClose} type="button"><X size={20} /></button>
      </div></header>
      <div className="rank-tool-host" hidden={kind !== "durability"}>{visited.durability && <StandaloneDurability snapshot={snapshot} onClose={closePanel} />}</div>
      <div className="rank-tool-host" hidden={kind !== "speed"}>{visited.speed && <StandaloneSpeed snapshot={snapshot} onClose={closePanel} />}</div>
    </div>
  </div>;
}
