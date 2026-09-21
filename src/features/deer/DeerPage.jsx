import { Fragment, useDeferredValue, useEffect, useMemo, useState } from "react";
import { ArrowLeft, CaretDown, CaretRight, Minus, Plus, SlidersHorizontal } from "@phosphor-icons/react";
import { RepeatLevelButton } from "../../components/NatureStatsStep.jsx";
import { withCalculatorExtras } from "../../data/snapshot-extras.js";
import { SpiritPicker } from "../../components/SpiritPicker.jsx";
import { AppHeader } from "../../components/AppHeader.jsx";
import { readThemeSetting, writeThemeSetting } from "../../state/display-settings.js";
import { QuickNaturePicker } from "../../components/QuickNaturePicker.jsx";
import { QuickIvPicker } from "../../components/QuickIvPicker.jsx";
import { NatureSelect } from "../../components/NatureSelect.jsx";
import { NatureEffect } from "../../components/NatureEffect.jsx";
import { StatTile } from "../../components/StatTile.jsx";
import { SkillIcon } from "../../components/SkillIcon.jsx";
import { ElementIcon } from "../../components/ElementIcon.jsx";
import { DraftNumberInput, TraitInputs } from "../../components/SingleSkillEditor.jsx";
import { MoonMemoryTraitEditor } from "../../components/MoonMemoryTraitEditor.jsx";
import { getTraitView, stageMultiplier } from "../../domain/calculator-view-model.js";
import { getNature, QUICK_STATS, STAT_LABELS } from "../../domain/natures.js";
import { hasCompleteRaceStats } from "../../domain/stat.js";
import { chooseDefaultSkillIds } from "../../domain/skill-loadout.js";
import { spiritConfigsRepository } from "../../state/spirit-configs.js";
import { canonicalTraitControlKey, materializeTraitContext } from "../../state/trait-values.js";
import { DEER_NAMES, DEFENSE_TEMPLATES, applyDeerPreset, calculateDeerRows, createDeerSetup, getDeerDefenseLimitations, hasDeerDefenseTrait, panelFor } from "./deer-model.js";
import "./deer.css";

function DeerHeader({ onReturn }) {
  useEffect(() => { document.documentElement.dataset.theme = readThemeSetting(); }, []);
  return <AppHeader pageTitle="电鹿斩杀线" toolAction={<a className="deer-back" href="/" onClick={onReturn}><ArrowLeft aria-hidden="true" size={15} weight="bold" />返回主站</a>} onThemeChange={(theme) => {
    document.documentElement.dataset.theme = writeThemeSetting(undefined, theme);
  }} />;
}

function NumberField({ label, value, onChange, min = 0, max = 100, suffix = "", step = 1, integer = false }) {
  return <label className="deer-number"><span>{label}</span><DraftNumberInput ariaLabel={label} value={value} min={min} max={max} step={step} onCommit={(next) => onChange(integer ? Math.trunc(next) : next)} />{suffix && <span>{suffix}</span>}</label>;
}

