import { ArrowLeft, MagnifyingGlass, SlidersHorizontal, X } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ELEMENT_TYPES } from "../domain/type-chart.js";
import { createDurabilityRanking, getDurabilityMultipliers, STANDARD_DURABILITY_TEMPLATES } from "../features/team-ability/domain/durability-ranking.js";
import { SpeedOverview } from "./AbilityWorkbench.jsx";
import { createSpeedRanking, DEFAULT_RANKING_PROFILES, RANKING_METRIC_LABELS, multiplierSummary, multiplierTone } from "../features/team-ability/domain/ranking-tools.js";
import "../styles/23-rankings.css";

const portrait = (spirit) => spirit?.asset?.localUrl ?? spirit?.imageUrl;
const number = (value) => value == null ? "—" : value.toLocaleString("zh-CN");
const toggle = (values, value) => values.includes(value) ? values.filter((entry) => entry !== value) : [...values, value];
const tableMetrics = ["physical", "magical", "combined"];

function MultiplierControls({ bins, selected, onChange }) {
  const all = selected.length === bins.length;
  return <div className="rank-multipliers" aria-label="承伤倍率多选">
    <label className="rank-multiplier"><input type="checkbox" checked={all} ref={(node) => { if (node) node.indeterminate = !all && selected.length > 0; }} onChange={() => onChange(all ? [] : bins)} />全选</label>
    {bins.map((value) => <label key={value} className={`rank-multiplier rank-tone--${multiplierTone(value)}${selected.includes(value) ? " is-checked" : ""}`}><input type="checkbox" checked={selected.includes(value)} onChange={() => onChange(toggle(selected, value))} />×{value}</label>)}
    <div className="rank-quick"><button type="button" onClick={() => onChange(bins.filter((value) => value < 1))}>选抵抗</button><button type="button" onClick={() => onChange(bins.filter((value) => value > 1))}>选弱点</button></div>
  </div>;
}

function ReadonlyDetail({ entry, attackType, templateId, onBack }) {
  const back = useRef(null);
  useEffect(() => { back.current?.focus(); }, [entry]);
  return <section className="rank-detail" aria-label="榜单配置详情">
    <button type="button" ref={back} onClick={onBack}><ArrowLeft size={16} />返回榜单</button>
    <div className="rank-detail__identity">{portrait(entry.spirit) ? <img alt="" src={portrait(entry.spirit)} /> : null}<div><h3>{entry.spirit.fullName}</h3><p>{entry.spirit.types?.join(" · ")}</p></div></div>
    {entry.speed != null ? <><h4>速度 {entry.speed}</h4><p>{entry.qualifier}</p><p>该档配置的显示值，不代表所有配置的速度。</p></> : <>
      <h4>{STANDARD_DURABILITY_TEMPLATES[templateId].label} · 60级统一模板</h4>
      <p>生命／物防／魔防个体均为60 · 其他个体为0</p><p>HP {entry.panelStats.hp} · 物防 {entry.panelStats.physicalDefense} · 魔防 {entry.panelStats.magicalDefense}</p>
      <table><thead><tr><th>指标</th><th>基础耐久</th>{attackType ? <th>{attackType}系有效耐久</th> : null}</tr></thead><tbody>{Object.entries(RANKING_METRIC_LABELS).map(([key, label]) => <tr key={key}><th>{label}</th><td>{number((entry.baseDurability ?? entry.durability).display[key])}</td>{attackType ? <td>{number(entry.durability.display[key])}</td> : null}</tr>)}</tbody></table>
      {attackType ? <p className={`rank-tone--${multiplierTone(entry.multiplier)}`}>{attackType} ×{entry.multiplier} · {entry.multiplier === 0 ? "属性免疫，独立分组，不参与数值排名" : "基础耐久 ÷ 属性倍率"}</p> : null}
    </>}
    <p className="rank-note">只读查看，不改变双方参数或队伍配置。不含未注明的特性、天气及技能效果。</p>
  </section>;
}

