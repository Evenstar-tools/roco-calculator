import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, CaretDown, MagnifyingGlass, SlidersHorizontal, X } from "@phosphor-icons/react";
import { SkillIcon } from "../../components/SkillIcon.jsx";
import { ElementIcon } from "../../components/ElementIcon.jsx";
import { categoryNames } from "./catalog.js";
import { acquisitionSummary, matchesSource, querySpiritFamilies, spiritSkills } from "./query-model.js";
import "./bidirectional-query.css";

const SOURCES = [["", "全部来源"], ["default", "默认"], ["血脉", "血脉"], ["技能石", "技能石"]];

function Portrait({ spirit }) {
  const [failed, setFailed] = useState(false);
  return failed ? <span className="sq-portrait sq-portrait--empty">暂无图片</span> : <img className="sq-portrait" src={`${import.meta.env.BASE_URL}assets/spirits/${spirit.id}.png`} alt="" loading="lazy" onError={() => setFailed(true)} />;
}

export default function BidirectionalQuery({ season, skills, spirits, initialSpiritId, initialSkillId, gains = [] }) {
  const [direction, setDirection] = useState(initialSpiritId ? "spirit" : "skill");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(initialSkillId ? [initialSkillId] : []);
  const [spiritId, setSpiritId] = useState(initialSpiritId ?? null);
  const [mobileResults, setMobileResults] = useState(Boolean(initialSkillId || initialSpiritId));
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
  const resultScroll = useRef(0);
  const restoreScroll = useRef(null);
  const detailTitle = useRef(null);
  const skillMap = useMemo(() => new Map(skills.map((skill) => [skill.id, skill])), [skills]);
  const iconSkill = (skill) => ({ ...skill, iconUrl: skillMap.get(skill.id)?.iconUrl });
  const chosen = season.skills.filter(({ id }) => selected.includes(id));
  const spirit = season.spirits.find(({ id }) => id === spiritId);
  const filtered = season.skills.filter((skill) => !selected.includes(skill.id) &&
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
  useLayoutEffect(() => {
    if (restoreScroll.current !== null && results.current) {
      results.current.scrollTop = restoreScroll.current;
      restoreScroll.current = null;
    }
  });
  const openSpirit = (id) => {
    resultScroll.current = results.current?.scrollTop ?? 0;
    setSpiritId(id); setSource(""); setDetailQuery(""); setDetailType(""); setDetailCategory(""); setExpanded(null);
    setMobileResults(true); restoreScroll.current = 0;
    requestAnimationFrame(() => detailTitle.current?.focus({ preventScroll: true }));
  };
  const back = () => { setSpiritId(null); restoreScroll.current = resultScroll.current; };
  const add = (id) => {
    if (selected.length >= 4 || selected.includes(id)) return;
    setSelected([...selected, id]); setMobileResults(true); setLearnerQuery(""); setLearnerSource("");
  };
  const changeDirection = (value) => {
    setDirection(value); setQuery(""); setSpiritId(null); setMobileResults(false); setReturnState(null);
  };
  const reverse = (id) => {
    setReturnState({ spiritId, direction, selected, query, source, detailQuery, detailType, detailCategory, expanded, learnerQuery, learnerSource, scroll: results.current?.scrollTop ?? 0 });
    setDirection("skill"); setSelected([id]); setQuery(""); setLearnerQuery(""); setLearnerSource(""); setSpiritId(null); setMobileResults(true); restoreScroll.current = 0;
  };
  const returnToSpirit = () => {
    const state = returnState;
    setSpiritId(state.spiritId); setDirection(state.direction); setSelected(state.selected); setQuery(state.query);
    setSource(state.source); setDetailQuery(state.detailQuery); setDetailType(state.detailType); setDetailCategory(state.detailCategory);
    setExpanded(state.expanded); setLearnerQuery(state.learnerQuery); setLearnerSource(state.learnerSource);
    restoreScroll.current = state.scroll; setReturnState(null);
  };
  const types = [...new Set(season.skills.map((skill) => skill.type))];
  const typeSelect = (value, update, label) => <select aria-label={label} value={value} onChange={(event) => update(event.target.value)}><option value="">全部属性</option>{types.map((item) => <option key={item}>{item}</option>)}</select>;
  const categorySelect = (value, update, label) => <select aria-label={label} value={value} onChange={(event) => update(event.target.value)}><option value="">全部种类</option>{Object.entries(categoryNames).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>;

  return <div className={`sq-workspace${mobileResults ? " sq-workspace--results" : ""}`}>
    <aside className="sq-query">
      <div className="sq-directions" aria-label="查询方向">{[["skill", "找可学精灵"], ["spirit", "查精灵技能"]].map(([id, name]) => <button key={id} aria-pressed={direction === id} onClick={() => changeDirection(id)}>{name}</button>)}</div>
      <div className="sq-query-editor">
        <label className="sq-search-label" htmlFor="sq-search">{direction === "skill" ? "搜索并添加技能" : "搜索精灵"}</label>
        <div className="sq-search"><MagnifyingGlass size={18} /><input id="sq-search" aria-label="搜索技能或精灵" placeholder={direction === "skill" ? "搜索技能名称或效果" : "名称、图鉴号、拼音或别名"} value={query} onChange={(event) => setQuery(event.target.value)} /></div>
        {direction === "skill" && <>
          <details className="sq-filter-fold"><summary><SlidersHorizontal size={16} />筛选{[type, category, introduced].filter(Boolean).length > 0 && ` · ${[type, category, introduced].filter(Boolean).length}`}</summary><div className="sq-filter-fields">{typeSelect(type, setType, "技能属性")}{categorySelect(category, setCategory, "技能种类")}<select aria-label="技能所属赛季" value={introduced} onChange={(event) => setIntroduced(event.target.value)}><option value="">全部赛季</option>{[...new Set(season.skills.map((skill) => skill.introducedSeason))].filter(Boolean).sort().map((id) => <option key={id} value={id}>{id} 技能</option>)}</select></div></details>
          <div className="sq-selected-heading"><strong>全部可学 · 已选 {selected.length} / 4</strong>{selected.length > 0 && <button onClick={() => { setSelected([]); setSpiritId(null); setMobileResults(false); setReturnState(null); }}>清空</button>}</div>
          <div className="sq-selected">{chosen.map((skill) => <div key={skill.id}><SkillIcon skill={iconSkill(skill)} size={42} /><span><strong>{skill.name}</strong><small>能耗 {skill.cost ?? "—"}　威力 {skill.basePower ?? "—"}</small></span><button aria-label={`移除${skill.name}`} onClick={() => { setSelected(selected.filter((id) => id !== skill.id)); setSpiritId(null); }}><X size={18} /></button></div>)}</div>
          {selected.length === 4 ? <p role="status">已选满 4 个技能，移除后可继续添加。</p> : <div className="sq-suggestions" aria-label="技能列表">{filtered.length ? filtered.map((skill) => <button key={skill.id} aria-label={`添加${skill.name}`} onClick={() => add(skill.id)}><SkillIcon skill={iconSkill(skill)} size={28} /><span><strong>{skill.name}</strong><small>{skill.type} · {categoryNames[skill.category]}</small></span><small>{skill.cost ?? "—"} 耗</small></button>) : <p className="sq-empty">{chosen.some((skill) => skill.name === query.trim()) ? "该技能已添加，可继续搜索其他技能。" : "没有找到符合条件的技能。"}</p>}</div>}
          {selected.length > 0 && <button className="sq-show-results" onClick={() => setMobileResults(true)}>查看匹配结果 <ArrowRight size={16} /></button>}
        </>}
      </div>
    </aside>
    <div className="sq-mobile-summary"><span>{direction === "skill" ? chosen.map((skill) => skill.name).join(" + ") || "未选择技能" : query || "查精灵技能"}</span><button onClick={() => setMobileResults(false)}>{direction === "skill" ? "编辑条件" : "更换精灵"}</button></div>
    <main className="sq-results" ref={results}>
      {spirit ? <>
        <button className="sq-back" onClick={back}><ArrowLeft size={18} />返回匹配结果</button>
        <div className="sq-spirit-heading"><Portrait key={spirit.id} spirit={spirit} /><div><h3 ref={detailTitle} tabIndex={-1}>{spirit.fullName}</h3><p>{spirit.types?.map((type) => <span key={type}><ElementIcon type={type} size={20} />{type}</span>)}<span>{spirit.stage}</span></p>{related.length > 1 && <select aria-label="精灵形态" value={spirit.id} onChange={(event) => openSpirit(event.target.value)}>{related.map((item) => <option key={item.id} value={item.id}>{item.fullName}</option>)}</select>}</div></div>
        <div className="sq-detail-filters"><div className="sq-sources" aria-label="技能学习来源">{SOURCES.map(([id, label]) => <button key={id} aria-pressed={source === id} onClick={() => setSource(id)}>{label}</button>)}</div><details className="sq-filter-fold"><summary><SlidersHorizontal size={16} />筛选{[detailQuery, detailType, detailCategory].filter(Boolean).length > 0 && ` · ${[detailQuery, detailType, detailCategory].filter(Boolean).length}`}</summary><div className="sq-filter-fields"><input aria-label="筛选精灵技能" placeholder="技能名称或效果" value={detailQuery} onChange={(event) => setDetailQuery(event.target.value)} />{typeSelect(detailType, setDetailType, "精灵技能属性")}{categorySelect(detailCategory, setDetailCategory, "精灵技能种类")}</div></details></div>
        <p className="sq-count">{rows.length} / {learnset.length} 个技能</p>
        <div className="sq-skill-table"><div className="sq-table-header"><span>技能</span><span>属性 · 类型</span><span>能耗</span><span>威力</span><span>学习条件</span><span /></div>{rows.map((skill) => <article className={expanded === skill.id ? "is-expanded" : ""} key={skill.id}>
          <button className="sq-skill-row" aria-expanded={expanded === skill.id} aria-label={`查看${skill.name}详情`} onClick={() => setExpanded(expanded === skill.id ? null : skill.id)}><span className="sq-skill-name"><SkillIcon skill={iconSkill(skill)} size={44} /><strong>{skill.name}{gains.some((gain) => gain.spiritId === spiritId && gain.skillIds.includes(skill.id)) && <em>新学</em>}</strong></span><span className="sq-skill-type"><ElementIcon type={skill.type} size={18} />{skill.type} · {categoryNames[skill.category]}</span><span className="sq-values"><span className="sq-cost"><small>能耗 </small>{skill.cost ?? "—"}</span><span className="sq-power"><small>威力 </small>{skill.basePower ?? "—"}</span></span><span className="sq-method">{acquisitionSummary(skill.methods)}</span><CaretDown className="sq-chevron" size={16} /></button>
          {expanded === skill.id && <div className="sq-skill-expanded"><p>{skill.description || "技能效果待补充"}</p><small>{skill.methods.join(" / ") || "学习途径待补充"}</small><div><button onClick={() => reverse(skill.id)}>查可学精灵 <ArrowRight size={16} /></button>{skill.detailUrl?.startsWith("https://wiki.biligame.com/") && <a href={skill.detailUrl} target="_blank" rel="noreferrer">BWIKI 资料</a>}</div></div>}
        </article>)}</div>{!rows.length && <p className="sq-empty">没有符合筛选条件的技能；可切回全部来源或清除筛选。</p>}
      </> : <>
        {returnState && <button className="sq-back" onClick={returnToSpirit}><ArrowLeft size={18} />返回{season.spirits.find((item) => item.id === returnState.spiritId)?.fullName}技能</button>}
        {direction === "skill" && selected.length === 0 ? <p className="sq-empty">添加技能，查找全部可学的精灵。</p> : direction === "spirit" && !query.trim() ? <p className="sq-empty">搜索精灵，查看当前形态的完整技能表。</p> : <>
          {direction === "skill" && <><div className="sq-criteria-effects">{chosen.map((skill) => <details key={skill.id}><summary><SkillIcon skill={iconSkill(skill)} size={28} /><strong>{skill.name}</strong><small>能耗 {skill.cost ?? "—"} · 威力 {skill.basePower ?? "—"}</small><CaretDown size={16} /></summary><p>{skill.description || "技能效果待补充"}</p></details>)}</div><div className="sq-learner-filters"><input aria-label="筛选学习精灵" placeholder="搜索家族内任一精灵" value={learnerQuery} onChange={(event) => setLearnerQuery(event.target.value)} /><select aria-label="学习途径" value={learnerSource} onChange={(event) => setLearnerSource(event.target.value)}>{SOURCES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></div></>}
          <h3 className="sq-result-title">{families.length} 个匹配家族</h3><div className="sq-families">{families.map((family) => <article key={family.id}><button className="sq-family-main" onClick={() => openSpirit(family.representative.id)}><Portrait key={family.representative.id} spirit={family.representative} /><strong>{family.representative.fullName}</strong><small>{family.members.length > 1 ? `${family.members.length} 个匹配形态` : "查看技能"}</small></button>{family.members.length > 1 && <details><summary>选择形态</summary>{family.members.map((member) => <button key={member.id} onClick={() => openSpirit(member.id)}>{member.fullName}</button>)}</details>}</article>)}</div>{!families.length && <p className="sq-empty">没有符合条件的精灵，可减少技能条件或清除筛选。</p>}
        </>}
      </>}
    </main>
  </div>;
}
