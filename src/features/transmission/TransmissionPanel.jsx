import { ArrowCounterClockwise } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { SkillPicker } from "../../components/SkillPicker.jsx";
import { SkillIcon } from "../../components/SkillIcon.jsx";
import { SpiritPicker } from "../../components/SpiritPicker.jsx";
import { chooseDefaultSkillIds, getSkillChoices } from "../../domain/skill-loadout.js";
import { prepareSpiritForView } from "../../data/search-index.js";
import { isSlotUsable, resolveAction, roundDriveTotal, slotDriveLayers, startRound, windStacksFromDrive } from "./engine.js";
import "./transmission.css";

const SELECTABLE_TRAITS = ["向心力", "翼轴", "贪心算法", "盲拧", "机械变式", "风速仪", "正位宝剑", "宝剑王牌"];
const STAGE_ORDER = { "一阶": 1, "二阶": 2, "三阶": 3, "首领": 4 };

const names = (slots) => slots.map((skill, i) => `${i + 1}. ${skill?.name ?? "未配置"}`).join(" → ");

export default function TransmissionPanel({ snapshot, sides, onClose }) {
  const spirits = useMemo(() => snapshot.spirits.map(prepareSpiritForView), [snapshot.spirits]);
  const [initial, setInitial] = useState([null, null, null, null]);
  const [slots, setSlots] = useState(initial);
  const [trait, setTrait] = useState("");
  const [round, setRound] = useState(0);
  const [phase, setPhase] = useState("start");
  const [history, setHistory] = useState([]);
  const [selected, setSelected] = useState(-1);
  const [branch, setBranch] = useState("power");
  const [issue, setIssue] = useState("");
  const [cooldown, setCooldown] = useState(null);
  const [layout, setLayout] = useState("grid");
  const [roundUndo, setRoundUndo] = useState([]);
  const [showInitial, setShowInitial] = useState(false);
  const [spirit, setSpirit] = useState(null);
  const [driveAccum, setDriveAccum] = useState(0);
  const relevantTraits = SELECTABLE_TRAITS.map((name) => snapshot.traits.find((entry) => entry.name === name)).filter(Boolean);
  const skillChoices = spirit ? getSkillChoices(snapshot, spirit.id).filter((entry) => entry.learnable) : snapshot.skills;
  const effectiveTrait = trait || snapshot.traits.find((entry) => spirit?.traitIds?.includes(entry.id))?.name || "";
  const unsupported = trait === "盲拧" ? "盲拧随机重排计算，请更换精灵或特性。" : slots.every(Boolean) ? startRound(slots, effectiveTrait).issue ?? "" : "";
  const actionResults = slots.map((skill, index) => skill ? resolveAction(slots, index, effectiveTrait, "power") : null);
  const shiftIndex = slots.findIndex((skill) => skill?.name === "轮班");
  const selectedIssue = selected >= 0 ? resolveAction(slots, selected, effectiveTrait, branch).issue ?? "" : "";
  const driveLayers = slotDriveLayers(slots, effectiveTrait);
  const windStacks = windStacksFromDrive(driveAccum);
  const dialog = useRef(null);
  const body = useRef(null);
  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key === "Escape" && !event.defaultPrevented) onClose();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);
  useEffect(() => {
    const trigger = document.activeElement, overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current.focus();
    return () => { document.body.style.overflow = overflow; trigger?.focus?.(); };
  }, []);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return undefined;
    const overlay = dialog.current.parentElement;
    let frame;
    let previousHeight;
    const update = () => {
      overlay.style.setProperty("--transmission-viewport-top", viewport.offsetTop + "px");
      overlay.style.setProperty("--transmission-viewport-height", viewport.height + "px");
      const active = document.activeElement;
      if (previousHeight !== viewport.height && body.current?.contains(active) && active.matches("input,select")) {
        active.scrollIntoView?.({ block: "nearest" });
      }
      previousHeight = viewport.height;
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(update); };
    update();
    viewport.addEventListener("resize", schedule);
    viewport.addEventListener("scroll", schedule);
    return () => { cancelAnimationFrame(frame); viewport.removeEventListener("resize", schedule); viewport.removeEventListener("scroll", schedule); };
  }, []);
  function reset(next = initial, nextTrait = trait) {
    setInitial(next); setSlots(next); setTrait(nextTrait); setRound(0); setPhase("start");
    setHistory([]); setSelected(-1); setIssue(""); setCooldown(null); setBranch("power");
    setRoundUndo([]); setDriveAccum(0);
  }
  function record(title, next, details = []) {
    setSlots(next); setHistory((previous) => [...previous, { title, slots: next, details }]);
  }
  function roundDetails(result) {
    return [
      ...result.sources.map((source) => `${source.name}：自身 ${source.own}${source.extra ? ` + ${trait} ${source.extra}` : ""}${source.fixed ? "；位置固定" : ` = ${source.total} 层`}`),
      ...result.steps.map((step, i) => `第 ${i + 1} 层：${names(step.slots)}`),
      ...(result.steps.length ? [] : ["没有传动，槽位不变。"]),
    ];
  }
  function saveRound() {
    setRoundUndo((previous) => [...previous, { slots, round, phase, history, selected, branch, cooldown, driveAccum }]);
  }
  function previousRound() {
    const previous = roundUndo.at(-1);
    if (!previous) return;
    setSlots(previous.slots); setRound(previous.round); setPhase(previous.phase); setHistory(previous.history);
    setSelected(previous.selected); setBranch(previous.branch); setCooldown(previous.cooldown);
    setDriveAccum(previous.driveAccum ?? 0);
    setIssue(""); setRoundUndo((entries) => entries.slice(0, -1));
  }
  function calculateRound() {
    if (unsupported) { setIssue(unsupported); return; }
    if (phase === "action" && selected >= 0) { setIssue("请先结算已选择的技能，或改为待机后继续计算。"); return; }
    const result = startRound(slots, effectiveTrait);
    if (result.issue) {
      setIssue(result.issue);
      return;
    }
    saveRound();
    const entries = [{ round: round + 1, title: `第 ${round + 1} 回合 · 开始`, slots: result.slots, details: roundDetails(result) }];
    if (round && phase === "action") entries.unshift({ title: `第 ${round} 回合 · 待机（连续推演）`, slots, details: [] });
    const gained = effectiveTrait === "风速仪" ? roundDriveTotal(result.sources) : 0;
    const nextDrive = driveAccum + gained;
    if (effectiveTrait === "风速仪" && gained > 0) {
      const last = entries[entries.length - 1];
      last.details = [...last.details, "累计传动 +" + gained + " → " + nextDrive + "（风起印记 ×" + windStacksFromDrive(nextDrive) + "）"];
    }
    setHistory((previous) => [...previous, ...entries]);
    setSlots(result.slots); setRound(round + 1); setPhase("action"); setSelected(-1); setBranch("power"); setIssue("");
    if (effectiveTrait === "风速仪") setDriveAccum(nextDrive);
    if (phase === "action") setCooldown(null);
  }
  function finish() {
    if (selected >= 0 && cooldown === slots[selected]?.id && ["有求必应", "一意孤行"].includes(trait)) { setIssue("该技能本回合冷却；请选择其他技能或待机。"); return; }
    const result = resolveAction(slots, selected, effectiveTrait, branch);
    if (result.issue) { setIssue(result.issue); return; }
    finishAction(result.slots, result);
  }
  function finishAction(next, result) {
    setCooldown(selected >= 0 ? slots[selected].id : null);

    if (effectiveTrait === "风速仪") {
      const driveRuns = (result.executions ?? []).filter((execution) => execution.branch === "drive").length;
      if (driveRuns > 0) setDriveAccum((previous) => previous + driveRuns);
    }
    record(`第 ${round} 回合 · ${result.label}`, next,
      (result.executions ?? []).map((execution, i) => `第 ${i + 1} 次效果：${execution.branch === "drive" ? "额外传动" : execution.branch === "power" ? "1号位加威" : "当前技能"}${i > 0 ? `（${trait}）` : ""}`));
    setPhase("start"); setIssue("");
  }
  function importSide(key) {
    const side = sides?.[key];
    const owner = spirits.find((entry) => entry.id === side?.spiritId) ?? null;
    setSpirit(owner);
    const next = (side?.skills?.four ?? [null, null, null, null]).map((entry) => snapshot.skills.find((skill) => skill.id === (typeof entry === "string" ? entry : entry?.skillId ?? entry?.id)) ?? null);
    reset(next, relevantTraits.find((entry) => owner?.traitIds?.includes(entry.id))?.name ?? "");
  }
  function selectSpirit(id) {
    const next = spirits.find((entry) => entry.id === id) ?? null;
    setSpirit(next);
    const ids = chooseDefaultSkillIds(snapshot, id);
    reset(Array.from({ length: 4 }, (_, index) => snapshot.skills.find((entry) => entry.id === ids[index]) ?? null), relevantTraits.find((entry) => next?.traitIds?.includes(entry.id))?.name ?? "");
  }
  function selectTrait(name) {
    const selectedTrait = relevantTraits.find((entry) => entry.name === name);
    if (!selectedTrait || name === "盲拧") return;
    if (spirit?.traitIds?.includes(selectedTrait.id)) { reset(initial, name); return; }
    const owner = spirits.filter((entry) => entry.traitIds?.includes(selectedTrait.id))
      .sort((left, right) => (STAGE_ORDER[right.stage] ?? 0) - (STAGE_ORDER[left.stage] ?? 0))[0];
    if (!owner) { setIssue("当前数据未找到该特性对应的精灵。"); return; }
    const ids = chooseDefaultSkillIds(snapshot, owner.id);
    setSpirit(owner);
    reset(Array.from({ length: 4 }, (_, index) => snapshot.skills.find((entry) => entry.id === ids[index]) ?? null), name);
  }
  function keydown(event) {
    if (event.key === "Escape") { event.stopPropagation(); onClose(); }
    if (event.key !== "Tab") return;
    const controls = [...dialog.current.querySelectorAll('button:not([disabled]),input,select,summary,a[href]')].filter((el) => el.getClientRects().length);
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) { event.preventDefault(); first?.focus(); }
  }
  return <div className="transmission-overlay">
    <section className="transmission-panel" role="dialog" aria-modal="true" aria-label="传动计算器" ref={dialog} tabIndex={-1} onKeyDown={keydown}>
      <header><div><h2>传动计算器</h2><p>配置四个技能，逐回合查看槽位与变化来源</p></div><button type="button" aria-label="关闭传动计算器" onClick={onClose}>关闭</button></header>
      <div className="transmission-body" data-layout={layout} ref={body}>
        <div className="transmission-spirit"><SpiritPicker label="推演" side="attack" spirits={spirits} selected={spirit} onSelect={selectSpirit} showFavorite={false} /><label className="transmission-trait">特性<select aria-label="传动特性" value={trait} onChange={(event) => selectTrait(event.target.value)}><option value="" disabled>{spirit ? "无相关特性" : "请选择特性"}</option>{relevantTraits.map((entry) => <option key={entry.id} value={entry.name} disabled={entry.name === "盲拧"}>{entry.name}{entry.name === "盲拧" ? "（不支持）" : entry.name === "机械变式" ? "（仅顺序）" : ""}</option>)}</select></label></div>
        {trait && <details className="transmission-trait-description"><summary>特性说明</summary><p className="transmission-muted">{snapshot.traits.find((entry) => entry.name === trait)?.description}</p></details>}
        <div className="transmission-layout" role="group" aria-label="技能布局"><span>技能布局</span><button type="button" aria-pressed={layout === "vertical"} onClick={() => setLayout("vertical")}>竖排</button><button type="button" aria-pressed={layout === "grid"} onClick={() => setLayout("grid")}>2×2</button></div>
        <div className="transmission-slot-heading">
          <h3 aria-live="polite">{round ? `第 ${round} 回合 · ${phase === "action" ? "传动后顺序" : "行动结束"}` : "初始配置"}</h3>
          <div className="transmission-initial-peek" onMouseEnter={() => setShowInitial(true)} onMouseLeave={() => setShowInitial(false)} onFocus={() => setShowInitial(true)} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setShowInitial(false); }}>
            <button type="button" aria-label="查看初始配置" aria-expanded={showInitial} aria-controls="transmission-initial-preview" onClick={() => setShowInitial(true)} onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); setShowInitial(false); } }}>初始配置</button>
            {showInitial && <ol id="transmission-initial-preview" className="transmission-initial-preview" aria-label="初始配置预览">{initial.map((skill, index) => <li key={index}><span>{index + 1}</span>{skill && <SkillIcon skill={skill} size={24} />}<strong>{skill?.name ?? "未配置"}</strong></li>)}</ol>}
          </div>
          <button type="button" aria-label="重置推演" onClick={() => reset()}>重置</button>
        </div>
        {round === 0 ? <div className="transmission-config">{initial.map((skill, index) => {
            const usable = isSlotUsable(effectiveTrait, index);
            return <div key={index} className={usable ? undefined : "is-unusable"} data-usable={usable ? "true" : "false"}>
              <label>{index + 1} 号位-{driveLayers[index]}{!usable ? " · 不可使用" : ""}</label>
              <SkillPicker readable menuBoundaryRef={body} ariaLabel={`初始${index + 1}号位技能`} skills={skillChoices} selected={skill} onSelect={(next) => reset(initial.map((item, i) => i === index ? snapshot.skills.find((entry) => entry.id === next) ?? null : item))} />
            </div>;
          })}</div> :
          <ol className="transmission-slots" aria-label="当前技能槽位">{slots.map((skill, index) => {
            const usable = isSlotUsable(effectiveTrait, index);
            return <li key={index} className={usable ? undefined : "is-unusable"} data-usable={usable ? "true" : "false"}>
              {skill ? <SkillIcon skill={skill} size={32} label /> : <span className="transmission-empty-icon" aria-hidden="true">—</span>}
              <div>
                <span className="transmission-slot-number">{index + 1} 号位-{driveLayers[index]}</span>
                <strong>{skill?.name ?? "未配置"}</strong>
                {!usable && skill ? <small className="transmission-slot-blocked">不可使用</small> : null}
              </div>
            </li>;
          })}</ol>}
        {unsupported && <p role="status" className="transmission-issue">不支持：{unsupported}</p>}
        {trait === "机械变式" && <p className="transmission-muted">仅支持技能顺序推演；能耗递减暂不支持。</p>}
        {trait === "风速仪" && <p className="transmission-wind" aria-live="polite">已累计传动数 {driveAccum}，风起印记 ×{windStacks}</p>}
        <p className="transmission-drive-by-slot" aria-live="polite">{driveLayers.map((layers, index) => (index + 1) + "号位-" + layers).join(" ")}</p>
        <div className="transmission-round-controls" role="group" aria-label="回合控制">
          <button className={round === 0 ? "transmission-primary" : ""} type="button" disabled={round > 0 || slots.some((skill) => !skill) || Boolean(unsupported)} onClick={calculateRound}>开始</button>
          <button className={round > 0 ? "transmission-primary" : ""} type="button" disabled={round === 0 || Boolean(unsupported)} onClick={calculateRound}>下一回合</button>
          <button className="transmission-round-undo" type="button" aria-label="回到上回合" title="回到上回合" disabled={!roundUndo.length} onClick={previousRound}><ArrowCounterClockwise size={20} aria-hidden="true" /></button>
        </div>
        <p className="transmission-muted">连续推演默认不使用技能；特殊行动可在下方设置。</p>
        {phase === "action" && shiftIndex >= 0 && <details className="transmission-action" open><summary>本回合轮班（可选）</summary><div className="transmission-toolbar">
            <select aria-label="本回合轮班" value={selected === shiftIndex ? "use" : "idle"} disabled={Boolean(unsupported)} onChange={(event) => {
              const use = event.target.value === "use";
              setSelected(use ? shiftIndex : -1);
              setBranch("power");
              setIssue("");
            }}>
              <option value="idle">待机 / 不使用轮班</option>
              <option value="use" disabled={Boolean(actionResults[shiftIndex]?.issue) || (cooldown === slots[shiftIndex]?.id && ["有求必应", "一意孤行"].includes(trait))}>
                使用 {shiftIndex + 1}号位 · 轮班{actionResults[shiftIndex]?.issue ? (actionResults[shiftIndex].issue.includes("当前槽位不可使用") ? "（槽位不可用）" : "（不可用）") : ""}{cooldown === slots[shiftIndex]?.id && ["有求必应", "一意孤行"].includes(trait) ? "（冷却）" : ""}
              </option>
            </select>
            {selected === shiftIndex && <select aria-label="轮班选择效果" value={branch} disabled={Boolean(unsupported)} onChange={(event) => setBranch(event.target.value)}>
              <option value="power">1号位加威（仅顺序）</option>
              <option value="drive">额外传动</option>
            </select>}
            <button className="transmission-primary" type="button" disabled={Boolean(unsupported) || Boolean(selectedIssue)} onClick={finish}>结算行动</button>
        </div></details>}
        {issue && <p role="alert" className="transmission-issue">{issue}</p>}
        {selectedIssue && <p role="status" className="transmission-issue">不支持：{selectedIssue}</p>}

        <details className="transmission-records"><summary>逐步记录 · {history.length} 条</summary>
        {!history.length && <p className="transmission-muted">开始回合后，这里会记录每层传动及行动后的顺序。</p>}
        <ol className="transmission-history">{history.map((item, i) => <li key={i}><strong>{item.title}</strong><p>{names(item.slots)}</p>{item.details.length > 0 && <details><summary>查看变化来源</summary>{item.details.map((line, j) => <p key={j}>{line}</p>)}</details>}</li>)}</ol></details>
        <details className="transmission-import"><summary>载入已有配置</summary><div className="transmission-toolbar"><button type="button" onClick={() => importSide("attacker")}>载入攻击方技能</button><button type="button" onClick={() => importSide("defender")}>载入防御方技能</button></div></details>
      </div>
    </section>
  </div>;
}
