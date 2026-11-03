import { prepareSkillQueryCatalog } from "./prepare-catalog.js";
import { useEffect, useMemo, useRef, useState } from "react";
import { SkillIcon } from "../../components/SkillIcon.jsx";
import { ElementIcon } from "../../components/ElementIcon.jsx";
import { Eye, EyeSlash, X } from "@phosphor-icons/react";
import { categoryNames, seasonChanges } from "./catalog.js";
import { getCachedCatalog, loadSkillCatalog } from "./load-catalog.js";
import "./skill-query.css";
import BidirectionalQuery from "./BidirectionalQuery.jsx";
import LearningUpdates from "./LearningUpdates.jsx";
import { useRuntime } from "../../runtime/RuntimeContext.jsx";
import { useToolLocale as useLocale } from "../../i18n/useToolLocale.js";
import { useModalFocus } from "../../hooks/useModalFocus.js";
import { createPlaceholderQueryCatalog } from "./placeholder-catalog.js";
import { EntityChangeHint, hasEntityChanges } from "../../components/EntityChangeHint.jsx";
import { querySeasonChangeInfo } from "./s5-announcement-catalog.js";
import { skillMatchesQuery } from "./query-model.js";

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
    <header className="skill-query__header"><h2>{t("技能检索")}</h2><button type="button" className="skill-query__close" onClick={props.onClose} aria-label={t("关闭技能查询")} title={t("关闭")}><X size={20} aria-hidden="true" /></button></header>
    {referenceCatalog ? <>
      <div className="skill-query__tabs" role="tablist" aria-label={t("技能查询视图")}><button role="tab" aria-selected="true">{t("查询")}</button></div>

      <BidirectionalQuery placeholder season={referenceCatalog} skills={referenceCatalog.skills} spirits={referenceCatalog.spirits} />
    </> : <>
      <div className="skill-query__tabs" role="tablist" aria-label={t("技能查询视图")}>{["查询", "赛季新技能", "赛季学习更新"].map((label, index) => <button key={label} role="tab" aria-selected={index === 0} disabled>{t(label)}</button>)}</div>
      <p className="skill-query__empty" role="status">{t("技能资料暂时无法加载。")}</p>
    </>}
  </section></div>;
}

