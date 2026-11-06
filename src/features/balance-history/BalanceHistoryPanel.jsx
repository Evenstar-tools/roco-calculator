import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowSquareOut, CaretRight, ClockCounterClockwise, MagnifyingGlass, X } from "@phosphor-icons/react";
import { SpiritImage } from "../../components/SpiritImage.jsx";
import { SkillIcon } from "../../components/SkillIcon.jsx";
import { useModalFocus } from "../../hooks/useModalFocus.js";
import { classifyHistoryItem, getBalanceHistoryIndex, groupBatch } from "./history-index.js";
import { diffText } from "./text-diff.js";
import "./balance-history.css";

const PAGE_SIZE = 24;
// One set of names and one order for filters, overview sections and per-spirit records.
const GROUPS = [["stats", "种族值"], ["skills", "技能本身"], ["traits", "特性"], ["learnset", "学习面"], ["other", "其他"]];
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
// "2026.11.05 资料 · 10.31 记录" when the data was published after its record date.
const dateLine = patch => `${dateOf(patch)}${patch?.date && patch.displayDate && patch.displayDate !== patch.date
  ? ` 资料 · ${patch.date.startsWith(patch.displayDate.slice(0, 5)) ? patch.date.slice(5) : patch.date} 记录` : ""}`;
const hasType = (record, type) => record.items.some(item => type === "all" || classifyHistoryItem(item) === type);
const numeric = item => typeof item.before === "number" && typeof item.after === "number";
// Energy cost and cooldown read the other way round: lower is a buff.
const gainOf = item => (/cost|cooldown/u.test(item.field) || /能耗|冷却/u.test(item.label) ? -1 : 1) * (item.after - item.before);
const tone = value => value > 0 ? "is-up" : value < 0 ? "is-down" : "";
const signed = value => `${value > 0 ? "+" : ""}${value}`;
const spirits = rows => rows.flatMap(row => row.entities).length;
const verdictOf = items => {
  const gains = items.filter(numeric).map(gainOf);
  return gains.length && gains.every(gain => gain > 0) ? "is-up" : gains.length && gains.every(gain => gain < 0) ? "is-down" : "";
};

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
    <input data-search aria-label={label} placeholder={label} value={value} onChange={event => onChange(event.target.value)} />
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

function Delta({ item }) {
  return <span className={`bh-chip ${tone(gainOf(item))}`}>{item.label} {item.before}→{item.after} <b>{signed(item.after - item.before)}</b></span>;
}

function Who({ entity, skill, size = 30, children }) {
  return <span className="bh-who"><Portrait entity={entity} skill={skill} size={size} /><strong>{nameOf(entity)}</strong>{children}</span>;
}

// Names are written out; a family that shares the change folds into "X家族 ×N".
function Names({ entities, familyOf }) {
  const groups = new Map();
  for (const entity of entities) {
    const family = familyOf(entity) ?? entity;
    groups.set(family, [...groups.get(family) ?? [], entity]);
  }
  return <div className="bh-names">{[...groups].map(([family, members]) => members.length > 2
    ? <details key={family.id}><summary><Portrait entity={family} size={20} />{nameOf(family)} ×{members.length}</summary>{members.map(nameOf).join("、")}</details>
    : members.map(entity => <Who key={entity.id} entity={entity} size={20} />))}</div>;
}

// Numbers read as chips that flow in a row; text changes take a full line with the diff.
function ItemLines({ items }) {
  return <div className="bh-lines">{items.map((item, index) => numeric(item) && !item.note ? <Delta key={index} item={item} />
    : <div className="bh-line" key={index}>{numeric(item) ? <Delta item={item} />
      : item.before == null && String(item.after).length <= 36 ? <p>{item.label}：{item.after}</p>
        : <><small>{item.label}</small><BeforeAfter item={item} /></>}{item.note && <p className="bh-note">{item.note}</p>}</div>)}</div>;
}

function ChangeGroups({ items, type, nested = false }) {
  const Heading = nested ? "h6" : "h5";
  return GROUPS.map(([key, title]) => {
    const changes = items.filter(item => classifyHistoryItem(item) === key && (type === "all" || type === key));
    return changes.length > 0 && <section className="bh-change-group" key={key} aria-label={title}><Heading>{title}</Heading><ItemLines items={changes} /></section>;
  });
}