function SideConfiguration({ snapshot, setup, sideKey, presets, onSide, onSetup, onSelect, onDefenseLevel, children }) {
  const [expanded, setExpanded] = useState(false);
  const side = setup.state.sides[sideKey];
  const attack = sideKey === "attacker";
  const defenseStage = setup.state.directions.forward.overrides.defenseLevelStage ?? 0;
  const defensePercent = Math.round((stageMultiplier(defenseStage) - 1) * 100);
  const label = attack ? "攻击方" : "防御方";
  const spirit = snapshot.spirits.find((entry) => entry.id === side.spiritId);
  const panels = spirit ? panelFor(snapshot, side) : null;
  const options = useMemo(() => snapshot.spirits.filter((entry) => hasCompleteRaceStats(entry.raceStats) && (!attack || DEER_NAMES.includes(entry.fullName))).map((entry) => ({ ...entry, assetUrl: entry.asset?.localUrl })), [snapshot, attack]);
  const selected = options.find((entry) => entry.id === spirit?.id);
  const setIv = (stat, value) => onSide({ displayIvs: { ...side.displayIvs, [stat]: value } });
  function selectPreset(id) {
    if (id === "custom") return;
    const preset = id === "saved" ? presets[side.spiritId] : attack
      ? { nature: "cheerful", displayIvs: { hp: 60, physicalAttack: 60, speed: 60, magicalAttack: 0, physicalDefense: 0, magicalDefense: 0 } }
      : DEFENSE_TEMPLATES.find((entry) => entry.id === id);
    if (!preset) return;
    const next = applyDeerPreset(side, preset);
    onSide(id === "saved" ? next : { nature: next.nature, displayIvs: next.displayIvs }, false);
    onSetup(attack ? { attackPreset: id } : { defenseTemplate: id });
  }
  const presetId = attack ? setup.attackPreset : setup.defenseTemplate;
  const defenseTemplates = DEFENSE_TEMPLATES.map((template) => template.id === "none" && presets[side.spiritId] ? { id: "saved", label: "精灵预设" } : template);
  const effectControl = attack && spirit ? getTraitView(snapshot, spirit, "attacker").inputs.find((input) => input.contextKey === "attackerTraitEffect") : null;
  const stackControl = attack && spirit ? getTraitView(snapshot, spirit, "attacker").inputs.find((input) => input.contextKey === "attackerTraitStacks") : null;
  const stackMax = Number.isFinite(stackControl?.max) ? stackControl.max : null;
  const effectValue = effectControl ? setup.state.directions.forward.context[effectControl.id] ?? materializeTraitContext(side.traitValues, snapshot, spirit.id, "attacker")[effectControl.id] ?? effectControl.defaultValue : 0;
  if (!spirit) return <section className="deer-side deer-side--defender" aria-label="防御方配置"><div className="deer-side-heading"><span>防御方</span></div><SpiritPicker label={label} side={sideKey} spirits={options} selected={null} onSelect={onSelect} showFavorite={false} /><p className="deer-muted">请选择防御方，当前未代入默认对手。</p></section>;
  return <section className={`deer-side deer-side--${sideKey}`} aria-label={`${label}配置`}>
    <div className="deer-side-heading"><span>{label}</span><button type="button" className="deer-link" onClick={() => setExpanded(!expanded)} aria-expanded={expanded}>{expanded ? "收起配置" : "手调配置"}<CaretDown size={12} /></button></div>
    <div className="deer-identity"><img src={spirit.asset?.localUrl} alt={spirit.fullName} width="54" height="54" /><div className="deer-picker"><SpiritPicker label={label} side={sideKey} spirits={options} selected={selected} onSelect={onSelect} showFavorite={false} /></div>
      {attack && <select aria-label="电鹿配置预设" value={presetId} onChange={(event) => selectPreset(event.target.value)}><option value="standard">常用配置</option>{presets[side.spiritId] && <option value="saved">已存预设</option>}<option value="current" disabled>当前配置</option><option value="custom" disabled>自定义</option></select>}
    </div>
    {attack ? <><QuickNaturePicker side={sideKey} label={label} displayIvs={side.displayIvs} value={side.nature} onChange={(nature) => onSide({ nature })} /><QuickIvPicker side={sideKey} label={label} values={side.displayIvs} onChange={setIv} /></> : <>
      <div className="deer-templates" role="group" aria-label="防守模板">{defenseTemplates.map((template) => <button key={template.id} type="button" aria-pressed={presetId === template.id} onClick={() => selectPreset(template.id)}>{template.label}</button>)}</div>
      <div className="deer-config-summary"><span>{presetId === "current" ? "当前配置 · " : presetId === "custom" ? "自定义 · " : ""}{getNature(side.nature).name} · 生命{side.displayIvs.hp} / 物防{side.displayIvs.physicalDefense} / 魔防{side.displayIvs.magicalDefense}</span></div>
    </>}
    <div className={`deer-side-bottom${attack ? "" : " deer-side-bottom--defender"}`}>{attack && <><div className="deer-stacks"><span>特性层数</span><button type="button" aria-label="特性层数减一" disabled={setup.stacks === 0} onClick={() => onSetup({ stacks: setup.stacks - 1 })}>−</button><DraftNumberInput ariaLabel="特性层数" min={0} max={Number.isFinite(stackMax) ? stackMax : undefined} step={1} value={setup.stacks} onCommit={(next) => onSetup({ stacks: Math.trunc(next) })} /><button type="button" aria-label="特性层数加一" disabled={Number.isFinite(stackMax) && setup.stacks >= stackMax} onClick={() => onSetup({ stacks: setup.stacks + 1 })}>＋</button></div><small className="deer-stack-help">{spirit.stage} · {spirit.traitName} · {side.ignoreTraits ? "特性已关闭" : `每层双攻＋${effectValue}%`}</small></>}
      {!attack && <NumberField label="目标HP" value={setup.defenderHp} min={1} suffix="%" onChange={(value) => onSetup({ defenderHp: value })} />}
      {!attack && <div className="level-control" role="group" aria-label="防御能力等级"><span>防御能力等级</span><div>
      <RepeatLevelButton ariaLabel="防御方等级减一" delta={-1} disabled={defenseStage <= -99} onChange={onDefenseLevel} value={defenseStage}><Minus aria-hidden="true" size={14} /></RepeatLevelButton>
      <span className="deer-level-value">{defenseStage}层 · {defensePercent > 0 ? "+" : ""}{defensePercent}%</span>
      <RepeatLevelButton ariaLabel="防御方等级加一" delta={1} disabled={defenseStage >= 99} onChange={onDefenseLevel} value={defenseStage}><Plus aria-hidden="true" size={14} /></RepeatLevelButton>
      </div></div>}
    </div>
    {children}
    {expanded && <div className="deer-manual"><NatureSelect ariaLabel={`${label}性格`} value={side.nature} onChange={(nature) => onSide({ nature })} /><NatureEffect natureId={side.nature} /><div className="stat-grid">{QUICK_STATS.map((stat) => <StatTile key={stat} label={STAT_LABELS[stat]} natureId={side.nature} stat={stat} race={spirit.raceStats[stat]} panel={panels[stat]} displayIv={side.displayIvs[stat]} onIvChange={(value) => setIv(stat, value)} accent={attack ? "attack" : "defense"} />)}</div><p className="deer-muted">仅修改本页，不覆盖计算器收藏配置。</p></div>}
  </section>;
}

