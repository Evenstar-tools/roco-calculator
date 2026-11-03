import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowSquareOut, CaretDown, CaretRight, ClockCounterClockwise, MagnifyingGlass, X } from "@phosphor-icons/react";
import { SpiritImage } from "../../components/SpiritImage.jsx";
import { SkillIcon } from "../../components/SkillIcon.jsx";
import { useModalFocus } from "../../hooks/useModalFocus.js";
import { classifyHistoryItem, getBalanceHistoryIndex, summarizeBatchChanges } from "./history-index.js";
import { diffText } from "./text-diff.js";
import "./balance-history.css";

const PAGE_SIZE = 24;
const NAMED_LIMIT = 2;
const GROUPS = [["stats", "种族值"], ["skills", "技能调整"], ["learnset", "学习面调整"], ["traits", "特性调整"], ["other", "其他调整"]];
// A family is shown by its plain form: "雪绒鸟家族", not "雪绒鸟（春天的样子）家族".
const faceOf = entity => entity?.representative
  ? entity.members.length > 1 ? entity.members.find(member => !member.variantName) ?? entity.representative : entity.representative
  : entity;
const nameOf = entity => {
  if (!entity?.representative) return entity?.fullName ?? entity?.name ?? "";
  if (entity.members.length < 2) return nameOf(entity.representative);
  const face = faceOf(entity);
  return `${face.variantName && face.baseName ? face.baseName : nameOf(face)}家族`;
};
const identityOf = entity => entity?.members?.length > 1
  ? `${entity.members.length} 位成员 · `
  : faceOf(entity)?.dexNo != null ? `#${faceOf(entity).dexNo} · ` : "";
// Labels such as "S4 月涌狂想 9月10日数据" already carry the season.
const showSeasonTag = patch => patch?.seasonId && !String(patch.label ?? "").startsWith(patch.seasonId);
const dateOf = patch => patch?.displayDate ?? patch?.date ?? "日期未提供";
const hasType = (record, type) => record.items.some(item => type === "all" || classifyHistoryItem(item) === type);

function SourceLink({ patch }) {
  return /^https?:\/\//iu.test(patch?.sourceUrl ?? "")
    ? <a className="bh-source" href={patch.sourceUrl} target="_blank" rel="noreferrer">资料来源 <ArrowSquareOut size={14} /></a>
    : <span className="bh-source">资料来源未提供在线链接</span>;
}

function Portrait({ entity, skill = false, size = 38 }) {
  entity = faceOf(entity);
  return skill ? <SkillIcon skill={entity} size={size} loading="lazy" />
    : entity?.asset?.localUrl ? <SpiritImage src={entity.asset.localUrl} name={nameOf(entity)} alt="" width={size} height={size} loading="lazy" /> : null;
}

function Search({ value, onChange, label }) {
  return <div className="bh-search"><MagnifyingGlass size={18} aria-hidden="true" />
    <input aria-label={label} placeholder={label} value={value} onChange={event => onChange(event.target.value)} />
    {value && <button type="button" aria-label={`清空${label}`} onClick={() => onChange("")}><X size={16} /></button>}
  </div>;
}

function TypeFilters({ value, onChange }) {
  return <div className="bh-filters" role="group" aria-label="调整类型">
    {[["all", "全部"], ...GROUPS].map(([key, label]) => <button type="button" key={key} aria-pressed={value === key} onClick={() => onChange(key)}>{label}</button>)}
  </div>;
}

function DiffText({ parts, mark }) {
  return parts.map((part, index) => part.changed ? <mark key={index} className={`bh-diff ${mark}`}>{part.text}</mark> : part.text);
}

function BeforeAfter({ item }) {
  const hasBoth = item.before != null && item.after != null;
  const diff = hasBoth ? diffText(String(item.before), String(item.after)) : null;
  return <div className="bh-before-after">
    {item.before != null && <p><small>调整前</small>{diff ? <DiffText parts={diff.before} mark="is-removed" /> : String(item.before)}</p>}
    {item.after != null && <p><small>{hasBoth ? "调整后" : "内容"}</small>{diff ? <DiffText parts={diff.after} mark="is-added" /> : String(item.after)}</p>}
  </div>;
}