function RecordChanges({ record, type, owner }) {
  if (owner.members.length < 2) return <ChangeGroups items={record.items} type={type} />;
  return record.scopes.filter(scope => hasType(scope, type)).map((scope, position) => {
    const names = scope.members.map(nameOf).join("、");
    const all = scope.members.length === owner.members.length;
    const title = scope.members.length === 1 ? `仅${names}` : all ? "家族共同调整" : "共同调整";
    return <section className="bh-scope" key={position} aria-label={`${names}的调整`}>
      <div className="bh-scope-head"><h5>{title}</h5>{scope.members.length > 1 && <p>{all ? `全部 ${scope.members.length} 位成员` : names}</p>}</div>
      <ChangeGroups items={scope.items} type={type} nested />
    </section>;
  });
}

function BatchOverview({ grouped, type, limit, familyOf, onMore }) {
  const shared = rows => rows.map(({ items, entities }) => <div className="bh-row" key={entities[0].id}><Names entities={entities} familyOf={familyOf} /><ItemLines items={items} /></div>);
  const rows = {
    stats: grouped.stats.map(({ owner, members }) => <div className="bh-family" key={owner.id}>
      {members.length > 1 && <p><Who entity={owner} size={22} />{members.length} 只同批调整</p>}
      {members.map(({ entity, items, total }) => <div className="bh-stat-row" key={entity.id}><Who entity={entity} />
        <ItemLines items={items} /><b className={tone(total)}>总和 {signed(total)}</b></div>)}
    </div>),
    skills: grouped.skills.map(card => <article className="bh-card" key={card.name}>
      <Who entity={card.skill ?? card} skill={!!card.skill} size={26}><span className={`bh-verdict ${card.tone}`} /></Who>
      <ItemLines items={card.items} />
      {card.users.length > 0 && <div className="bh-users"><small>{card.users.length} 只精灵会用</small><Names entities={card.users} familyOf={familyOf} /></div>}
    </article>),
    traits: shared(grouped.traits),
    learnset: grouped.learnset.map(({ item, removed, entities }) => <div className="bh-row" key={removed + (item.before ?? item.after)}>
      <strong className={removed ? "is-down" : "is-up"}>{removed ? `− ${item.before}` : `+ ${item.after}`}<small>{entities.length} 只</small></strong>
      <Names entities={entities} familyOf={familyOf} /></div>),
    other: shared(grouped.other),
  };
  // Reading hints for a section live in the stylesheet beside its heading.
  return <div className="bh-overview">{GROUPS.map(([key, title]) => (type === "all" || type === key) && rows[key].length > 0 && <section className={`bh-section is-${key}`} key={key} aria-label={title}>
    <h4>{title}</h4>{rows[key].slice(0, limit)}
    {rows[key].length > limit && <button type="button" className="bh-more" onClick={onMore}>显示更多{title}（还有 {rows[key].length - limit} 项）</button>}</section>)}</div>;
}

function Kpis({ grouped, type, onPick }) {
  const count = (list, value) => list.filter(item => item === value).length;
  const totals = grouped.stats.flatMap(group => group.members.map(member => Math.sign(member.total)));
  const tones = grouped.skills.map(card => card.tone);
  const facts = {
    stats: [`${totals.length} 只`, `↑${count(totals, 1)} ↓${count(totals, -1)}`],
    skills: [`${tones.length} 项`, `↑${count(tones, "is-up")} ↓${count(tones, "is-down")}`],
    traits: [`${spirits(grouped.traits)} 只`],
    learnset: [`${new Set(grouped.learnset.flatMap(row => row.entities)).size} 只`],
    other: [`${spirits(grouped.other)} 只`],
  };
  return <div className="bh-kpis" role="group" aria-label="调整类型">{GROUPS.map(([key, label]) => grouped[key].length > 0 && <button type="button" key={key} aria-pressed={type === key} onClick={() => onPick(type === key ? "all" : key)}>
    <small>{label}</small><strong>{facts[key][0]}</strong><span>{facts[key][1]}</span></button>)}</div>;
}