export function DurabilityRankingView({ snapshot, backButtonRef, currentRowRef, currentSpiritId, onBack, metric, setMetric, query, setQuery, roleFilter, setRoleFilter, templateId, setTemplateId, resistance, setResistance, standalone = false }) {
  const bins = useMemo(() => getDurabilityMultipliers(snapshot.typeChart), [snapshot.typeChart]);
  const [localResistance, setLocalResistance] = useState({ attackType: "", multipliers: bins });
  const { attackType, multipliers } = resistance ?? localResistance;
  const updateResistance = setResistance ?? setLocalResistance;
  const [more, setMore] = useState(false);
  const [detail, setDetail] = useState(null);
  const detailTrigger = useRef(null);
  useEffect(() => {
    backButtonRef?.current?.focus({ preventScroll: true });
    currentRowRef?.current?.scrollIntoView?.({ block: "center" });
  }, [backButtonRef, currentRowRef]);
  const ranking = useMemo(() => createDurabilityRanking({ spirits: snapshot.spirits, spiritFilterRevision: snapshot.meta?.revisions?.spiritFilter, attackType, multipliers, typeChart: snapshot.typeChart, query, sortBy: metric, templateId, filter: roleFilter === "all" ? undefined : (row) => row.formRole === roleFilter }), [snapshot, attackType, multipliers, query, metric, templateId, roleFilter]);
  const rows = [...ranking.immuneRows, ...ranking.rows];
  const closeDetail = () => { setDetail(null); requestAnimationFrame(() => detailTrigger.current?.focus({ preventScroll: true })); };
  const reset = () => { setQuery(""); setRoleFilter("all"); setTemplateId("standard-hp-v1"); updateResistance({ attackType: "", multipliers: bins }); };
  return <section aria-label="完整耐久榜" className="rank-view" onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); if (detail) closeDetail(); else if (more) setMore(false); else onBack(); } }}>
    {!standalone ? <header className="rank-context-header"><button onClick={onBack} ref={backButtonRef} type="button"><ArrowLeft size={17} />返回能力分析</button><div><h4>标准耐久榜</h4><small>最终形态与首领 · 搜索不改变名次</small></div></header> : null}
    {detail ? <ReadonlyDetail entry={detail} attackType={attackType} templateId={templateId} onBack={closeDetail} /> : null}
    <div className="rank-view__content" hidden={Boolean(detail)}>
      <div className="rank-toolbar"><label className="rank-search"><MagnifyingGlass size={17} aria-hidden="true" /><input aria-label="搜索耐久榜精灵" value={query} placeholder="搜索名称、图鉴号或别名" onChange={(event) => setQuery(event.target.value)} /></label>
        <select aria-label="承受属性" value={attackType} onChange={(event) => updateResistance({ attackType: event.target.value, multipliers })}><option value="">不限属性</option>{(snapshot.typeChart?.types ?? ELEMENT_TYPES).map((type) => <option key={type} value={type}>{type}</option>)}</select>
        <button type="button" aria-expanded={more} onClick={() => setMore(!more)} className="rank-filter-button"><SlidersHorizontal size={17} />筛选</button>
      </div>
      {attackType ? <MultiplierControls bins={bins} selected={multipliers} onChange={(selected) => updateResistance({ attackType, multipliers: selected })} /> : null}
      <div className={`rank-options${more ? " is-open" : ""}`}>
        <label>耐久模板<select aria-label="耐久榜模板" onChange={(event) => setTemplateId(event.target.value)} value={templateId}>{Object.values(STANDARD_DURABILITY_TEMPLATES).map((template) => <option key={template.id} value={template.id}>{template.label}</option>)}</select></label>
        <label>形态范围<select aria-label="形态筛选" onChange={(event) => setRoleFilter(event.target.value)} value={roleFilter}><option value="all">最终形态 + 首领</option><option value="final">仅最终形态</option><option value="boss">仅首领</option></select></label>
        <small>基础耐久 ÷ 属性倍率；不包含特性、天气或技能效果</small>
        {more ? <button type="button" className="rank-options-done" onClick={() => setMore(false)}>完成筛选</button> : null}
      </div>
      <div aria-label="排行指标" className="rank-metrics" role="group">{Object.entries(RANKING_METRIC_LABELS).map(([key, label]) => <button aria-pressed={metric === key} key={key} onClick={() => setMetric(key)} type="button">{label}</button>)}</div>
      <div className="rank-summary"><span role="status">{multiplierSummary(attackType, multipliers, bins)} · {ranking.counts.visible}只</span><button onClick={reset} type="button">重置</button></div>
      {currentSpiritId && !rows.some((row) => row.spiritId === currentSpiritId) ? <p className="rank-note">参照精灵不符合当前筛选，不计入候选。</p> : null}
      <div className="rank-table-scroll">
        <table aria-label="标准耐久完整榜" className={`rank-table rank-table--${metric}`}><thead><tr><th>排名</th><th>精灵</th>{attackType ? <th className="rank-type-column">{attackType}倍率</th> : null}{tableMetrics.map((key) => <th key={key} className={`rank-value--${key}`} aria-sort={metric === key ? "descending" : "none"}>{attackType ? "有效" : ""}{RANKING_METRIC_LABELS[key]}</th>)}</tr></thead><tbody>
          {rows.map((entry) => <tr aria-current={entry.spiritId === currentSpiritId ? "true" : undefined} key={entry.spiritId} ref={entry.spiritId === currentSpiritId ? currentRowRef : undefined}>
            <td>{entry.multiplier === 0 ? "免疫" : entry.filteredRank[metric]}</td><th scope="row"><button className="rank-spirit" onClick={(event) => { detailTrigger.current = event.currentTarget; setDetail(entry); }} type="button">{portrait(entry.spirit) ? <img alt="" src={portrait(entry.spirit)} /> : null}<span>{entry.spirit.fullName}<small>{entry.spirit.types?.join(" · ")} <span className="rank-form">· {entry.formRole === "boss" ? "首领" : "最终形态"}</span></small>{attackType ? <small className={`rank-mobile-mult rank-tone--${multiplierTone(entry.multiplier)}`}>{attackType} ×{entry.multiplier}</small> : null}</span></button></th>
            {attackType ? <td className={`rank-type-column rank-tone--${multiplierTone(entry.multiplier)}`}>×{entry.multiplier}</td> : null}
            {tableMetrics.map((key) => <td key={key} className={`rank-value--${key}${metric === key ? " rank-active-value" : ""}`}>{number(entry.durability.display[key])}</td>)}
          </tr>)}
        </tbody></table>
        {!rows.length ? <div className="rank-empty"><h4>{attackType && !multipliers.length ? "尚未勾选倍率" : "没有符合当前条件的结果"}</h4><p>可以调整倍率、名称或形态范围。</p><button type="button" onClick={reset}>重置筛选</button></div> : null}
      </div>
      <footer className="rank-footer">搜索不改名次 · 点击精灵查看模板详情 <span>已排除 {ranking.counts.excluded} 条无效或非目标形态数据</span></footer>
    </div>
  </section>;
}

