import { useEffect, useMemo, useRef, useState } from "react";
import { SkillIcon } from "../../components/SkillIcon.jsx";
import { ElementIcon } from "../../components/ElementIcon.jsx";
import { Eye, EyeSlash } from "@phosphor-icons/react";
import { categoryNames, seasonChanges } from "./catalog.js";
import { getCachedCatalog, loadSkillCatalog } from "./load-catalog.js";
import "./skill-query.css";
import BidirectionalQuery from "./BidirectionalQuery.jsx";
import { useRuntime } from "../../runtime/RuntimeContext.jsx";
import { useLocale } from "../../i18n/LocaleContext.jsx";
import { useModalFocus } from "../../hooks/useModalFocus.js";
import { createPlaceholderQueryCatalog } from "./placeholder-catalog.js";
import { EntityChangeHint, hasEntityChanges } from "../../components/EntityChangeHint.jsx";
import { querySeasonChangeInfo, withS5AnnouncementCatalog } from "./s5-announcement-catalog.js";

export default function SkillQueryPanel(props) {
  const { release, serverId } = useRuntime();
  const { t } = useLocale();
  const root = useRef(null);
  const referenceCatalog = useMemo(() => {
    if (serverId !== "global") return null;
    try { return createPlaceholderQueryCatalog(props.snapshot); }
    catch { return null; }
  }, [serverId, props.snapshot]);
  useModalFocus(!release.capabilities.search, root, props.onClose);
  if (release.capabilities.search) return <VerifiedSkillQueryPanel {...props} />;
  return <div className="skill-query-backdrop"><section aria-label={t("技能查询")} aria-modal="true" role="dialog" tabIndex={-1} ref={root} className="skill-query">
    <header className="skill-query__header"><h2>{t("技能检索")}</h2><button onClick={props.onClose} aria-label={t("关闭技能查询")}>{t("关闭")} ×</button></header>
    {referenceCatalog ? <>
      <div className="skill-query__tabs" role="tablist" aria-label={t("技能查询视图")}><button role="tab" aria-selected="true">{t("查询")}</button></div>

      <BidirectionalQuery placeholder season={referenceCatalog} skills={referenceCatalog.skills} spirits={referenceCatalog.spirits} />
    </> : <>
      <div className="skill-query__tabs" role="tablist" aria-label={t("技能查询视图")}>{["查询", "赛季新技能", "赛季学习更新"].map((label, index) => <button key={label} role="tab" aria-selected={index === 0} disabled>{t(label)}</button>)}</div>
      <p className="skill-query__empty" role="status">{t("国际服技能资料待核验，暂不可查询。")}</p>
    </>}
  </section></div>;
}