// Who an overview row is about: named inline when few, listed on expand otherwise.
function Owners({ entities }) {
  return <span className="bh-owners">{entities.map(entity => <span className="bh-owner" key={entity.id}><Portrait entity={entity} size={22} />{nameOf(entity)}</span>)}</span>;
}

function OwnerList({ entities }) {
  return <p className="bh-owner-list"><small>涉及 {entities.length} 只精灵</small>{entities.map(nameOf).join("、")}</p>;
}

function ChangeGroups({ items, type, owner, skill = false, nested = false }) {
  const Heading = nested ? "h6" : "h5";
  return GROUPS.map(([key, title]) => {
    const changes = items.filter(item => classifyHistoryItem(item) === key && (type === "all" || type === key));
    if (!changes.length) return null;
    return <section className="bh-change-group" key={key} aria-label={title}><Heading>{title}</Heading>
      <div className={key === "stats" ? "bh-stats" : "bh-details"}>{changes.map((item, index) => {
        const numeric = typeof item.before === "number" && typeof item.after === "number";
        const label = skill && key === "skills" && !item.label?.includes(nameOf(owner)) ? `${nameOf(owner)}·${item.label ?? "效果"}` : item.label;
        if (numeric) {
          const delta = item.after - item.before;
          return <div className="bh-metric" key={index}><span>{label}</span><strong>{item.before} → {item.after}</strong>
            <em className={delta < 0 ? "is-down" : delta > 0 ? "is-up" : ""}>{delta > 0 ? "+" : ""}{delta || "—"}</em>
            {item.note && <p className="bh-note">{item.note}</p>}
          </div>;
        }
        return <div className="bh-detail" key={index}><strong>{label}</strong><BeforeAfter item={item} />
          {item.note && <p className="bh-note">{item.note}</p>}</div>;
      })}</div>
    </section>;
  });
}

function RecordChanges({ record, type, owner, skill = false }) {
  if (skill || owner.members.length < 2) return <ChangeGroups items={record.items} type={type} owner={owner} skill={skill} />;
  return record.scopes.filter(scope => hasType(scope, type)).map((scope, position) => {
    const names = scope.members.map(nameOf).join("、");
    const all = scope.members.length === owner.members.length;
    const title = scope.members.length === 1 ? `仅${names}` : all ? "家族共同调整" : "共同调整";
    return <section className="bh-scope" key={position} aria-label={`${names}的调整`}>
      <div className="bh-scope-head"><h5>{title}</h5>{scope.members.length > 1 && <p>{all ? `全部 ${scope.members.length} 位成员` : names}</p>}</div>
      <ChangeGroups items={scope.items} type={type} owner={owner} nested />
    </section>;
  });
}

function BatchOverview({ changes, type, limit, skill, onMore }) {
  const matching = changes.filter(({ item }) => type === "all" || classifyHistoryItem(item) === type);
  const visible = matching.slice(0, limit);
  return <div className="bh-overview">{GROUPS.map(([key, title]) => {
    const entries = visible.filter(({ item }) => classifyHistoryItem(item) === key);
    if (!entries.length) return null;
    return <section className="bh-overview-group" key={key} aria-label={title}><h4>{title}</h4>
      {entries.map(({ id, item, entities }) => {
        // Skill labels already name the skill; spirits are named when few, listed when many.
        const named = !skill && entities.length <= NAMED_LIMIT;
        const listed = !skill && !named;
        const count = skill ? entities.length > 1 ? `${entities.length} 项技能` : "" : listed ? `${entities.length} 只精灵` : "";
        const label = item.label ?? "效果调整";
        if (typeof item.before === "number" && typeof item.after === "number") {
          const delta = item.after - item.before;
          const cells = <><strong>{named && <Owners entities={entities} />}<span>{label}</span></strong><span>{item.before} → {item.after}</span>
            <em className={delta < 0 ? "is-down" : delta > 0 ? "is-up" : ""}>{delta > 0 ? "+" : ""}{delta || "—"}</em>
            <small>{count}{listed && <CaretDown size={15} />}</small></>;
          if (!listed) return <div className="bh-overview-metric" key={id}>{cells}{item.note && <p className="bh-note">{item.note}</p>}</div>;
          return <details className="bh-overview-detail" key={id}><summary className="bh-overview-metric">{cells}</summary>
            <div className="bh-overview-expanded">{item.note && <p className="bh-note">{item.note}</p>}<OwnerList entities={entities} /></div>
          </details>;
        }
        const shortContent = item.kind === "learnset" && item.after != null && String(item.after).length <= 36;
        return <details className="bh-overview-detail" key={id}><summary><strong>{named && <Owners entities={entities} />}<span>{label}{shortContent ? `：${item.after}` : ""}</span></strong>{count && <small>{count}</small>}<CaretDown size={15} /></summary>
          <div className="bh-overview-expanded"><BeforeAfter item={item} />
            {item.note && <p className="bh-note">{item.note}</p>}{listed && <OwnerList entities={entities} />}</div>
        </details>;
      })}
    </section>;
  })}{matching.length > limit && <button type="button" className="bh-more" onClick={onMore}>显示更多调整（还有 {matching.length - limit} 项）</button>}</div>;
}