function StandaloneDurability({ snapshot, onClose }) {
  const [metric, setMetric] = useState("combined");
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [templateId, setTemplateId] = useState("standard-hp-v1");
  return <DurabilityRankingView {...{snapshot, metric, setMetric, query, setQuery, roleFilter, setRoleFilter, templateId, setTemplateId}} onBack={onClose} standalone />;
}

function StandaloneSpeed({ snapshot, onClose }) {
  const [query, setQuery] = useState("");
  const [profiles, setProfiles] = useState([...DEFAULT_RANKING_PROFILES]);
  const [detail, setDetail] = useState(null);
  const trigger = useRef(null);
  const targets = useMemo(() => createSpeedRanking({ snapshot, profiles, query }).flatMap((group) => group.targets.map((target) => ({...target, id: `${target.profileId}:${target.id}`}))), [snapshot, profiles, query]);
  const back = () => {setDetail(null); requestAnimationFrame(() => trigger.current?.focus({preventScroll:true}));};
  return <section className="rank-view" aria-label="速度线榜单" onKeyDown={(event) => {if (event.key === "Escape" && detail) {event.stopPropagation(); back();}}}>
    {detail ? <ReadonlyDetail entry={detail} onBack={back} /> : null}
    <div className="rank-view__content" hidden={Boolean(detail)}>
      <SpeedOverview standalone targets={targets} query={query} onQueryChange={setQuery} profileIds={profiles} onProfilesChange={setProfiles} onBack={onClose} onTargetChange={(id) => {trigger.current = document.activeElement; setDetail(targets.find((target) => target.id === id));}} />
      {!targets.length ? <p className="rank-empty">没有符合当前口径或搜索条件的速度档位。</p> : null}
      <footer className="rank-footer">同速聚合 · 不同配置分别保留 · 特殊条件需实际触发</footer>
    </div>
  </section>;
}

export default function RankingsPanel({ kind, snapshot, onClose }) {
  const root = useRef(null);
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; }, [onClose]);
  useEffect(() => {
    if (!kind) return undefined;
    const previousOverflow = document.body.style.overflow;
    const trigger = document.activeElement;
    document.body.style.overflow = "hidden";
    root.current?.querySelector("button")?.focus({ preventScroll: true });
    const keydown = (event) => {
      if (event.key === "Escape") { event.preventDefault(); close.current(); }
      if (event.key !== "Tab") return;
      const nodes = [...root.current.querySelectorAll('button, input, select, [href]')].filter((node) => !node.disabled && !node.closest('[hidden]') && node.getClientRects().length);
      if (event.shiftKey && document.activeElement === nodes[0]) {event.preventDefault(); nodes.at(-1)?.focus();}
      else if (!event.shiftKey && document.activeElement === nodes.at(-1)) {event.preventDefault(); nodes[0]?.focus();}
    };
    document.addEventListener("keydown", keydown);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener("keydown", keydown); if (trigger?.isConnected) trigger.focus?.({ preventScroll: true }); else document.querySelector('[aria-label="打开菜单"]')?.focus(); };
  }, [kind]);
  return <div className="rank-overlay" hidden={!kind} onMouseDown={(event) => {if(event.target === event.currentTarget) onClose();}}>
    <div className="rank-dialog" role="dialog" aria-modal="true" aria-label={kind === "speed" ? "速度线排行" : "耐久排行"} ref={root}>
      <header className="rank-dialog__heading"><h2>{kind === "speed" ? "速度线排行" : "耐久排行"}</h2><button aria-label="关闭排行榜" onClick={onClose} type="button"><X size={20} /></button></header>
      <div className="rank-tool-host" hidden={kind !== "durability"}><StandaloneDurability snapshot={snapshot} onClose={onClose} /></div>
      <div className="rank-tool-host" hidden={kind !== "speed"}><StandaloneSpeed snapshot={snapshot} onClose={onClose} /></div>
    </div>
  </div>;
}