function VerifiedSkillQueryPanel({ onClose, skills = [], spirits = [], snapshot, initialSpiritId, onBackToSource }) {
  const { t, locale, typeName } = useLocale();
  const { serverId } = useRuntime();
  const [catalog, setCatalog] = useState(() => getCachedCatalog(serverId));
  const { canonicalData, data } = useMemo(() => prepareSkillQueryCatalog(catalog, snapshot, serverId, locale), [catalog, snapshot, serverId, locale]);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [seasonId, setSeasonId] = useState("");
  const [view, setView] = useState("all");
  const [query, setQuery] = useState("");
  const [type, setType] = useState("");
  const [category, setCategory] = useState("");
  const [entry, setEntry] = useState(null);
  const [hideEffects, setHideEffects] = useState(false);
  const [learningFilters, setLearningFilters] = useState({});
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
  const filtered = useMemo(() => (season?.skills ?? []).filter((skill) =>
    (!type || skill.type === type) && (!category || skill.category === category) &&
    skillMatchesQuery(skill, query) &&
    (view !== "new" || skill.introducedSeason === season.id) &&
    (view !== "changes" || hasEntityChanges(querySeasonChangeInfo(season, skill.changeInfo)))), [season, type, category, query, view]);
  const changeView = (value) => { setView(value); setEntry(null); };
  const openQuery = (target) => { setEntry({ ...target, seasonId: season.id, fromView: view }); setView("all"); };
  const announcementWithoutNewSkills = season?.id === "S5" && snapshot?.meta?.s5NrcSync?.complete !== true &&
    !season.skills.some(skill => skill.introducedSeason === "S5");
  const filters = data && <div className="skill-query__filters"><input aria-label={t("搜索技能或精灵")} placeholder={view === "gains" ? t("搜索精灵或调整技能") : t("搜索技能名称或效果")} value={query} onChange={(event) => setQuery(event.target.value)} />
    {view !== "gains" && <><select aria-label={t("技能属性")} value={type} onChange={(event) => setType(event.target.value)}><option value="">{t("全部属性")}</option>{[...new Set(season.skills.map((entry) => entry.type))].map((item) => <option key={item} value={item}>{typeName(item)}</option>)}</select><select aria-label={t("技能种类")} value={category} onChange={(event) => setCategory(event.target.value)}><option value="">{t("全部种类")}</option>{Object.entries(categoryNames).map(([id, label]) => <option key={id} value={id}>{t(label)}</option>)}</select></>}
  </div>;
  return <div className="skill-query-backdrop"><section aria-label={t("技能查询")} aria-modal="true" role="dialog" tabIndex={-1} ref={root} className="skill-query">
    <header className="skill-query__header"><h2>{t("技能检索")}</h2>{data && <select aria-label={t("查询赛季")} value={season.id} onChange={(event) => { setSeasonId(event.target.value); setEntry(null); }}>{data.seasons.map(({ id }) => <option key={id} value={id}>{id}{id === "S5" && canonicalData !== catalog && snapshot?.meta?.s5NrcSync?.complete !== true ? t("（公告）") : ""}</option>)}</select>}<button type="button" className="skill-query__close" onClick={onClose} aria-label={t("关闭技能查询")} title={t("关闭")}><X size={20} aria-hidden="true" /></button></header>
    <div className="skill-query__tabs" role="tablist" aria-label={t("技能查询视图")}>{[["all", "查询"], ["new", "赛季新技能"], ["gains", "赛季学习更新"], ...(canonicalData !== catalog ? [["changes", "赛季技能调整"]] : [])].map(([id, label]) => <button key={id} role="tab" aria-selected={view === id} onClick={() => changeView(id)}>{t(label)}</button>)}</div>
    {error ? <div role="alert" className="skill-query__empty">{t(error)}<button onClick={() => { setError(""); setAttempt((value) => value + 1); }}>{t("重试")}</button></div> : !data ? <p role="status" className="skill-query__empty">{t("正在加载技能资料…")}</p> : <>
      {view === "all" && entry && <p className="skill-query__context">{season.id}{" "}{t("资料")}{" "}<button onClick={() => { setView(entry.fromView); setSeasonId(season.id); }}>{t("返回赛季查询")}</button></p>}
      {view === "all" ? <BidirectionalQuery key={`${season.id}-${entry?.spiritId ?? initialSpiritId ?? ""}-${entry?.skillId ?? ""}`} season={season} skills={skills} spirits={spirits} initialSpiritId={entry ? entry.spiritId : (season.spirits.some(spirit => spirit.id === initialSpiritId) ? initialSpiritId : undefined)} onBackToSource={onBackToSource} initialSkillId={entry?.skillId} gains={changes?.gains} hideEffects={hideEffects} onHideEffectsChange={setHideEffects} /> : view === "gains" ? <LearningUpdates key={season.id} season={season} previous={previous} changes={changes} spirits={spirits} skills={skills} onOpen={openQuery} filters={learningFilters} onFiltersChange={setLearningFilters} /> : view === "changes" ? <>
        {filters}
        <div className="skill-query__gains skill-query__adjustments">{filtered.length ? filtered.map((skill, index) => <article key={skill.id}><h3><button onClick={() => openQuery({ skillId: skill.id })}><SkillIcon skill={{ ...skill, iconUrl: skillMap.get(skill.id)?.iconUrl }} size={32} loading={index < 12 ? "eager" : "lazy"} />{t(skill.name)}</button><EntityChangeHint changeInfo={querySeasonChangeInfo(season, skill.changeInfo)} /></h3><p>{typeName(skill.type)} · {t(categoryNames[skill.category])}{" "}{t("· 威力")}{" "}{skill.basePower ?? "—"}{" "}{t("· 能耗")}{" "}{skill.cost ?? "—"}</p><p>{t(skill.description)}</p></article>) : <p className="skill-query__empty">{t("当前赛季没有符合条件的技能调整。")}</p>}</div>
      </> : <div className="skill-query__body">
        <div className="skill-query__browser skill-query__browser--cards">
          {filters}
          <div className="skill-query__list" aria-label={t("技能列表")}><p>{filtered.length}{" "}{t("个技能")}</p><button className="skill-query__visibility" aria-label={hideEffects ? t("显示效果说明") : t("隐藏效果说明")} title={hideEffects ? t("显示效果说明") : t("隐藏效果说明")} aria-pressed={hideEffects} onClick={() => setHideEffects(value => !value)}>{hideEffects ? <Eye size={20} /> : <EyeSlash size={20} />}</button><div className="skill-query__cards">{filtered.length ? filtered.map((entry, index) => <button key={entry.id} onClick={() => openQuery({ skillId: entry.id })}><span className="sq-card-heading"><SkillIcon skill={{ ...entry, iconUrl: skillMap.get(entry.id)?.iconUrl }} size={48} loading={index < 12 ? "eager" : "lazy"} /><span><strong>{t(entry.name)}</strong><small><ElementIcon type={entry.type} size={16} />{typeName(entry.type)} · {t(categoryNames[entry.category] ?? entry.category)}</small></span></span><span className="sq-card-values"><span>{t("威力")}{" "}<b>{entry.basePower ?? "—"}</b></span><span>{t("能耗")}{" "}<b>{entry.cost ?? "—"}</b></span></span>{!hideEffects && <span className="sq-card-description">{t(entry.description || t("技能效果待补充"))}</span>}<small className="skill-query__card-link">{t("查看可学家族 →")}</small></button>) : <p className="skill-query__empty">{announcementWithoutNewSkills && view === "new" ? t("本次公告未公布 S5 新增技能。") : t("没有找到符合条件的技能。")}</p>}</div></div>
        </div>
      </div>}
    </>}
  </section></div>;
}