function DefenderTraitConfiguration({ snapshot, spirit, side, trait, context, onTrait, onSide }) {
  const limitations = getDeerDefenseLimitations(snapshot, side);
  return <section className="deer-defense-trait" aria-label="防守特性设置">
    <div className="deer-defense-trait-heading">
      <label className="deer-check"><input aria-label="防守特性" type="checkbox" checked={!side.ignoreTraits} onChange={(event) => onSide({ ignoreTraits: !event.target.checked })} /><strong>{trait?.name ?? "防守特性"}</strong></label>
      <span aria-live="polite">{side.ignoreTraits ? "已关闭 · 参数保留，不参与计算" : limitations.length ? "保命效果未计入 · 斩杀待确认" : "已启用 · 按当前条件计算"}</span>
    </div>
    <p className="deer-defense-trait-description">{trait?.description ?? "暂无特性说明，请核对计算提示。"}</p>
    <fieldset disabled={side.ignoreTraits} aria-label="防守特性参数">
      <div className="deer-fields"><TraitInputs context={context} inputs={trait?.inputs ?? []} onChange={onTrait} /></div>
      <MoonMemoryTraitEditor snapshot={snapshot} spirit={spirit} side={side} sideKey="defender"
        onAdd={(id) => onSide({ acquiredTraitIds: [...side.acquiredTraitIds, id] })}
        onRemove={(id) => onSide({ acquiredTraitIds: side.acquiredTraitIds.filter((entry) => entry !== id) })}
        onValueChange={(traitId, key, value) => onSide({ acquiredTraitValues: { ...side.acquiredTraitValues, [traitId]: { ...side.acquiredTraitValues[traitId], [key]: value } } })} />
    </fieldset>
  </section>;
}