function Empty({ children, onReset }) {
  return <div className="bh-empty" role="status"><p>{children}</p>{onReset && <button type="button" onClick={onReset}>清除筛选</button>}</div>;
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
  const [batchView, setBatchView] = useState({ patchId: null, query: "", season: "all", type: "all", limit: PAGE_SIZE });
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
  const familyOf = entity => {
    const family = index.familyBySpiritId.get(entity.id);
    return family?.members.length > 1 ? family : null;
  };
  const batchEntries = useMemo(() => mode !== "update" ? [] : [[index.spirits, index.spiritRecords, false], [index.skills, index.skillRecords, true]]
    .flatMap(([entities, records, skill]) => entities.flatMap(entity => {
      const record = records.get(entity.id)?.find(record => record.patch.id === patch?.id);
      return record ? [{ entity, record, skill }] : [];
    })), [index, mode, patch?.id]);
  const grouped = useMemo(() => {
    const query = batchView.query.trim();
    const ids = new Set(query ? [...index.searchSpirits(query, Infinity), ...index.searchSkills(query, Infinity)].map(entity => entity.id) : []);
    const entries = query ? batchEntries.filter(entry => ids.has(entry.entity.id)) : batchEntries;
    const result = groupBatch(entries, familyOf);
    for (const card of result.skills) card.tone = verdictOf(card.items);
    result.size = entries.length;
    return result;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- familyOf only reads the index.
  }, [index, batchEntries, batchView.query]);

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
    setBatchView(previous => ({ ...previous, patchId: record.patch.id, query: "", season: "all", type: "all", limit: PAGE_SIZE }));
    setMode("update");
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
      </div><label className="bh-season"><span>赛季</span><select aria-label="筛选赛季" value={view.season} onChange={event => mode === "spirit" ? updateSpirit({ season: event.target.value }) : updateBatch({ season: event.target.value, patchId: null, type: "all", limit: PAGE_SIZE }, true)}>
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
              <header className="bh-record-head"><time className="bh-record-date">{dateLine(record.patch)}</time>{showSeasonTag(record.patch) && <span className="bh-season-tag">{record.patch.seasonId}</span>}<h4>{record.patch.label}</h4>
                <div className="bh-record-actions"><SourceLink patch={record.patch} />{record.patch.id && <button type="button" onClick={() => jumpToBatch(record)}>查看本次全部调整 <CaretRight size={14} /></button>}</div></header>
              <RecordChanges record={record} type={spiritView.type} owner={selected} />
            </article>)}</div>
          </section>
        </> : <>
          <aside className="bh-side bh-batch-side" ref={sideRef}><h3 className="bh-side-title">更新批次</h3>{choices.map(choice => <button type="button" key={choice.id} className="bh-batch" aria-pressed={choice.id === patch?.id} onClick={() => updateBatch({ patchId: choice.id, limit: PAGE_SIZE, query: "", type: "all" })}>
            <strong>{dateOf(choice)}</strong><span>{choice.label}</span>
          </button>)}{!choices.length && <p className="bh-note">该赛季尚未收录调整批次</p>}</aside>
          <section className="bh-content">{patch && <div className="bh-summary"><div className="bh-summary-head bh-batch-heading"><div><h3>{patch.label}</h3><p>{dateLine(patch)}</p></div><SourceLink patch={patch} /></div>
            <Kpis grouped={grouped} type={batchView.type} onPick={type => updateBatch({ type, limit: PAGE_SIZE })} />
            <Search label="在本次更新中查找精灵或技能" value={batchView.query} onChange={query => updateBatch({ query, type: "all", limit: PAGE_SIZE })} />
          </div>}
            <div className="bh-scroll" ref={scrollRef}>{!patch ? <Empty>该赛季尚未收录调整批次</Empty> : !grouped.size ? <Empty onReset={() => updateBatch({ query: "", limit: PAGE_SIZE })}>本次更新没有符合条件的调整记录</Empty>
              : <BatchOverview key={patch.id} grouped={grouped} type={batchView.type} limit={batchView.limit} familyOf={familyOf} onMore={() => { savePosition(); setBatchView(previous => ({ ...previous, limit: previous.limit + PAGE_SIZE })); }} />}</div>
          </section>
        </>}
      </div>
    </section>
  </div>, document.body);
}
