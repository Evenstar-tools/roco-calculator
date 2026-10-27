import { useState } from "react";
import { BALANCE_STATS, raceStatsBeforePatch } from "./model.js";
import { hasCompleteRaceStats } from "../../domain/stat.js";

function canTrial(spirit) {
  return spirit?.calculationStatus !== "pending-race-stats" && hasCompleteRaceStats(spirit?.raceStats);
}

function RaceInput({ label, value, official, referenceLabel = "官方", onChange }) {
  const [draft, setDraft] = useState(null);
  const text = draft ?? String(value);
  const valid = text.trim() !== "" && Number.isSafeInteger(Number(text)) && Number(text) > 0;
  return <label className="balance-stat-editor__field">
    <span>{label}</span>
    <input aria-label={`试算${label}种族值`} aria-invalid={!valid || undefined}
      min="1" step="1" type="number" value={text}
      onChange={(event) => {
        const next = event.target.value;
        setDraft(next);
        if (next.trim() && Number.isSafeInteger(Number(next)) && Number(next) > 0) {
          onChange(Number(next));
        }
      }} onBlur={() => setDraft(null)} />
    <small>{referenceLabel} {official}</small>
    {!valid && <small role="status">请输入正整数，当前仍使用 {value}</small>}
  </label>;
}

export function SpiritComparisonControls({ balance, spirit, side }) {
  if (!canTrial(spirit)) return null;
  const appliedPatch = balance.appliedPatches?.[side]?.[spirit.id];
  const custom = balance.customEnabled[side]?.[spirit.id] === true && !appliedPatch;
  const draft = balance.customStats[side]?.[spirit.id] ?? {};
  const placeholderStats = spirit.previewIdentity?.raceStatsPlaceholder === true;
  const hasDraft = BALANCE_STATS.some(({ key }) => draft[key] !== undefined && draft[key] !== spirit.raceStats?.[key]);
  return <div className="balance-controls">
    <label className="balance-controls__switch">
      <input type="checkbox" aria-label="自定义种族值" checked={custom}
        onChange={(event) => balance.setCustom(side, spirit.id, event.target.checked)} />
      <span>自定义种族值</span>
    </label>
    {!custom && !appliedPatch && hasDraft ? <button className="balance-restore" type="button"
      onClick={() => balance.setCustom(side, spirit.id, true)}>恢复上次修改</button> : null}
    {custom && <>
      <div className="balance-stat-editor">
        {BALANCE_STATS.map(({ key, label }) => <RaceInput key={`${spirit.id}-${key}`}
          label={label} value={draft[key] ?? spirit.raceStats?.[key]}
          official={spirit.raceStats?.[key]}
          referenceLabel={placeholderStats ? "占位" : "官方"}
          onChange={(value) => balance.setStat(side, spirit.id, key, value)} />)}
      </div>
      <button className="balance-restore" type="button" onClick={() => balance.restore(side, spirit.id)}>恢复当前</button>
    </>}
    {(custom || appliedPatch) && <small className="balance-controls__note">仅本页试算，不保存或分享。</small>}
  </div>;
}

export function SpiritTrialChanges({ balance, spirit, side }) {
  if (!canTrial(spirit) || !balance.customEnabled[side]?.[spirit?.id]) return null;
  const draft = balance.customStats[side]?.[spirit.id] ?? {};
  const changed = BALANCE_STATS.filter(({ key }) => draft[key] !== undefined && draft[key] !== spirit.raceStats?.[key]);
  if (!changed.length) return null;
  return <p className="balance-stat-changes" aria-label="自定义种族值摘要"
    title={changed.map(({ key, label }) => `${label} ${spirit.raceStats?.[key]} → ${draft[key]}`).join(" · ")}>
    <b>{balance.appliedPatches?.[side]?.[spirit.id] ? "改动前" : "已修改"}</b>{changed.map(({ key, label }) =>
      <span key={key}>{label} {spirit.raceStats?.[key]} → {draft[key]}</span>)}
    <button className="balance-card-restore" type="button" onClick={() => balance.restore(side, spirit.id)}>恢复当前</button>
  </p>;
}

export function SpiritPreviousStatsAction({ balance, spirit, side, record }) {
  if (!canTrial(spirit)) return null;
  const before = raceStatsBeforePatch(spirit, record);
  if (!before) return null;
  const applied = balance.customEnabled[side]?.[spirit.id] &&
    balance.appliedPatches?.[side]?.[spirit.id] === (record.patch?.id ?? record);
  return <button className="balance-restore" type="button"
    onClick={() => applied ? balance.restore(side, spirit.id) : balance.applyBefore(side, spirit.id, record, before)}>
    {applied ? "恢复当前" : "应用改动前"}
  </button>;
}
