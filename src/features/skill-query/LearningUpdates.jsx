import { useMemo } from "react";
import { EntityChangeHint } from "../../components/EntityChangeHint.jsx";
import { SkillIcon } from "../../components/SkillIcon.jsx";
import { SpiritImage } from "../../components/SpiritImage.jsx";
import { createSpiritSearchIndex } from "../../data/search-index.js";
import { useToolLocale } from "../../i18n/useToolLocale.js";
import { publicResourceUrl } from "../../runtime/public-resource-url.js";
import { categoryNames } from "./catalog.js";
import { buildLearningUpdates } from "./learning-updates.js";
import { skillMatchesQuery } from "./query-model.js";

const BATCH_SIZE = 30;
const EMPTY = [];

function representedAddition(item, skills) {
  return item.label === "新增可学习技能" && !item.before && skills.some(skill => skill.name === item.after);
}

export default function LearningUpdates({ season, previous, changes, spirits = EMPTY, skills = EMPTY, onOpen, filters, onFiltersChange }) {
  const { t, typeName } = useToolLocale();
  const { query = "", type = "", category = "", kind = "", visibleCount = BATCH_SIZE } = filters;
  const entries = useMemo(() => buildLearningUpdates(season, changes, spirits), [season, changes, spirits]);
  const skillMap = useMemo(() => new Map(skills.map(skill => [skill.id, skill])), [skills]);
  const search = useMemo(() => createSpiritSearchIndex(entries.flatMap(entry => entry.members)), [entries]);
  const types = useMemo(() => [...new Set(entries.flatMap(entry => entry.skills.map(skill => skill.type)))].filter(Boolean), [entries]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matchingSpirits = new Set(search.search(query, Infinity).map(spirit => spirit.id));
    return entries.flatMap(entry => {
      if ((kind === "new" && !entry.hasNewSkills) || (kind === "learning" && !entry.hasLearningChanges)) return [];
      const matchingSkills = entry.skills.filter(skill => (!type || skill.type === type) && (!category || skill.category === category));
      if ((type || category) && !matchingSkills.length) return [];
      const learningChanges = entry.changeInfo?.items.filter(item => !representedAddition(item, entry.skills)) ?? [];
      const visibleSources = entry.changeInfo?.items.filter(item => representedAddition(item, matchingSkills)) ?? [];
      const textMatches = !needle || entry.members.some(member => matchingSpirits.has(member.id)) ||
        matchingSkills.some(skill => skillMatchesQuery(skill, query)) ||
        visibleSources.some(item => String(item.note ?? "").toLowerCase().includes(needle)) ||
        learningChanges.some(item => `${item.label} ${item.before ?? ""} ${item.after ?? ""} ${item.note ?? ""}`.toLowerCase().includes(needle));
      return textMatches ? [{ ...entry, skills: matchingSkills, learningChanges }] : [];
    });
  }, [entries, query, type, category, kind, search]);
  const hasFilters = Boolean(query || type || category || kind);
  const update = (field) => (event) => onFiltersChange(previous => ({ ...previous, [field]: event.target.value, visibleCount: BATCH_SIZE }));
  const clear = () => onFiltersChange({});

  return <>
    <div className="skill-query__filters learning-updates__filters">
      <input aria-label={t("搜索技能或精灵")} placeholder={t("搜索精灵或调整技能")} value={query} onChange={update("query")} />
      <select aria-label={t("技能属性")} value={type} onChange={update("type")}>
        <option value="">{t("全部属性")}</option>{types.map(value => <option key={value} value={value}>{typeName(value)}</option>)}
      </select>
      <select aria-label={t("技能种类")} value={category} onChange={update("category")}>
        <option value="">{t("全部种类")}</option>{Object.entries(categoryNames).map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}
      </select>
      <select aria-label={t("更新类型")} value={kind} onChange={update("kind")}>
        <option value="">{t("全部更新")}</option><option value="new">{t("新增技能")}</option><option value="learning">{t("学习途径调整")}</option>
      </select>
      {hasFilters && <button type="button" onClick={clear}>{t("清除筛选")}</button>}
    </div>
    <p className="skill-query__context learning-updates__count">
      <span>{previous ? `${previous.id} → ${season.id}` : t("当前赛季没有可比较的前一赛季资料")}</span>
      <span>{t("{count} 条更新", { count: filtered.length })}</span>
    </p>
    <div className="skill-query__gains learning-updates" aria-label={t("赛季学习更新列表")}>
      {filtered.slice(0, visibleCount).map((entry, index) => {
        const spirit = entry.spirit;
        const portrait = publicResourceUrl(spirit.assetUrl ?? spirit.asset?.localUrl ?? `/assets/spirits/${spirit.id}.png`);
        return <article key={entry.key}>
          <h3><button type="button" aria-label={spirit.fullName} onClick={() => onOpen({ spiritId: entry.spiritId })}>
            <SpiritImage className="learning-update__portrait" src={portrait} name={spirit.fullName} alt="" width={40} height={40} loading={index < 6 ? "eager" : "lazy"} decoding="async" />
            <span>{spirit.fullName}</span>
          </button>{entry.isFamily && <small className="learning-update__family" title={entry.members.map(member => member.fullName).join(" / ")}>{t("家族")}</small>}
          <EntityChangeHint changeInfo={entry.changeInfo} /></h3>
          <div>{entry.skills.map(item => <button type="button" key={item.id} onClick={() => onOpen({ skillId: item.id })}>
            <SkillIcon skill={{ ...item, iconUrl: skillMap.get(item.id)?.iconUrl ?? item.iconUrl }} size={32} loading={index < 3 ? "eager" : "lazy"} />
            <span>{t(item.name)} <small>{typeName(item.type)} · {t(categoryNames[item.category])}</small>
              {[...new Set(entry.changeInfo?.items.filter(change => representedAddition(change, [item])).map(change => change.note).filter(Boolean))].map(note => <small key={note}>{t(note)}</small>)}
            </span>
          </button>)}</div>
          {entry.learningChanges.map((item, itemIndex) => <p className="skill-query__learning-change" key={itemIndex}>
            <strong>{t(item.label)}</strong>{item.before && <span>{t("调整前：")}{t(item.before)}</span>}
            {item.after && <span>{t("调整后：")}{t(item.after)}</span>}{item.note && <small>{t(item.note)}</small>}
          </p>)}
        </article>;
      })}
      {!filtered.length && <p className="skill-query__empty">{t("没有符合条件的学习更新。")}</p>}
      {filtered.length > visibleCount && <button type="button" className="learning-updates__more" onClick={() => onFiltersChange(previous => ({ ...previous, visibleCount: visibleCount + BATCH_SIZE }))}>
        {t("显示更多更新 · {count} / {total}", { count: visibleCount, total: filtered.length })}
      </button>}
    </div>
  </>;
}