function minimumText(value, ready) { return value === null ? (ready ? "查询范围内未达" : "待确认") : `${value} 层`; }
function bestRow(rows, field) { return rows.filter((row) => row[field] !== null).sort((a, b) => a[field] - b[field])[0]; }

export function DeerWorkspace({ snapshot, presets = {}, initialState = null, onReturn }) {
  const [setup, setSetup] = useState(() => {
    const next = { ...createDeerSetup(snapshot, initialState), showFollowup: false };
    if (!initialState) {
      const side = next.state.sides.defender;
      const preset = presets[side.spiritId];
      next.state.sides.defender = applyDeerPreset(side, preset ?? DEFENSE_TEMPLATES.find((entry) => entry.id === "hp"));
      next.defenseTemplate = preset ? "saved" : "hp";
    }
    return next;
  });
  const [expandedRow, setExpandedRow] = useState(null);
  const [appliedMinimum, setAppliedMinimum] = useState(null);
  const [conditionsOpen, setConditionsOpen] = useState(false);
  const deferredSetup = useDeferredValue(setup);
  const rows = useMemo(() => deferredSetup.state.sides.defender.spiritId ? calculateDeerRows(snapshot, deferredSetup) : [], [snapshot, deferredSetup]);
  const visibleRows = setup.showFollowup ? rows : rows.filter((row) => row.id !== "stone-counter").map((row) => row.id === "stone" ? { ...row, label: "裂石", note: "应对状态不改变本击伤害；勾选显示先发补刀后，区分普通与应对降防的后续伤害。" } : row);
  const updating = deferredSetup !== setup;
  const speed = rows[0]?.current.speed;
  const best = bestRow(visibleRows, "minimum");
  const activeMinimum = appliedMinimum?.setup === setup ? appliedMinimum : null;
  const combo = bestRow(rows, "comboMinimum");
  const warnings = [...new Set(rows.flatMap((row) => row.current.first.warnings ?? []))].filter((warning) => typeof warning === "string");
  const defender = snapshot.spirits.find((spirit) => spirit.id === setup.state.sides.defender.spiritId);
  const defenseTrait = defender ? getTraitView(snapshot, defender, "defender") : null;
  const defenseContext = { ...(defender ? materializeTraitContext(setup.state.sides.defender.traitValues, snapshot, defender.id, "defender") : {}), ...setup.state.directions.forward.context };
  const stats = defender ? panelFor(snapshot, setup.state.sides.defender) : null;
  const attackerMaxHp = panelFor(snapshot, setup.state.sides.attacker).hp;
  const darkBetActive = Math.max(1, Math.round(attackerMaxHp * setup.attackerHp / 100)) < attackerMaxHp / 2;
  const defenseLimitations = defender ? getDeerDefenseLimitations(snapshot, setup.state.sides.defender) : [];
  const conditions = [
    setup.attackerHp !== 100 && `自身HP ${Number(setup.attackerHp.toFixed(2))}%`,
    setup.weather !== "none" && `${{ rain: "雨天", thunder: "雷暴", sandstorm: "沙尘暴", blizzard: "暴风雪" }[setup.weather]}（不计天气伤害）`,
    setup.state.directions.forward.overrides.attackLevelStage && `攻击等级 ${setup.state.directions.forward.overrides.attackLevelStage}`,
    setup.state.directions.forward.overrides.defenseLevelStage && `防御等级 ${setup.state.directions.forward.overrides.defenseLevelStage}`,
    setup.reduction > 0 && `减伤 ${Number(setup.reduction.toFixed(2))}%`,
    setup.starfall > 0 && `星陨 ${setup.starfall}层`,
    setup.freeze > 0 && `冻结 ${setup.freeze}层${defender?.types.includes("冰") ? "（冰系免疫）" : ""}`,
  ].filter(Boolean);
  const setOptions = (patch) => setSetup((current) => ({ ...current, ...patch }));
  function fillMinimum() {
    if (updating || !best) return;
    const next = { ...setup, stacks: best.minimum };
    setSetup(next);
    setAppliedMinimum({ setup: next, id: best.id, label: best.label, condition: best.condition });
  }
  function setSide(sideKey, patch, manual = true) {
    setSetup((current) => {
      const directions = Object.hasOwn(patch, "traitValues")
        ? Object.fromEntries(Object.entries(current.state.directions).map(([key, direction]) => {
          const role = (key === "forward") === (sideKey === "attacker") ? "attackerTrait" : "defenderTrait";
          return [key, { ...direction, context: Object.fromEntries(Object.entries(direction.context).filter(([id]) => !id.startsWith(role))) }];
        })) : current.state.directions;
      return { ...current, ...(manual ? (sideKey === "attacker" ? { attackPreset: "custom" } : { defenseTemplate: "custom" }) : {}), state: { ...current.state, directions, sides: { ...current.state.sides, [sideKey]: { ...current.state.sides[sideKey], ...patch } } } };
    });
  }
  function selectSpirit(sideKey, id) {
    setSetup((current) => {
      const next = structuredClone(current);
      const four = chooseDefaultSkillIds(snapshot, id);
      Object.assign(next.state.sides[sideKey], { spiritId: id, traitValues: {}, acquiredTraitIds: [], acquiredTraitValues: {}, skills: { four, single: four[0] ?? null } });
      for (const [key, direction] of Object.entries(next.state.directions)) {
        const role = (key === "forward") === (sideKey === "attacker") ? "attackerTrait" : "defenderTrait";
        direction.context = Object.fromEntries(Object.entries(direction.context).filter(([id]) => !id.startsWith(role)));
      }
      if (sideKey === "attacker" && next.attackPreset === "saved") next.attackPreset = "custom";
      if (sideKey === "defender") {
        const preset = presets[id];
        next.state.sides.defender = applyDeerPreset(next.state.sides.defender, preset ?? DEFENSE_TEMPLATES.find((entry) => entry.id === "hp"));
        next.defenseTemplate = preset ? "saved" : "hp";
      }
      return next;
    });
  }
  function setOverride(key, value) {
    setSetup((current) => ({ ...current, state: { ...current.state, directions: { ...current.state.directions, forward: { ...current.state.directions.forward, overrides: { ...current.state.directions.forward.overrides, [key]: value } } } } }));
  }
  function setTrait(id, value) {
    const control = defenseTrait.inputs.find((input) => input.id === id);
    if (!control) return;
    setSetup((current) => ({ ...current, state: { ...current.state,
      sides: { ...current.state.sides, defender: { ...current.state.sides.defender, traitValues: { ...current.state.sides.defender.traitValues, [canonicalTraitControlKey(control)]: value } } },
      directions: { ...current.state.directions, forward: { ...current.state.directions.forward, context: { ...current.state.directions.forward.context, [id]: value } } },
    } }));
  }
  return <><DeerHeader onReturn={onReturn} /><main className="deer-page">
    <div className="deer-scenery" aria-hidden="true"><div className="deer-scenery-shards" /><img className="deer-scenery-portrait" src="/assets/deer/bopulu-background-v2.webp" alt="" width="1024" height="1536" decoding="async" draggable={false} /><div className="deer-scenery-spark deer-scenery-spark--right" /><div className="deer-scenery-spark deer-scenery-spark--left" /></div>
    <div className="deer-header"><span>共享计算内核 · 60级</span></div>
    <div className="deer-configs">{["attacker", "defender"].map((sideKey) => <div className="deer-config-column" key={sideKey}><SideConfiguration snapshot={snapshot} setup={setup} sideKey={sideKey} presets={presets} onSide={(patch, manual) => setSide(sideKey, patch, manual)} onSetup={setOptions} onSelect={(id) => selectSpirit(sideKey, id)} onDefenseLevel={(value) => setOverride("defenseLevelStage", value)}>
      {sideKey === "defender" && hasDeerDefenseTrait(snapshot, setup.state.sides.defender) && <DefenderTraitConfiguration snapshot={snapshot} spirit={defender} side={setup.state.sides.defender} trait={defenseTrait} context={defenseContext} onTrait={setTrait} onSide={(patch) => setSide("defender", patch, false)} />}
    </SideConfiguration>{sideKey === "attacker" && defender && speed && <section className="deer-speed" aria-label="速度对比" aria-live="polite" aria-busy={updating}>
      <span>速度对比</span><strong data-state={speed.state}>{updating ? "正在复算…" : speed.label}</strong>
      {speed.attacker !== null && <span className="deer-speed-values">我方 {speed.attacker} / 对方 {speed.defender}</span>}
      <small>同先制度，仅比较当前速度</small>
    </section>}</div>)}</div>
    {defender && <><section className="deer-conditions"><button type="button" aria-expanded={conditionsOpen} onClick={() => setConditionsOpen(!conditionsOpen)}><SlidersHorizontal size={16} /><strong>战斗条件</strong><span data-active={conditions.length > 0}>{conditions.length ? conditions.join(" · ") : "默认条件 · 天气 / 血量 / 能力 / 异常 / 减伤"}</span><CaretDown size={14} /></button>
      {conditionsOpen && <div className="deer-conditions-body"><div className="deer-fields">
        <NumberField label="自身HP" value={setup.attackerHp} min={1} suffix="%" onChange={(attackerHp) => setOptions({ attackerHp })} />
        <label className="deer-number">天气<select aria-label="天气" value={setup.weather} onChange={(event) => setOptions({ weather: event.target.value })}><option value="none">无</option><option value="rain">雨天</option><option value="thunder">雷暴</option><option value="sandstorm">沙尘暴</option><option value="blizzard">暴风雪</option></select></label>
        <NumberField label="攻击能力等级" integer min={-99} max={99} value={setup.state.directions.forward.overrides.attackLevelStage ?? 0} onChange={(value) => setOverride("attackLevelStage", value)} />
        <NumberField label="防守技能减伤" suffix="%" value={setup.reduction} onChange={(reduction) => setOptions({ reduction })} />
        <NumberField label="敌方星陨" integer max={99} value={setup.starfall} onChange={(starfall) => setOptions({ starfall })} />
        <NumberField label="敌方冻结" integer max={20} value={setup.freeze} onChange={(freeze) => setOptions({ freeze })} />
      </div><p className="deer-muted">天气仅用于内核已支持的技能／特性联动，不计天气本身的回合末伤害。</p><p className="deer-muted">能力每层10%；冻结每层占最大生命5%，冰系免疫。先发按第一击后的生命和裂石降防复算；其余防守特性触发条件沿用手调值，不推演对手行动。</p></div>}
    </section>
    {defenseLimitations.length > 0 && <p className="deer-warning" role="note">{defenseLimitations.join("、")}的保命效果尚未纳入本页。仅展示理论伤害，不提供确定斩杀层数或先发连招结论。</p>}
    {warnings.length > 0 && <p className="deer-warning" role="status">{warnings.join("；")}。以下为当前内核条件下的估算，请核对特性。</p>}
    <div className="deer-summary" aria-live="polite"><span>单招最低 <strong>{best ? `${best.minimum} 层` : rows.some((row) => !row.current.lethalKnown) ? "条件待确认" : "查询范围内未达"}</strong>{best?.label}{best?.condition && <small>{best.condition}</small>}<button className="deer-fill-minimum" type="button" disabled={updating || !best} onClick={fillMinimum} title="填入单招击倒的最低层数，不含先发补刀；额外条件不会自动开启">一键填层数</button></span>{setup.showFollowup && <span>接先发最低 <strong>{combo ? `${combo.comboMinimum} 层` : rows.some((row) => !row.current.lethalKnown) ? "条件待确认" : "查询范围内未达"}</strong>{combo?.label}{combo?.condition && <small>{combo.condition}</small>}</span>}</div>
    {activeMinimum && <p className="deer-fill-notice" role="status">已填入 {setup.stacks} 层 · {activeMinimum.label}{activeMinimum.condition ? `（${activeMinimum.condition}；条件未自动变更）` : ""}</p>}
    <section className="deer-results" aria-label="技能斩杀线" aria-busy={updating}><div className="deer-results-heading"><h2>技能斩杀线</h2><span className="deer-muted">{updating ? "正在复算…" : `目标生命 ${stats.hp} · 当前 ${setup.defenderHp}%`}</span><label className="deer-check"><input type="checkbox" checked={setup.showFollowup} onChange={(event) => { setOptions({ showFollowup: event.target.checked }); if (!event.target.checked && expandedRow === "stone-counter") setExpandedRow("stone"); }} />显示先发补刀</label></div>
      <div className="deer-table-scroll"><table className="deer-table"><thead><tr><th>技能 / 条件</th><th>属性</th><th>单招最低</th>{setup.showFollowup && <th>接先发最低</th>}<th>当前 {deferredSetup.stacks} 层伤害</th><th><span className="sr-only">详情</span></th></tr></thead><tbody>
        {visibleRows.map((row) => <Fragment key={row.id}><tr className={`${expandedRow === row.id ? "is-selected" : ""}${activeMinimum?.id === row.id ? " is-recommended" : ""}`} aria-selected={activeMinimum?.id === row.id || undefined}>
          <td><div className="deer-skill"><SkillIcon skill={row.skill} size={28} /><div><button type="button" className="deer-skill-name" aria-expanded={expandedRow === row.id} onClick={() => setExpandedRow(expandedRow === row.id ? null : row.id)}>{row.label}</button>{row.condition && <small className="deer-condition-tag">{row.condition}</small>}{row.id === "bet-dark" && <label className="deer-check deer-electric" title="勾选将自身HP设为49%，取消恢复100%；手动修改血量时同步状态"><input type="checkbox" checked={darkBetActive} onChange={(event) => setOptions({ attackerHp: event.target.checked ? 49 : 100 })} />触发暗特效</label>}{row.id === "discharge" && <label className="deer-check deer-electric"><input type="checkbox" checked={setup.dischargeElectrified === true} onChange={(event) => setOptions({ dischargeElectrified: event.target.checked })} />触发2层引电</label>}{row.id === "arc" && <label className="deer-electric"><span className="sr-only">普通电系技能</span><select aria-label="普通电系技能" value={setup.normalElectric} onChange={(event) => setOptions({ normalElectric: event.target.value })}><option>电弧</option><option>离子火花</option></select><small>同威力 · 不同能耗</small></label>}</div></div></td>
          <td><span className="deer-element"><ElementIcon type={row.skill.type} size={17} />{row.skill.type}</span></td>
          <td className="deer-threshold">{minimumText(row.minimum, row.current.lethalKnown)}</td>
          {setup.showFollowup && <td className="deer-threshold">{row.id === "first" ? "—" : minimumText(row.comboMinimum, row.current.lethalKnown)}</td>}
          <td><span className="deer-mobile-damage-label">当前 {deferredSetup.stacks} 层伤害</span><div className={`deer-damage ${row.current.lethal ? "is-lethal" : ""}`}><div><strong>{row.current.percent === null ? "待确认" : `${row.current.percent.toFixed(1)}%`}</strong><small>{row.current.damage === null ? row.current.first.reason : `${row.current.damage} ${row.current.defenseLimitations.length ? "理论伤害" : "伤害"}${row.current.lethal ? " · 可击倒" : ""}`}</small></div><div className="deer-bar"><i style={{ width: `${Math.min(100, row.current.percent ?? 0)}%` }} /><b title={`冻结占${row.current.freeze.thresholdPercent}%`} style={{ width: `${Math.min(100 - Math.min(100, row.current.percent ?? 0), row.current.freeze.thresholdPercent)}%` }} /></div></div>{row.current.electrified && <small className="deer-freeze-label">通电 {row.current.first.totalDamage ?? "—"} ＋ 引电 {row.current.electrified.damage}{row.current.electrified.immune ? "（免疫）" : ""}</small>}{setup.freeze > 0 && <small className="deer-freeze-label">蓝色：冻结 {row.current.freeze.thresholdPercent}%</small>}</td>
          <td><button type="button" className="deer-expand" aria-label={`查看${row.label}详情`} aria-expanded={expandedRow === row.id} onClick={() => setExpandedRow(expandedRow === row.id ? null : row.id)}>{expandedRow === row.id ? <CaretDown size={14} /> : <CaretRight size={14} />}</button></td>
        </tr>{expandedRow === row.id && <tr className="deer-detail"><td colSpan={setup.showFollowup ? 6 : 5}><p><strong>{row.label}</strong> · {row.skill.description}</p>{row.note && <p>{row.note}</p>}{row.current.electrified && <p>合计：通电 {row.current.first.totalDamage ?? "—"} ＋ 引电 {row.current.electrified.damage} ＝ {row.current.damage ?? "—"} HP。按凑齐2层引电触发一次计算，最大生命25% × 电系克制；电系免疫，不额外结算天气和其他异常状态。</p>}<p>实际威力 {row.current.first.staticPower ?? "—"} · 克制 ×{row.current.first.typeMultiplier ?? "—"} · 目标剩余 {row.current.remainingHp ?? "—"} HP{setup.freeze > 0 ? ` · 冻结占 ${row.current.freeze.thresholdPercent}%（${row.current.freeze.thresholdHp} HP）` : ""}</p>{row.current.followup && <p>本次 {row.current.damage} ＋ 先发 {row.current.followup.totalDamage} ＝ {row.current.comboDamage} 伤害 · {row.current.comboLethal ? "可击倒" : "未击倒"}</p>}{row.current.followupReason && <p>{row.current.followupReason}</p>}
          {row.current.first.warnings?.map((warning, index) => <p role="note" key={index}>{typeof warning === "string" ? warning : warning.message ?? JSON.stringify(warning)}</p>)}
          <div className="deer-layer-grid">{row.byStack.map((entry) => <div key={entry.stacks} data-lethal={entry.lethal}><strong>{entry.stacks} 层</strong><span>{entry.damage ?? "待定"} HP</span><small>{!entry.lethalKnown ? "待确认" : entry.lethal ? "单招击倒" : entry.comboLethal && setup.showFollowup ? "接先发击倒" : "未击倒"}</small></div>)}</div>
          <details><summary>查看当前层计算过程</summary>{row.current.first.formulaSteps?.map((step, index) => <p key={index}>{step.label}：{typeof step.value === "object" ? JSON.stringify(step.value) : step.value ?? step.after ?? "—"}</p>)}</details>
        </td></tr>}</Fragment>)}
      </tbody></table></div>
    </section></>}
    {!defender && <p className="deer-summary" role="status">请选择防御方后查看技能斩杀线。</p>}
    <footer className="deer-footer"><span>按特性层数查询 · 点击技能查看逐层伤害</span><span>先发为理论连续出招；通电可选计一次引电，其余不模拟对手行动与回合末伤害</span></footer>
  </main></>;
}

