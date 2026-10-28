import { useEffect, useMemo, useRef, useState } from "react";
import { MagnifyingGlass, X } from "@phosphor-icons/react";
import { useModalFocus } from "../hooks/useModalFocus.js";
import { createSpiritSearchIndex } from "../data/search-index.js";
import { starfallStacksFromMarkSlot } from "../domain/marks.js";
import {
  createStarfallThresholdRanking, evaluateStarfallAt, findStarfallThreshold,
  getStarfallSelection, STARFALL_TEMPLATES,
} from "../domain/starfall-thresholds.js";
import { applyStarfallThreshold } from "../state/starfall-thresholds.js";

const portrait = (spirit) => spirit?.asset?.localUrl ?? spirit?.imageUrl;
const clampStacks = (value) => Math.min(99, Math.max(0, Math.floor(Number(value) || 0)));
const thresholdText = (value) => value.status === "found" ? `${value.minimum} 层`
  : value.status === "unreachable" ? "不可斩杀" : value.status === "uncertain" ? "待核验" : "不适用";
const templateDetails = { hp: "中立 · 生命60", defense: "中立 · 生命双防60", tank: "生命性格 · 生命双防60" };

export default function StarfallThresholdDialog({ snapshot, source, onClose, onApply }) {
  const dialogRef = useRef(null);
  useModalFocus(true, dialogRef, onClose);
  const initial = getStarfallSelection(snapshot, source.state, source.direction);
  const [selectedSkillIndex, setSelectedSkillIndex] = useState(initial.index ?? 0);
  const selection = getStarfallSelection(snapshot, source.state, source.direction, selectedSkillIndex);
  const [stacks, setStacks] = useState(() => starfallStacksFromMarkSlot(source.state.marks?.[selection.targetSide]?.negative));
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [limit, setLimit] = useState(60);
  const [calculation, setCalculation] = useState(null);
  const [ranking, setRanking] = useState(null);
  const [progress, setProgress] = useState(null);
  const [failure, setFailure] = useState(null);
  const request = useMemo(() => ({ snapshot, state: source.state, direction: source.direction, selectedSkillIndex }),
    [snapshot, source.state, source.direction, selectedSkillIndex]);
  const search = useMemo(() => createSpiritSearchIndex(snapshot.spirits), [snapshot]);
  useEffect(() => {
    const signal = { aborted: false };
    const timer = setTimeout(() => {
      try {
        const value = findStarfallThreshold(request);
        if (!signal.aborted) setCalculation({ request, value });
      } catch (error) {
        if (!signal.aborted) setFailure({ request, message: error.message || "计算失败，请重新打开" });
      }
    }, 0);
    createStarfallThresholdRanking({ ...request, scope: "all", signal,
      onProgress: (value) => { if (!signal.aborted) setProgress({ request, value }); },
    }).then((value) => { if (!signal.aborted && value) setRanking({ request, value }); })
      .catch((error) => { if (!signal.aborted) setFailure({ request, message: error.message || "计算失败，请重新打开" }); });
    return () => { clearTimeout(timer); signal.aborted = true; };
  }, [request]);
  const threshold = calculation?.request === request ? calculation.value : null;
  const current = useMemo(() => evaluateStarfallAt({ ...request, stacks }), [request, stacks]);
  const result = ranking?.request === request ? ranking.value : null;
  const error = failure?.request === request ? failure.message : "";
  const loading = !result && !error;
  const matched = new Set(search.search(query, snapshot.spirits.length).map((spirit) => spirit.id));
  const currentProgress = progress?.request === request ? progress.value : null;
  const rows = (result?.rows ?? currentProgress?.rows ?? []).filter((row) => matched.has(row.spirit.id));
  const shortfall = threshold?.status === "found" ? Math.max(0, threshold.minimum - stacks) : 0;
  function apply(options, keepOpen = false) {
    const next = applyStarfallThreshold({ ...request, ...options });
    onApply(next.state, { keepOpen, notice: keepOpen ? "已代入培养，当前对位已恢复特性复算" : `已填入 ${options.stacks} 层星陨` });
  }
  return <div className="starfall-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={dialogRef} className="starfall-dialog" role="dialog" aria-modal="true" aria-label="星陨斩杀线">
      <header className="starfall-heading"><h2>星陨斩杀线</h2><button type="button" aria-label="关闭星陨斩杀线" onClick={onClose}><X size={20} /></button></header>
      <div className="starfall-matchup">
        <div className="starfall-source">{portrait(selection.spirit) ? <img alt="" src={portrait(selection.spirit)} /> : null}<strong>{selection.spirit?.fullName}</strong>
          <select aria-label="星陨计算技能" value={selectedSkillIndex} onChange={(event) => { setSelectedSkillIndex(Number(event.target.value)); setExpanded(null); }}>
            {selection.options.map(({ index, skill }) => <option key={index} value={index}>{skill.name}</option>)}
          </select><span>→</span><strong>{selection.targetSpirit?.fullName}</strong>
        </div>
        <label className="starfall-stacks">试算星陨<input aria-label="试算星陨层数" type="number" min="0" max="99" value={stacks} onChange={(event) => setStacks(clampStacks(event.target.value))} />层</label>
      </div>
      <section className="starfall-current" aria-label="当前对位斩杀线" aria-busy={!threshold && !error}>
        <div><small>当前对位 · 按当前血量、减伤与特性</small>
          <div className="starfall-minimum" role="status">{threshold ? <><strong>{threshold.status === "found" ? `最低 ${threshold.minimum} 层` : thresholdText(threshold)}</strong>
            {threshold.status === "found" ? <span>{current.lethal ? "当前可斩杀" : shortfall > 0 ? `还差 ${shortfall} 层` : "按最低层数填入复算"}</span> : null}</> : error || "正在查找最低层数…"}</div>
          {Number.isFinite(current.damage) ? <p>本次伤害 {current.damage} · 目标 {current.targetHp} / {current.maxHp} HP{current.freezeLethal ? " · 冻结击倒" : ""}</p> : null}
          {current.freezePercent > 0 ? <p>冻结斩杀≤{current.freezeThresholdHp} HP，冻结不额外扣血。</p> : null}
          {threshold?.status !== "found" && threshold?.reason ? <p className="starfall-reason">{threshold.reason}</p> : null}
          {(threshold?.limitations ?? []).length ? <p className="starfall-reason">{threshold.limitations.join("；")}</p> : null}
        </div>
        <button type="button" className="starfall-primary" disabled={threshold?.status !== "found"} onClick={() => apply({ stacks: threshold.minimum })}>填入 {threshold?.status === "found" ? `${threshold.minimum} 层` : "最低层数"}</button>
      </section>
      <div className="starfall-table-tools"><div><h3>三档培养对比</h3><small>满血 · 无减伤/异常 · 不计防守特性</small></div>
        <label className="starfall-search"><MagnifyingGlass size={18} aria-hidden="true" /><input aria-label="搜索星陨斩杀精灵" placeholder="搜索名称、别名或图鉴号" value={query} onChange={(event) => setQuery(event.target.value)} />{query ? <button type="button" aria-label="清空星陨搜索" onClick={() => setQuery("")}><X size={16} /></button> : null}</label>
      </div>
      <div className="starfall-progress" role="status">{error ? error : loading ? `正在计算 ${currentProgress?.completed ?? 0}/${currentProgress?.total ?? snapshot.spirits.length}` : result?.issue || `${rows.length} 只精灵／形态`}</div>
      <div className="starfall-table-scroll" aria-busy={loading} onScroll={(event) => {
        const { scrollHeight, scrollTop, clientHeight } = event.currentTarget;
        if (scrollHeight - scrollTop - clientHeight < 160) setLimit((value) => value + 60);
      }}>
        <div className="starfall-columns" aria-hidden="true"><span>精灵</span>{STARFALL_TEMPLATES.map((template) => <span key={template.id}>{template.label}<small>{templateDetails[template.id]}</small></span>)}<span /></div>
        {rows.slice(0, limit).map((row) => <div className="starfall-item" key={row.spirit.id} data-current={row.spirit.id === selection.targetSpirit?.id || undefined}>
          <div className="starfall-row">
            <div className="starfall-identity">{portrait(row.spirit) ? <img alt="" src={portrait(row.spirit)} loading="lazy" /> : null}<span><strong>{row.spirit.fullName}</strong>{row.spirit.id === selection.targetSpirit?.id ? <small>当前防守方</small> : <small>{row.spirit.types?.join(" · ")}</small>}</span></div>
            {row.templates.map((value) => <div className="starfall-value" key={value.templateId} data-status={value.status} title={value.reason || (value.status === "unreachable" ? "0–99 层内无法斩杀" : "")}><small>{STARFALL_TEMPLATES.find((template) => template.id === value.templateId)?.label}</small><strong>{thresholdText(value)}</strong></div>)}
            <button type="button" className="starfall-choose" aria-label={`选择${row.spirit.fullName}培养`} aria-expanded={expanded === row.spirit.id} onClick={() => setExpanded(expanded === row.spirit.id ? null : row.spirit.id)}>选培养</button>
          </div>
          {expanded === row.spirit.id ? <div className="starfall-cultivation" aria-label={`${row.spirit.fullName}培养选择`}>
            <p>代入后按实际特性复算。</p>{STARFALL_TEMPLATES.map((template) => <button type="button" key={template.id} onClick={() => apply({ spiritId: row.spirit.id, templateId: template.id }, true)}>
              代入{template.label}<small>{templateDetails[template.id]}</small>
            </button>)}
          </div> : null}
        </div>)}
        {!loading && !rows.length ? <p className="starfall-empty">{query ? "没有匹配的精灵，试试其他名称或图鉴号。" : result?.issue || error || "暂无可计算的精灵。"}</p> : null}
        {rows.length > limit ? <button type="button" className="starfall-more" onClick={() => setLimit((value) => value + 60)}>显示更多</button> : null}
      </div>
      <footer>查询 0–99 层 · 单次出招{source.state.calculationOptions?.includeNegativeStatusSettlement ? "含冻结斩杀" : ""} · 不计回合末持续伤害<details><summary>计算依据</summary><p>使用当前所选技能与进攻配置逐层计算；0 层可直接斩杀时返回 0。三档培养仅改变目标性格与个体，其余个体为 0；代入恢复防守特性。不可斩杀指 0–99 层均未达标，待核验表示存在未建模效果。</p></details></footer>
    </section>
  </div>;
}
