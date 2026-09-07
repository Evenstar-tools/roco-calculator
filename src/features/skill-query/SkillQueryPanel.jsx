import { useEffect, useMemo, useRef, useState } from "react";
import { categoryNames, seasonChanges, learnerFamilies, unpackCatalog } from "./catalog.js";
import { SkillIcon } from "../../components/SkillIcon.jsx";
import "./skill-query.css";

function FamilyPortrait({ spirit }) {
  const [failed, setFailed] = useState(false);
  return failed ? <span className="skill-query__portrait-fallback">暂无图片</span> : <img src={`${import.meta.env.BASE_URL}assets/spirits/${spirit.id}.png`} alt="" width={64} height={64} loading="lazy" onError={() => setFailed(true)} />;
}

export default function SkillQueryPanel({ onClose, skills = [] }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [seasonId, setSeasonId] = useState("");
  const [view, setView] = useState("all");
  const [query, setQuery] = useState("");
  const [type, setType] = useState("");
  const [category, setCategory] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [learnerQuery, setLearnerQuery] = useState("");
  const [method, setMethod] = useState("");
  const root = useRef(null);
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; }, [onClose]);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`${import.meta.env.BASE_URL}data/skill-query/catalog.json`, { signal: controller.signal })
      .then((response) => { if (!response.ok) throw new Error("技能资料加载失败"); return response.json(); })
      .then((value) => { setData(unpackCatalog(value)); setError(""); })
      .catch((failure) => { if (failure.name !== "AbortError") setError("技能资料暂时无法加载，请重试。"); });
    return () => controller.abort();
  }, [attempt]);
  useEffect(() => {
    const trigger = document.activeElement;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    root.current?.focus();
    const keydown = (event) => {
      if (event.key === "Escape") { event.stopPropagation(); close.current(); }
      if (event.key !== "Tab") return;
      const controls = [...root.current.querySelectorAll('button,input,select,a[href],[tabindex="0"]')].filter((element) => element.getClientRects().length);
      if (!controls.length) return;
      if (event.shiftKey && (document.activeElement === controls[0] || document.activeElement === root.current)) { event.preventDefault(); controls.at(-1).focus(); }
      else if (!event.shiftKey && document.activeElement === controls.at(-1)) { event.preventDefault(); controls[0].focus(); }
    };
    document.addEventListener("keydown", keydown, true);
    return () => { document.body.style.overflow = previous; document.removeEventListener("keydown", keydown, true); (trigger?.isConnected && trigger !== document.body ? trigger : document.querySelector('button[aria-label="打开菜单"]'))?.focus(); };
  }, []);
  const season = data?.seasons.find(({ id }) => id === (seasonId || data.currentSeason));
  const previous = data?.seasons[data.seasons.indexOf(season) - 1];
  const changes = useMemo(() => previous && season ? seasonChanges(previous, season) : null, [previous, season]);
  const filtered = useMemo(() => (season?.skills ?? []).filter((skill) =>
    (!type || skill.type === type) && (!category || skill.category === category) &&
    `${skill.name} ${skill.description}`.toLowerCase().includes(query.trim().toLowerCase()) &&
    (view !== "new" || changes?.newSkillIds.has(skill.id))), [season, type, category, query, view, changes]);
  const skill = filtered.find(({ id }) => id === selectedId);
  const families = useMemo(() => skill ? learnerFamilies(season, skill.id) : [], [season, skill]);
  const shownFamilies = useMemo(() => skill ? learnerFamilies(season, skill.id, learnerQuery, method) : [], [season, skill, learnerQuery, method]);
  const choose = (id) => { setSelectedId(id); setLearnerQuery(""); setMethod(""); };
  const changeView = (value) => { setView(value); choose(null); };
  const gains = (changes?.gains ?? []).map((entry) => ({ ...entry,
    spirit: season.spirits.find(({ id }) => id === entry.spiritId),
    skills: entry.skillIds.map((id) => season.skills.find((item) => item.id === id)).filter(Boolean),
  })).filter((entry) => entry.spirit?.fullName.includes(query.trim()) || entry.skills.some((item) => item.name.includes(query.trim())));
  return <div className="skill-query-backdrop"><section aria-label="技能查询" aria-modal="true" role="dialog" tabIndex={-1} ref={root} className="skill-query">
    <header className="skill-query__header"><div><h2>技能查询</h2><span>查技能，也查谁能学</span></div><button onClick={onClose} aria-label="关闭技能查询">关闭 ×</button></header>
    <div className="skill-query__tabs" role="tablist" aria-label="技能查询视图">{[["all", "技能查询"], ["new", "赛季新技能"], ["gains", "老精灵新学"]].map(([id, label]) => <button key={id} role="tab" aria-selected={view === id} onClick={() => changeView(id)}>{label}</button>)}</div>
    {error ? <div role="alert" className="skill-query__empty">{error}<button onClick={() => { setError(""); setAttempt((value) => value + 1); }}>重试</button></div> : !data ? <p role="status" className="skill-query__empty">正在加载技能资料…</p> : <>
      <div className="skill-query__filters"><input aria-label="搜索技能或精灵" placeholder={view === "gains" ? "搜索精灵或新学技能" : "搜索技能名称或效果"} value={query} onChange={(event) => setQuery(event.target.value)} />
        {view !== "gains" && <><select aria-label="技能属性" value={type} onChange={(event) => setType(event.target.value)}><option value="">全部属性</option>{[...new Set(season.skills.map((entry) => entry.type))].map((item) => <option key={item}>{item}</option>)}</select><select aria-label="技能种类" value={category} onChange={(event) => setCategory(event.target.value)}><option value="">全部种类</option>{Object.entries(categoryNames).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></>}
        <select aria-label="查询赛季" value={season.id} onChange={(event) => { setSeasonId(event.target.value); choose(null); }}>{data.seasons.map(({ id }) => <option key={id}>{id}</option>)}</select>
      </div>
      {view !== "all" && <p className="skill-query__context">{previous ? `${previous.id} → ${season.id} · 按已收录资料对比` : "当前赛季没有可比较的前一赛季资料"}</p>}
      {view === "gains" ? <div className="skill-query__gains">{gains.length ? gains.map((entry) => <article key={entry.spiritId}><h3>{entry.spirit.fullName}</h3><div>{entry.skills.map((item) => <button key={item.id} onClick={() => { setQuery(""); setType(""); setCategory(""); setView("all"); choose(item.id); }}>{item.name} <small>{item.type} · {categoryNames[item.category]}</small></button>)}</div></article>) : <p className="skill-query__empty">{previous ? "当前资料中没有符合条件的新增记录。" : "请切换到有前一赛季资料的赛季。"}</p>}</div> : <div className={`skill-query__body${skill ? " skill-query__body--selected" : ""}`}>
        <div className="skill-query__list" aria-label="技能列表"><p>{filtered.length} 个技能</p>{filtered.length ? filtered.map((entry) => <button key={entry.id} aria-pressed={skill?.id === entry.id} onClick={() => choose(entry.id)}><strong>{entry.name}</strong><small>{entry.type} · {categoryNames[entry.category] ?? entry.category}</small></button>) : <p className="skill-query__empty">没有找到符合条件的技能。</p>}</div>
        <div className="skill-query__detail">{skill ? <><button className="skill-query__back" onClick={() => choose(null)}>← 返回技能列表</button>
          <div className="skill-query__heading"><SkillIcon skill={{ ...skill, iconUrl: skills.find(({ id }) => id === skill.id)?.iconUrl }} size={64} label /><div><h3>{skill.name}</h3><p>{skill.type} · {categoryNames[skill.category]} <span>{skill.introducedSeason ?? "首次赛季待核实"}</span></p></div><dl><div><dt>能耗</dt><dd>{skill.cost ?? "—"}</dd></div><div><dt>威力</dt><dd>{skill.basePower ?? "—"}</dd></div></dl></div>
          <p className="skill-query__effect">{skill.description || "技能效果待补充"}</p>
          <div className="skill-query__learning-heading"><h4>可学习精灵 <small>{shownFamilies.length === families.length ? families.length : `${shownFamilies.length} / ${families.length}`} 个家族</small></h4><span>每个家族仅展示一只</span></div>
          <div className="skill-query__filters"><input aria-label="筛选学习精灵" placeholder="搜索家族内任一精灵" value={learnerQuery} onChange={(event) => setLearnerQuery(event.target.value)} /><select aria-label="学习途径" value={method} onChange={(event) => setMethod(event.target.value)}><option value="">全部途径</option><option value="default">默认学习</option><option value="血脉">血脉</option><option value="技能石">技能石</option></select></div>
          <div className="skill-query__families" key={`${skill.id}-${method}-${learnerQuery}`}>{shownFamilies.map((family) => <details key={family.id}>
            <summary><FamilyPortrait key={family.representative.id} spirit={family.representative} /><strong>{family.representative.fullName}</strong><small>{family.members.length > 1 ? `含 ${family.members.length} 个可学形态` : "仅此形态"}</small>{family.members.some((member) => changes?.gains.some((gain) => gain.spiritId === member.id && gain.skillIds.includes(skill.id))) && <em>新学</em>}</summary>
            <div className="skill-query__family-methods">{family.members.map((member) => <p key={member.id}><strong>{member.fullName}</strong><small>{member.methods.length ? member.methods.join(" / ") : "学习途径待补充"}</small></p>)}</div>
          </details>)}</div>{!shownFamilies.length && <p>暂无符合条件的学习记录。</p>}
          {skill.detailUrl?.startsWith("https://wiki.biligame.com/") && <a href={skill.detailUrl} target="_blank" rel="noreferrer">查看 BWIKI 资料 ↗</a>}
          <p className="skill-query__source">学习面基线：S3 汇总表；赛季变化：项目收录快照。未收录不代表无法学习。</p>
        </> : <p className="skill-query__empty">选择一个技能，查看效果和学习面。</p>}</div>
      </div>}
    </>}
  </section></div>;
}