export default function DeerPage({ initialState = null, onReturn }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const previousTitle = document.title;
    document.title = "电鹿斩杀线 · 洛克计算器";
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch("/data/runtime.json", { signal: controller.signal });
        if (!response.ok) throw new Error(`精灵数据加载失败（${response.status}）`);
        const snapshot = withCalculatorExtras(await response.json());
        let presets = {};
        try {
          const response = await fetch("/data/presets/pvp-popular-configs.json", { signal: controller.signal });
          if (response.ok) presets = Object.fromEntries((await response.json()).entries.map((preset) => [preset.spiritId, preset]));
        } catch { /* 无网络时仍可使用四种模板。 */ }
        try { presets = { ...presets, ...spiritConfigsRepository().load(snapshot).configs }; } catch { /* 不可用的本地存储不阻断计算。 */ }
        if (!controller.signal.aborted) setData({ snapshot, presets });
      } catch (failure) { if (!controller.signal.aborted) setError(failure.message); }
    }
    load();
    return () => { controller.abort(); document.title = previousTitle; };
  }, []);
  if (!data) return <><DeerHeader onReturn={onReturn} /><main className="deer-page"><p role="status">{error || "正在加载电鹿斩杀线…"}</p>{error && <button type="button" onClick={() => window.location.reload()}>重新加载</button>}</main></>;
  return <DeerWorkspace {...data} initialState={initialState} onReturn={onReturn} />;
}
