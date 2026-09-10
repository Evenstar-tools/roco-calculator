import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, CaretRight, CheckCircle, Eye, EyeSlash, MagnifyingGlass, X } from "@phosphor-icons/react";
import { SkillIcon } from "../../components/SkillIcon.jsx";
import { ElementIcon } from "../../components/ElementIcon.jsx";
import { categoryNames } from "./catalog.js";
import { acquisitionSummary, matchesSource, querySpiritFamilies, spiritSkills } from "./query-model.js";
import SkillQueryEffect from "./SkillQueryEffect.jsx";
import "./bidirectional-query.css";

const SOURCES = [["", "全部来源"], ["default", "自学"], ["血脉", "血脉"], ["技能石", "技能石"]];

function Portrait({ spirit }) {
  const [failed, setFailed] = useState(false);
  return failed ? <span className="sq-portrait sq-portrait--empty">暂无图片</span> : <img className="sq-portrait" src={`${import.meta.env.BASE_URL}assets/spirits/${spirit.id}.png`} alt="" loading="lazy" onError={() => setFailed(true)} />;
}

export default function BidirectionalQuery({ season, skills, spirits, initialSpiritId, initialSkillId, gains = [], hideEffects: sharedHideEffects, onHideEffectsChange }) {
  const [direction, setDirection] = useState(initialSpiritId ? "spirit" : "skill");
  const [query, setQuery] = useState(() => season.skills.find(skill => skill.id === initialSkillId)?.name ?? "");
  const [selected, setSelected] = useState(initialSkillId ? [initialSkillId] : []);
  const [spiritId, setSpiritId] = useState(initialSpiritId ?? null);
  const [localHideEffects, setHideEffects] = useState(false);
  const hideEffects = sharedHideEffects ?? localHideEffects;
  const [source, setSource] = useState("");
  const [type, setType] = useState("");
  const [category, setCategory] = useState("");
  const [introduced, setIntroduced] = useState("");
  const [learnerQuery, setLearnerQuery] = useState("");
  const [learnerSource, setLearnerSource] = useState("");
  const [detailQuery, setDetailQuery] = useState("");
  const [detailType, setDetailType] = useState("");
  const [detailCategory, setDetailCategory] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [returnState, setReturnState] = useState(null);
  const results = useRef(null);
  const rail = useRef(null);
  const library = useRef(null);
  const effectAnchor = useRef(null);
  const mobileLibraryScroll = useRef(0);
  const workspace = useRef(null);
  const resultScroll = useRef({ results: 0, workspace: 0 });
  const restoreScroll = useRef(null);
  const returnFamily = useRef(null);
  const detailTitle = useRef(null);
  const skillMap = useMemo(() => new Map(skills.map((skill) => [skill.id, skill])), [skills]);
  const iconSkill = (skill) => ({ ...skill, iconUrl: skillMap.get(skill.id)?.iconUrl });
  const chosen = season.skills.filter(({ id }) => selected.includes(id));
  const spirit = season.spirits.find(({ id }) => id === spiritId);
  const filtered = season.skills.filter((skill) =>
    `${skill.name} ${skill.description ?? ""}`.toLowerCase().includes(query.trim().toLowerCase()) &&
    (!type || skill.type === type) && (!category || skill.category === category) && (!introduced || skill.introducedSeason === introduced));
  const families = useMemo(() => querySpiritFamilies(season, {
    skillIds: direction === "skill" ? selected : [], query: direction === "skill" ? learnerQuery : query,
    source: direction === "skill" ? learnerSource : "", metadata: spirits,
  }), [season, selected, direction, learnerQuery, query, learnerSource, spirits]);
  const learnset = useMemo(() => spiritSkills(season, spiritId), [season, spiritId]);
  const rows = learnset.filter((skill) => (!source || skill.methods.some((method) => matchesSource(method, source))) &&
    `${skill.name} ${skill.description ?? ""}`.toLowerCase().includes(detailQuery.trim().toLowerCase()) &&
    (!detailType || skill.type === detailType) && (!detailCategory || skill.category === detailCategory));
  const related = spirit ? season.spirits.filter((item) => (item.familyId ?? item.id) === (spirit.familyId ?? spirit.id)) : [];
  const readScroll = () => ({ results: results.current?.scrollTop ?? 0, workspace: workspace.current?.scrollTop ?? 0, library: library.current?.scrollTop ?? 0, rail: rail.current?.scrollTop ?? 0 });
  useLayoutEffect(() => {
    if (restoreScroll.current !== null && results.current) {
      results.current.scrollTop = restoreScroll.current.results;
      workspace.current.scrollTop = restoreScroll.current.workspace;
      if (library.current) library.current.scrollTop = restoreScroll.current.library ?? 0;
      if (rail.current) rail.current.scrollTop = restoreScroll.current.rail ?? 0;
      restoreScroll.current = null;
    }
    if (effectAnchor.current) {
      const { container, element, offset } = effectAnchor.current;
      if (element.isConnected) container.scrollTop += element.getBoundingClientRect().top - container.getBoundingClientRect().top - offset;
      effectAnchor.current = null;
    }
  });
  const toggleEffects = () => {
    const desktop = window.matchMedia?.("(min-width: 901px)").matches;
    const container = desktop ? (spirit ? results.current : library.current) : workspace.current;
    const bounds = container?.getBoundingClientRect();
    const element = [...(container?.querySelectorAll("[data-skill-id]") ?? [])].find(node => node.getBoundingClientRect().bottom > bounds.top);
    if (element) effectAnchor.current = { container, element, offset: element.getBoundingClientRect().top - bounds.top };
    if (onHideEffectsChange) onHideEffectsChange(!hideEffects);
    else setHideEffects(!hideEffects);
  };
  const showResults = () => {
    if (results.current.getBoundingClientRect().top > workspace.current.getBoundingClientRect().top + 60) mobileLibraryScroll.current = workspace.current.scrollTop;
    results.current.scrollIntoView({ block: "start", behavior: "smooth" });
  };
  const returnToLibrary = () => workspace.current?.scrollTo({ top: mobileLibraryScroll.current, behavior: "smooth" });
  const openSpirit = (id) => {
    if (!spiritId) { resultScroll.current = readScroll(); returnFamily.current = id; }
    setSpiritId(id); setSource(""); setDetailQuery(""); setDetailType(""); setDetailCategory(""); setExpanded(null);
    restoreScroll.current = { results: 0, workspace: 0 };
    requestAnimationFrame(() => detailTitle.current?.focus({ preventScroll: true }));
  };
  const back = () => {
    setSpiritId(null); restoreScroll.current = resultScroll.current;
    requestAnimationFrame(() => [...(results.current?.querySelectorAll("[data-spirit-id]") ?? [])]
      .find((button) => button.dataset.spiritId === returnFamily.current)?.focus({ preventScroll: true }));
  };
  const add = (id) => {
    if (selected.includes(id)) { setSelected(selected.filter(item => item !== id)); return; }
    if (selected.length >= 4) return;
    setSelected([...selected, id]);
  };
  const changeDirection = (value) => {
    setDirection(value); setQuery(""); setSpiritId(null); setReturnState(null);
  };
  const reverse = (id) => {
    setReturnState({ spiritId, direction, selected, query, type, category, introduced, source, detailQuery, detailType, detailCategory, expanded, learnerQuery, learnerSource, resultScroll: resultScroll.current, returnFamily: returnFamily.current, scroll: readScroll() });
    setDirection("skill"); setSelected([id]); setQuery(season.skills.find(skill => skill.id === id)?.name ?? ""); setType(""); setCategory(""); setIntroduced(""); setLearnerQuery(""); setLearnerSource(""); setSpiritId(null); setExpanded(null); restoreScroll.current = { results: 0, workspace: 0 };
  };
  const returnToSpirit = () => {
    const state = returnState;
    setSpiritId(state.spiritId); setDirection(state.direction); setSelected(state.selected); setQuery(state.query);
    setType(state.type); setCategory(state.category); setIntroduced(state.introduced);
    setSource(state.source); setDetailQuery(state.detailQuery); setDetailType(state.detailType); setDetailCategory(state.detailCategory);
    setExpanded(state.expanded); setLearnerQuery(state.learnerQuery); setLearnerSource(state.learnerSource);
    resultScroll.current = state.resultScroll; returnFamily.current = state.returnFamily;
    restoreScroll.current = state.scroll; setReturnState(null);
    requestAnimationFrame(() => detailTitle.current?.focus({ preventScroll: true }));
  };
  const clearQueryFilters = () => { setQuery(""); setType(""); setCategory(""); setIntroduced(""); };
  const clearDetailFilters = () => { setSource(""); setDetailQuery(""); setDetailType(""); setDetailCategory(""); };
  const hasQueryFilters = Boolean(query || type || category || introduced);
  const hasDetailFilters = Boolean(source || detailQuery || detailType || detailCategory);
  const types = [...new Set(season.skills.map((skill) => skill.type))];
  const typeSelect = (value, update, label, options = types) => <select aria-label={label} value={value} onChange={(event) => update(event.target.value)}><option value="">全部属性</option>{options.map((item) => <option key={item}>{item}</option>)}</select>;
  const categorySelect = (value, update, label) => <select aria-label={label} value={value} onChange={(event) => update(event.target.value)}><option value="">全部种类</option>{Object.entries(categoryNames).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>;
  const effectToggle = <button className="sq-effect-toggle" aria-label={hideEffects ? "显示效果说明" : "隐藏效果说明"} title={hideEffects ? "显示效果说明" : "隐藏效果说明"} aria-pressed={hideEffects} onClick={toggleEffects}>{hideEffects ? <Eye size={20} /> : <EyeSlash size={20} />}</button>;

  return <><div ref={workspace} className={`sq-workspace${spirit ? " sq-workspace--detail" : ""}${direction === "spirit" ? " sq-workspace--spirit" : ""}${hideEffects ? " sq-workspace--compact" : ""}`}>
    <aside className="sq-query">
      <div className="sq-directions" aria-label="查询方向">{[["skill", "找可学精灵"], ["spirit", "查精灵技能"]].map(([id, name]) => <button key={id} aria-pressed={direction === id} onClick={() => changeDirection(id)}>{name}</button>)}</div>
      <div className="sq-query-editor">
        <label className="sq-search-label" htmlFor="sq-search">{direction === "skill" ? "搜索并添加技能" : "搜索精灵"}</label>
        <div className="sq-search"><MagnifyingGlass size={18} /><input id="sq-search" aria-label="搜索技能或精灵" placeholder={direction === "skill" ? "搜索技能名称或效果" : "名称、图鉴号、拼音或别名"} value={query} onChange={(event) => setQuery(event.target.value)} /></div>
        {direction === "skill" && <>
          <div className="sq-filter-fields" aria-label="技能筛选">{typeSelect(type, setType, "技能属性")}{categorySelect(category, setCategory, "技能种类")}<select aria-label="技能所属赛季" value={introduced} onChange={(event) => setIntroduced(event.target.value)}><option value="">全部赛季</option>{[...new Set(season.skills.map((skill) => skill.introducedSeason))].filter(Boolean).sort().map((id) => <option key={id} value={id}>{id} 技能</option>)}</select></div>
          {hasQueryFilters && <button className="sq-clear-filters" aria-label="清除技能筛选" onClick={clearQueryFilters}>清除筛选</button>}
        </>}
      </div>
    </aside>
    <div className="sq-body">
    {direction === "skill" && !spirit && <section className="sq-library" ref={library} aria-label="技能库">
      <div className="sq-library-heading"><h3>技能库 <small>{filtered.length}</small></h3><span>点击添加或取消</span>{effectToggle}</div>
      {returnState && <button className="sq-back" onClick={returnToSpirit}><ArrowLeft size={18} />返回{season.spirits.find((item) => item.id === returnState.spiritId)?.fullName}技能</button>}
      <div className="sq-suggestions" aria-label="技能列表">{filtered.map(skill => <button key={skill.id} data-skill-id={skill.id} aria-label={`${selected.includes(skill.id) ? "取消" : "添加"}${skill.name}`} aria-pressed={selected.includes(skill.id)} aria-disabled={!selected.includes(skill.id) && selected.length === 4} onClick={() => add(skill.id)}>
        <span className="sq-card-heading"><SkillIcon skill={iconSkill(skill)} size={48} /><span><strong>{skill.name}</strong><small><ElementIcon type={skill.type} size={16} />{skill.type} · {categoryNames[skill.category]}</small></span>{selected.includes(skill.id) && <CheckCircle className="sq-card-check" size={18} weight="fill" />}</span>
        <span className="sq-card-values"><span>威力 <b>{skill.basePower ?? "—"}</b></span><span>能耗 <b>{skill.cost ?? "—"}</b></span></span>
        {!hideEffects && <span className="sq-card-description">{skill.description || "技能效果待补充"}</span>}
      </button>)}</div>{!filtered.length && <p className="sq-empty">没有找到符合条件的技能。</p>}
    </section>}
    <div className="sq-rail" ref={rail}>
    <aside className="sq-selection" hidden={direction !== "skill" || Boolean(spirit)} aria-label="已选技能">
      <div className="sq-selected-heading"><strong>已选 {selected.length} / 4</strong>{selected.length > 0 && <button onClick={() => setSelected([])}>清空</button>}</div>
      <div className="sq-selected">{chosen.map(skill => <div key={skill.id}><SkillIcon skill={iconSkill(skill)} size={32} /><span><strong>{skill.name}</strong><small>威力 {skill.basePower ?? "—"} · 能耗 {skill.cost ?? "—"}</small></span><button aria-label={`移除${skill.name}`} onClick={() => setSelected(selected.filter(id => id !== skill.id))}><X size={18} /></button></div>)}</div>
      {selected.length === 4 && <p className="sq-limit" role="status">已选满 4 个技能，请先移除一个。</p>}
      {selected.length > 0 && <button className="sq-show-results" onClick={showResults}>查看匹配家族（{families.length}）</button>}
    </aside>
    <main className="sq-results" ref={results}>
      {spirit ? <>
        <button className="sq-back" onClick={back}><ArrowLeft size={18} />返回匹配结果</button>
        <div className="sq-spirit-heading"><Portrait key={spirit.id} spirit={spirit} /><div><h3 ref={detailTitle} tabIndex={-1}>{spirit.fullName}</h3><p>{spirit.types?.map((type) => <span key={type}><ElementIcon type={type} size={20} />{type}</span>)}<span>{spirit.stage}</span></p>{related.length > 1 && <select aria-label="精灵形态" value={spirit.id} onChange={(event) => openSpirit(event.target.value)}>{related.map((item) => <option key={item.id} value={item.id}>{item.fullName}</option>)}</select>}</div></div>
        <div className="sq-detail-filters"><div className="sq-sources" aria-label="技能学习来源">{SOURCES.map(([id, label]) => <button key={id} aria-label={label} aria-pressed={source === id} onClick={() => setSource(id)}>{label}<small>{learnset.filter(skill => !id || skill.methods.some(method => matchesSource(method, id))).length}</small></button>)}</div><input aria-label="筛选精灵技能" placeholder="技能名称或效果" value={detailQuery} onChange={(event) => setDetailQuery(event.target.value)} />{typeSelect(detailType, setDetailType, "精灵技能属性", [...new Set(learnset.map(skill => skill.type))])}{categorySelect(detailCategory, setDetailCategory, "精灵技能种类")}{effectToggle}</div>
        <div className="sq-count-line"><p className="sq-count" role="status">{rows.length} / {learnset.length} 个技能</p>{hasDetailFilters && <button className="sq-clear-filters" aria-label="清除精灵技能筛选" onClick={clearDetailFilters}>清除筛选</button>}</div>
        <div className="sq-skill-table">{rows.map((skill) => <article data-skill-id={skill.id} className={expanded === skill.id ? "is-expanded" : ""} key={skill.id}>
          <div className="sq-skill-row"><span className="sq-skill-name"><SkillIcon skill={iconSkill(skill)} size={44} /><strong>{skill.name}{gains.some((gain) => gain.spiritId === spiritId && gain.skillIds.includes(skill.id)) && <em>新学</em>}</strong></span><span className="sq-skill-type"><ElementIcon type={skill.type} size={18} />{skill.type} · {categoryNames[skill.category]}</span><span className="sq-values"><span className="sq-cost"><small>能耗 </small>{skill.cost ?? "—"}</span><span className="sq-power"><small>威力 </small>{skill.basePower ?? "—"}</span></span></div>
          {!hideEffects && <SkillQueryEffect skill={skill} expanded={expanded === skill.id} onToggle={() => setExpanded(expanded === skill.id ? null : skill.id)} />}
          <div className="sq-card-footer"><span className="sq-method">{expanded !== skill.id && acquisitionSummary(skill.methods)}</span><button className="sq-reverse" aria-label={`查${skill.name}的可学精灵`} onClick={() => reverse(skill.id)}>可学精灵<CaretRight size={14} /></button></div>
        </article>)}</div>{!rows.length && <p className="sq-empty">没有符合筛选条件的技能；可切回全部来源或清除筛选。</p>}
      </> : <>
        {direction === "skill" && selected.length === 0 ? <p className="sq-empty">添加技能，查找全部可学的精灵。</p> : direction === "spirit" && !query.trim() ? <p className="sq-empty">搜索精灵，查看当前形态的完整技能表。</p> : <>
          <h3 className="sq-result-title" aria-live="polite">{families.length} 个匹配家族</h3>
          {direction === "skill" && <div className="sq-learner-filters"><input aria-label="筛选学习精灵" placeholder="搜索家族" value={learnerQuery} onChange={(event) => setLearnerQuery(event.target.value)} /><select aria-label="学习途径" value={learnerSource} onChange={(event) => setLearnerSource(event.target.value)}>{SOURCES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>{(learnerQuery || learnerSource) && <button className="sq-clear-filters" aria-label="清除学习精灵筛选" onClick={() => { setLearnerQuery(""); setLearnerSource(""); }}>清除筛选</button>}</div>}
          <div className="sq-families">{families.map((family) => <article key={family.id}><button className="sq-family-main" aria-label={`${family.representative.fullName} 查看技能`} data-spirit-id={family.representative.id} onClick={() => openSpirit(family.representative.id)}><Portrait key={family.representative.id} spirit={family.representative} /><strong>{family.representative.fullName}</strong><CaretRight size={16} /></button></article>)}</div>{!families.length && <p className="sq-empty">没有符合条件的精灵，可减少技能条件或清除筛选。</p>}
          {direction === "skill" && <button className="sq-show-results" onClick={returnToLibrary}>返回技能库</button>}
        </>}
      </>}
    </main>
    </div>
    </div>
  </div>{direction === "skill" && !spirit && selected.length > 0 && <nav className="sq-mobile-nav" aria-label="查询快捷导航"><button onClick={returnToLibrary}>返回选技能 · {selected.length}/4</button><button onClick={showResults}>匹配家族 {families.length}</button></nav>}</>;
}