function VerifiedSkillQueryPanel({ onClose, skills = [], spirits = [], snapshot }) {
  const { serverId } = useRuntime();
  const [catalog, setCatalog] = useState(() => getCachedCatalog(serverId));
  const data = useMemo(() => withS5AnnouncementCatalog(catalog, snapshot), [catalog, snapshot]);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [seasonId, setSeasonId] = useState("");
  const [view, setView] = useState("all");
  const [query, setQuery] = useState("");
  const [type, setType] = useState("");
  const [category, setCategory] = useState("");
  const [entry, setEntry] = useState(null);
  const [hideEffects, setHideEffects] = useState(false);
  const root = useRef(null);
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; }, [onClose]);
  useEffect(() => {
    let active = true;
    loadSkillCatalog(serverId)
      .then((value) => { if (active) { setCatalog(value); setError(""); } })
      .catch(() => { if (active) setError("技能资料暂时无法加载，请重试。"); });
    return () => { active = false; };
  }, [attempt, serverId]);
  useEffect(() => {
    const trigger = document.activeElement;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    root.current?.focus();
    const keydown = (event) => {
      if (event.key === "Escape") { event.stopPropagation(); close.current(); }
      if (event.key !== "Tab") return;
      const controls = [...root.current.querySelectorAll('button,input,select,summary,a[href],[tabindex="0"]')].filter((element) => !element.disabled && element.getClientRects().length);
      if (!controls.length) return;
      if (event.shiftKey && (document.activeElement === controls[0] || document.activeElement === root.current)) { event.preventDefault(); controls.at(-1).focus(); }
      else if (!event.shiftKey && document.activeElement === controls.at(-1)) { event.preventDefault(); controls[0].focus(); }
    };
    document.addEventListener("keydown", keydown, true);
    return () => { document.body.style.overflow = previous; document.removeEventListener("keydown", keydown, true); (trigger?.isConnected && trigger !== document.body ? trigger : document.querySelector('button[aria-label="打开菜单"]'))?.focus(); };
  }, []);
  const season = data?.seasons.find(({ id }) => id === (entry?.seasonId || seasonId || data.currentSeason)) ??
    data?.seasons.find(({ id }) => id === data.currentSeason);
  const previous = data?.seasons[data.seasons.indexOf(season) - 1];
  const changes = useMemo(() => previous && season ? seasonChanges(previous, season) : null, [previous, season]);
  const skillMap = useMemo(() => new Map(skills.map((skill) => [skill.id, skill])), [skills]);
  const spiritMap = useMemo(() => new Map(spirits.map((spirit) => [spirit.id, spirit])), [spirits]);
  const filtered = useMemo(() => (season?.skills ?? []).filter((skill) =>
    (!type || skill.type === type) && (!category || skill.category === category) &&
    `${skill.name} ${skill.description}`.toLowerCase().includes(query.trim().toLowerCase()) &&
    (view !== "new" || skill.introducedSeason === season.id) &&
    (view !== "changes" || hasEntityChanges(querySeasonChangeInfo(season, skill.changeInfo)))), [season, type, category, query, view]);
  const changeView = (value) => { setView(value); setEntry(null); };
  const openQuery = (target) => { setEntry({ ...target, seasonId: season.id, fromView: view }); setView("all"); };
  const gains = useMemo(() => {
    if (!season) return [];
    const updates = new Map((changes?.gains ?? []).map((gain) => [gain.spiritId, gain]));
    // 仅比较 skillIds 会漏掉血脉撤销、替换及仍可从其它途径学习的条目。
    for (const spirit of season.spirits) {
      if (querySeasonChangeInfo(season, spirit.changeInfo)?.items?.some(({ kind }) => kind === "learnset") && !updates.has(spirit.id)) {
        updates.set(spirit.id, { spiritId: spirit.id, skillIds: [] });
      }
    }
    return [...updates.values()].map((gain) => {
      const spirit = season.spirits.find(({ id }) => id === gain.spiritId);
      const changeInfo = querySeasonChangeInfo(season, spirit?.changeInfo);
      const items = changeInfo?.items?.filter(({ kind }) => kind === "learnset") ?? [];
      return { ...gain, spirit,
        skills: gain.skillIds.map((id) => season.skills.find((item) => item.id === id)).filter(Boolean),
        changeInfo: items.length ? { ...changeInfo, items } : null,
      };
    });
  }, [season, changes]);
  const searchText = query.trim().toLowerCase();
  const visibleGains = gains.filter((gain) => gain.spirit?.fullName.toLowerCase().includes(searchText) ||
    spiritMap.get(gain.spiritId)?.aliases?.some((alias) => alias.toLowerCase().includes(searchText)) ||
    gain.skills.some((item) => item.name.toLowerCase().includes(searchText)) ||
    gain.changeInfo?.items.some((item) => `${item.label} ${item.before ?? ""} ${item.after ?? ""}`.toLowerCase().includes(searchText)));
  const filters = data && <div className="skill-query__filters"><input aria-label="搜索技能或精灵" placeholder={view === "gains" ? "搜索精灵或调整技能" : "搜索技能名称或效果"} value={query} onChange={(event) => setQuery(event.target.value)} />
    {view !== "gains" && <><select aria-label="技能属性" value={type} onChange={(event) => setType(event.target.value)}><option value="">全部属性</option>{[...new Set(season.skills.map((entry) => entry.type))].map((item) => <option key={item}>{item}</option>)}</select><select aria-label="技能种类" value={category} onChange={(event) => setCategory(event.target.value)}><option value="">全部种类</option>{Object.entries(categoryNames).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></>}
  </div>;
  return <div className="skill-query-backdrop"><section aria-label="技能查询" aria-modal="true" role="dialog" tabIndex={-1} ref={root} className="skill-query">
    <header className="skill-query__header"><h2>技能检索</h2>{data && <select aria-label="查询赛季" value={season.id} onChange={(event) => { setSeasonId(event.target.value); setEntry(null); }}>{data.seasons.map(({ id }) => <option key={id} value={id}>{id}{id === "S5" && data !== catalog ? "（公告）" : ""}</option>)}</select>}<button onClick={onClose} aria-label="关闭技能查询">关闭 ×</button></header>
    <div className="skill-query__tabs" role="tablist" aria-label="技能查询视图">{[["all", "查询"], ["new", "赛季新技能"], ["gains", "赛季学习更新"], ...(data !== catalog ? [["changes", "赛季技能调整"]] : [])].map(([id, label]) => <button key={id} role="tab" aria-selected={view === id} onClick={() => changeView(id)}>{label}</button>)}</div>
    {error ? <div role="alert" className="skill-query__empty">{error}<button onClick={() => { setError(""); setAttempt((value) => value + 1); }}>重试</button></div> : !data ? <p role="status" className="skill-query__empty">正在加载技能资料…</p> : <>
      {view === "gains" && filters}
      {view === "gains" && <p className="skill-query__context">{previous ? `${previous.id} → ${season.id} · ${season.announcementNote ?? "老精灵新学与新技能学习面"}` : "当前赛季没有可比较的前一赛季资料"}</p>}
      {view === "all" && entry && <p className="skill-query__context">{season.id} 资料 <button onClick={() => { setView(entry.fromView); setSeasonId(season.id); }}>返回赛季查询</button></p>}
      {view === "all" ? <BidirectionalQuery key={`${season.id}-${entry?.spiritId ?? ""}-${entry?.skillId ?? ""}`} season={season} skills={skills} spirits={spirits} initialSpiritId={entry?.spiritId} initialSkillId={entry?.skillId} gains={changes?.gains} hideEffects={hideEffects} onHideEffectsChange={setHideEffects} /> : view === "gains" ? <div className="skill-query__gains">{visibleGains.length ? visibleGains.map((entry) => <article key={entry.spiritId}><h3><button onClick={() => openQuery({ spiritId: entry.spiritId })}>{entry.spirit.fullName}</button><EntityChangeHint changeInfo={entry.changeInfo} /></h3><div>{entry.skills.map((item) => <button key={item.id} onClick={() => openQuery({ skillId: item.id })}><SkillIcon skill={{ ...item, iconUrl: skillMap.get(item.id)?.iconUrl }} size={32} /><span>{item.name} <small>{item.type} · {categoryNames[item.category]}</small></span></button>)}</div>{entry.changeInfo?.items.map((item, index) => <p className="skill-query__learning-change" key={index}><strong>{item.label}</strong>{item.before && <span>调整前：{item.before}</span>}{item.after && <span>调整后：{item.after}</span>}{item.note && <small>{item.note}</small>}</p>)}</article>) : <p className="skill-query__empty">{previous ? "当前资料中没有符合条件的新增记录。" : "请切换到有前一赛季资料的赛季。"}</p>}</div> : view === "changes" ? <>
        {filters}
        <div className="skill-query__gains skill-query__adjustments">{filtered.length ? filtered.map((skill) => <article key={skill.id}><h3><button onClick={() => openQuery({ skillId: skill.id })}><SkillIcon skill={{ ...skill, iconUrl: skillMap.get(skill.id)?.iconUrl }} size={32} />{skill.name}</button><EntityChangeHint changeInfo={querySeasonChangeInfo(season, skill.changeInfo)} /></h3><p>{skill.type} · {categoryNames[skill.category]} · 威力 {skill.basePower ?? "—"} · 能耗 {skill.cost ?? "—"}</p><p>{skill.description}</p></article>) : <p className="skill-query__empty">当前赛季没有符合条件的技能调整。</p>}</div>
      </> : <div className="skill-query__body">
        <div className="skill-query__browser skill-query__browser--cards">
          {filters}
          <div className="skill-query__list" aria-label="技能列表"><p>{filtered.length} 个技能</p><button className="skill-query__visibility" aria-label={hideEffects ? "显示效果说明" : "隐藏效果说明"} title={hideEffects ? "显示效果说明" : "隐藏效果说明"} aria-pressed={hideEffects} onClick={() => setHideEffects(value => !value)}>{hideEffects ? <Eye size={20} /> : <EyeSlash size={20} />}</button><div className="skill-query__cards">{filtered.length ? filtered.map((entry) => <button key={entry.id} onClick={() => openQuery({ skillId: entry.id })}><span className="sq-card-heading"><SkillIcon skill={{ ...entry, iconUrl: skillMap.get(entry.id)?.iconUrl }} size={48} /><span><strong>{entry.name}</strong><small><ElementIcon type={entry.type} size={16} />{entry.type} · {categoryNames[entry.category] ?? entry.category}</small></span></span><span className="sq-card-values"><span>威力 <b>{entry.basePower ?? "—"}</b></span><span>能耗 <b>{entry.cost ?? "—"}</b></span></span>{!hideEffects && <span className="sq-card-description">{entry.description || "技能效果待补充"}</span>}<small className="skill-query__card-link">查看可学家族 →</small></button>) : <p className="skill-query__empty">{season.id === "S5" && view === "new" ? "本次公告未公布 S5 新增技能。" : "没有找到符合条件的技能。"}</p>}</div></div>
        </div>
      </div>}
    </>}
  </section></div>;
}