function Empty({ children, onReset }) {
  return <div className="bh-empty" role="status"><p>{children}</p>{onReset && <button type="button" onClick={onReset}>清除筛选</button>}</div>;
}

function PatchDate({ patch }) {
  return <><time>{dateOf(patch)}</time>{patch?.displayDate && patch.displayDate !== patch.date && <span className="bh-date-note">资料展示日期 · 历史记录日期 {patch.date}</span>}</>;
}

export default function BalanceHistoryPanel(props) {
  const [visited, setVisited] = useState(props.open);
  if (props.open && !visited) setVisited(true);
  return props.open || visited ? <BalanceHistoryContent {...props} /> : null;
}

function BalanceHistoryContent({ snapshot, open, onClose }) {
  const index = useMemo(() => getBalanceHistoryIndex(snapshot), [snapshot]);
  const [mode, setMode] = useState("spirit");
  const [spiritView, setSpiritView] = useState({ query: "", entityId: null, season: "all", type: "all", limit: PAGE_SIZE });
  const [batchView, setBatchView] = useState({ patchId: null, entityType: "spirits", query: "", season: "all", type: "all", limit: PAGE_SIZE, expandedId: null, focusId: null });
  const [returnPoint, setReturnPoint] = useState(null);
  const dialogRef = useRef(null);
  const scrollRef = useRef(null);
  const sideRef = useRef(null);
  const positions = useRef({ spirit: [0, 0], update: [0, 0] });
  const pendingPosition = useRef(null);
  const id = useId();
  useModalFocus(open, dialogRef, () => { savePosition(); onClose(); });

  const matches = useMemo(() => spiritView.query.trim()
    ? index.searchFamilies(spiritView.query, Infinity)
    : index.families.filter(entity => index.familyRecords.get(entity.id)?.length), [index, spiritView.query]);
  const matchedMembers = useMemo(() => spiritView.query.trim()
    ? new Set(index.searchSpirits(spiritView.query, Infinity).map(entity => entity.id)) : null, [index, spiritView.query]);
  const selected = matches.find(entity => entity.id === spiritView.entityId) ?? matches[0];
  const spiritRecords = (index.familyRecords.get(selected?.id) ?? [])
    .filter(record => (spiritView.season === "all" || record.patch.seasonId === spiritView.season) && hasType(record, spiritView.type));
  const choices = index.patches.filter(patch => batchView.season === "all" || patch.seasonId === batchView.season);
  const patch = choices.find(item => item.id === batchView.patchId) ?? choices[0];
  const batchEntries = useMemo(() => {
    if (mode !== "update") return [];
    const entities = batchView.entityType === "spirits" ? index.spirits : index.skills;
    const records = batchView.entityType === "spirits" ? index.spiritRecords : index.skillRecords;
    const matchingIds = batchView.query.trim() ? new Set((batchView.entityType === "spirits"
      ? index.searchSpirits(batchView.query, Infinity) : index.searchSkills(batchView.query, Infinity)).map(entity => entity.id)) : null;
    const entries = entities.flatMap(entity => {
      if (matchingIds && !matchingIds.has(entity.id)) return [];
      const record = records.get(entity.id)?.find(record => record.patch.id === patch?.id && hasType(record, batchView.type));
      return record ? [{ entity, record }] : [];
    });
    const focus = entries.find(entry => entry.entity.id === batchView.focusId);
    return focus ? [focus, ...entries.filter(entry => entry !== focus)] : entries;
  }, [index, mode, batchView.entityType, batchView.query, batchView.type, batchView.focusId, patch?.id]);
  const batchOverview = useMemo(() => {
    if (mode !== "update" || batchView.query.trim()) return [];
    const entries = batchView.entityType === "skills" ? batchEntries.map(({ entity, record }) => ({ entity,
      record: { ...record, items: record.items.map(item => ({ ...item, skillId: entity.id,
        label: item.label?.includes(nameOf(entity)) ? item.label : `${nameOf(entity)}·${item.label ?? "效果"}` })) },
    })) : batchEntries;
    return summarizeBatchChanges(entries);
  }, [batchEntries, mode, batchView.entityType, batchView.query]);

  useLayoutEffect(() => {
    const position = pendingPosition.current ?? positions.current[mode];
    if (sideRef.current) sideRef.current.scrollTop = position[0];
    if (scrollRef.current) scrollRef.current.scrollTop = position[1];
    pendingPosition.current = null;
  }, [mode, spiritView, batchView, open]);

  function savePosition() {
    positions.current[mode] = [sideRef.current?.scrollTop ?? 0, scrollRef.current?.scrollTop ?? 0];
  }
  function changeMode(next) {
    if (next === mode) return;
    savePosition();
    setMode(next);
  }
  function updateSpirit(changes, resetSide = false) {
    positions.current.spirit = [resetSide ? 0 : sideRef.current?.scrollTop ?? 0, 0];
    setSpiritView(previous => ({ ...previous, ...changes }));
  }
  function updateBatch(changes, resetSide = false) {
    positions.current.update = [resetSide ? 0 : sideRef.current?.scrollTop ?? 0, 0];
    setBatchView(previous => ({ ...previous, ...changes }));
  }
  function remember() {
    savePosition();
    setReturnPoint({ mode, spiritView, batchView, position: positions.current[mode] });
  }
  function jumpToBatch(record) {
    remember();
    positions.current.update = [0, 0];
    setBatchView(previous => ({ ...previous, patchId: record.patch.id, entityType: "spirits", query: "", season: "all", type: "all", limit: PAGE_SIZE, expandedId: null, focusId: null }));
    setMode("update");
  }
  function jumpToSpirit(entity) {
    remember();
    positions.current.spirit = [0, 0];
    setSpiritView({ query: nameOf(entity), entityId: index.familyBySpiritId.get(entity.id)?.id, season: "all", type: "all", limit: PAGE_SIZE });
    setMode("spirit");
  }
  function goBack() {
    pendingPosition.current = returnPoint.position;
    setSpiritView(returnPoint.spiritView);
    setBatchView(returnPoint.batchView);
    setMode(returnPoint.mode);
    setReturnPoint(null);
  }
  function tabsKeyDown(event) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "Home" ? "spirit" : event.key === "End" ? "update" : mode === "spirit" ? "update" : "spirit";
    changeMode(next);
    document.getElementById(`${id}-${next}`)?.focus();
  }
  const view = mode === "spirit" ? spiritView : batchView;

  return createPortal(<div className="balance-history-layer" hidden={!open}>
    <button className="bh-backdrop" tabIndex={-1} type="button" aria-label="关闭平衡调整回顾背景" onClick={() => { savePosition(); onClose(); }} />
    <section ref={dialogRef} className="bh-dialog" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`}>
      <header className="bh-header"><ClockCounterClockwise size={22} aria-hidden="true" /><h2 id={`${id}-title`}>赛季平衡性调整回顾</h2><span className="bh-region">国服</span>
        <button type="button" className="bh-close" aria-label="关闭赛季平衡性调整回顾" onClick={() => { savePosition(); onClose(); }}><X size={20} /></button>
      </header>
      <div className="bh-top"><div className="bh-tabs" role="tablist" aria-label="回查方式" onKeyDown={tabsKeyDown}>
        {[["spirit", "按精灵回查"], ["update", "按更新浏览"]].map(([key, label]) => <button type="button" key={key} id={`${id}-${key}`} role="tab" aria-selected={mode === key} aria-controls={`${id}-content`} tabIndex={mode === key ? 0 : -1} onClick={() => changeMode(key)}>{label}</button>)}
      </div><label className="bh-season"><span>赛季</span><select aria-label="筛选赛季" value={view.season} onChange={event => mode === "spirit" ? updateSpirit({ season: event.target.value }) : updateBatch({ season: event.target.value, patchId: null, limit: PAGE_SIZE, expandedId: null, focusId: null }, true)}>
        <option value="all">全部赛季</option>{index.seasons.map(season => <option key={season} value={season}>{season}</option>)}
      </select></label></div>
      {returnPoint && returnPoint.mode !== mode && <button type="button" className="bh-return" onClick={goBack}><ArrowLeft size={15} />返回{returnPoint.mode === "spirit" ? "按精灵回查" : "按更新浏览"}</button>}
      <div className="bh-body" id={`${id}-content`} role="tabpanel" aria-labelledby={`${id}-${mode}`}>
        {mode === "spirit" ? <>
          <aside className="bh-side" ref={sideRef}><h3 className="bh-side-title">检索精灵</h3>
            <Search label="名称、别名或图鉴号" value={spiritView.query} onChange={query => updateSpirit({ query, entityId: null, limit: PAGE_SIZE }, true)} />
            <div className="bh-search-results" aria-label="精灵检索结果">{matches.slice(0, spiritView.limit).map(entity => <button type="button" className="bh-entity" key={entity.id} aria-pressed={entity.id === selected?.id} onClick={() => updateSpirit({ entityId: entity.id })}>
              <Portrait entity={entity} /><span><strong>{nameOf(entity)}</strong><small>{identityOf(entity)}{index.familyRecords.get(entity.id)?.length ?? 0} 次调整</small>
                {matchedMembers && entity.members.length > 1 && <small className="bh-match">匹配：{entity.members.filter(member => matchedMembers.has(member.id)).map(nameOf).join("、")}</small>}
              </span>
            </button>)}{matches.length > spiritView.limit && <button type="button" className="bh-more" onClick={() => { savePosition(); setSpiritView(previous => ({ ...previous, limit: previous.limit + PAGE_SIZE })); }}>显示更多精灵</button>}</div>
            {!matches.length && <p className="bh-note">没有匹配的精灵，请试试名称、别名或图鉴号。</p>}
          </aside>
          <section className="bh-content">{selected && <div className="bh-summary"><div className="bh-summary-head"><Portrait entity={selected} size={44} /><div><h3>{nameOf(selected)} <small>{selected.members.length > 1 ? `${selected.members.length} 位成员` : faceOf(selected).dexNo != null ? `#${faceOf(selected).dexNo}` : ""}</small></h3><p>已收录 {index.familyRecords.get(selected.id)?.length ?? 0} 次调整 · 按资料日期倒序</p></div></div>
            {selected.members.length > 1 && <p className="bh-family-members">{selected.members.map(nameOf).join("、")}</p>}
            <TypeFilters value={spiritView.type} onChange={type => updateSpirit({ type })} /></div>}
            <div className="bh-scroll" ref={scrollRef}>{!selected ? <Empty>没有匹配的精灵</Empty> : !index.familyRecords.get(selected.id)?.length ? <Empty>尚未收录{nameOf(selected)}的平衡调整记录</Empty> : !spiritRecords.length ? <Empty onReset={() => updateSpirit({ season: "all", type: "all" })}>当前筛选下没有调整记录</Empty> : spiritRecords.map((record, recordIndex) => <article className="bh-record" key={record.patch.id ?? `unlinked-${recordIndex}`}>
              <header className="bh-record-head"><div className="bh-record-date"><PatchDate patch={record.patch} /></div>{showSeasonTag(record.patch) && <span className="bh-season-tag">{record.patch.seasonId}</span>}<h4>{record.patch.label}</h4>
                <div className="bh-record-actions"><SourceLink patch={record.patch} />{record.patch.id && <button type="button" onClick={() => jumpToBatch(record)}>查看本次全部调整 <CaretRight size={14} /></button>}</div></header>
              <RecordChanges record={record} type={spiritView.type} owner={selected} />
            </article>)}</div>
          </section>
        </> : <>
          <aside className="bh-side bh-batch-side" ref={sideRef}><h3 className="bh-side-title">更新批次</h3>{choices.map(choice => <button type="button" key={choice.id} className="bh-batch" aria-pressed={choice.id === patch?.id} onClick={() => updateBatch({ patchId: choice.id, limit: PAGE_SIZE, query: "", expandedId: null, focusId: null })}>
            <strong>{dateOf(choice)}</strong><span>{choice.label}</span>
          </button>)}{!choices.length && <p className="bh-note">该赛季尚未收录调整批次</p>}</aside>
          <section className="bh-content">{patch && <div className="bh-summary"><div className="bh-summary-head bh-batch-heading"><div><h3>{patch.label}</h3><p>{dateOf(patch)} · {patch.spiritCount} 只精灵 · {patch.skillCount} 项技能{patch.displayDate && patch.displayDate !== patch.date ? ` · 历史记录 ${patch.date}` : ""}</p></div><SourceLink patch={patch} /></div>
            <Search label={batchView.entityType === "spirits" ? "在本次更新中查找精灵" : "在本次更新中查找技能"} value={batchView.query} onChange={query => updateBatch({ query, limit: PAGE_SIZE, expandedId: null, focusId: null })} />
            <div className="bh-batch-controls"><div className="bh-filters" role="group" aria-label="更新对象">{[["spirits", "精灵"], ["skills", "技能"]].map(([key, label]) => <button type="button" key={key} aria-pressed={batchView.entityType === key} onClick={() => updateBatch({ entityType: key, query: "", type: "all", limit: PAGE_SIZE, expandedId: null, focusId: null })}>{label}</button>)}</div>
              {batchView.entityType === "spirits" && <TypeFilters value={batchView.type} onChange={type => updateBatch({ type, limit: PAGE_SIZE, expandedId: null })} />}
            </div>
          </div>}
            <div className="bh-scroll" ref={scrollRef}>{!patch ? <Empty>该赛季尚未收录调整批次</Empty> : !batchEntries.length ? <Empty onReset={() => updateBatch({ query: "", type: "all", limit: PAGE_SIZE })}>本次更新没有符合条件的{batchView.entityType === "spirits" ? "精灵" : "技能"}调整记录</Empty> : !batchView.query.trim() ? <BatchOverview key={`${patch.id}-${batchView.entityType}`} changes={batchOverview} type={batchView.type} limit={batchView.limit} skill={batchView.entityType === "skills"} onMore={() => { savePosition(); setBatchView(previous => ({ ...previous, limit: previous.limit + PAGE_SIZE })); }} /> : batchEntries.slice(0, batchView.limit).map(({ entity, record }, entityIndex) => {
              const expanded = batchView.expandedId === entity.id || batchView.expandedId == null && entityIndex === 0;
              return <article className="bh-record" key={entity.id}><button type="button" className="bh-owner-head" aria-expanded={expanded} onClick={() => { savePosition(); setBatchView(previous => ({ ...previous, expandedId: expanded ? "" : entity.id })); }}>
                <Portrait entity={entity} skill={batchView.entityType === "skills"} /><span><strong>{nameOf(entity)}</strong><small>{record.items.filter(item => batchView.type === "all" || classifyHistoryItem(item) === batchView.type).length} 项调整</small></span><span className="bh-owner-action">{expanded ? "收起" : "展开详情"}</span>{expanded ? <CaretDown size={16} /> : <CaretRight size={16} />}
              </button>{expanded && <div className="bh-owner-details"><ChangeGroups items={record.items} type={batchView.type} owner={entity} skill={batchView.entityType === "skills"} />
                {batchView.entityType === "spirits" && <button className="bh-text-button" type="button" onClick={() => jumpToSpirit(entity)}>查看{nameOf(entity)}历次调整 <CaretRight size={14} /></button>}
              </div>}</article>;
            })}{batchView.query.trim() && batchEntries.length > batchView.limit && <button type="button" className="bh-more" onClick={() => { savePosition(); setBatchView(previous => ({ ...previous, limit: previous.limit + PAGE_SIZE })); }}>显示更多调整（还有 {batchEntries.length - batchView.limit} 项）</button>}</div>
          </section>
        </>}
      </div>
    </section>
  </div>, document.body);
}
