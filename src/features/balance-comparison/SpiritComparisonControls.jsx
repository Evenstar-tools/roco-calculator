import { useState } from "react";
import { BALANCE_STATS } from "./model.js";
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
  const custom = balance.customEnabled[side]?.[spirit.id] === true;
  const draft = balance.customStats[side]?.[spirit.id] ?? {};
  const placeholderStats = spirit.previewIdentity?.raceStatsPlaceholder === true;
  const hasDraft = BALANCE_STATS.some(({ key }) => draft[key] !== undefined && draft[key] !== spirit.raceStats?.[key]);
  return <div className="balance-controls">
    <label className="balance-controls__switch">
      <input type="checkbox" aria-label="自定义种族值" checked={custom}
        onChange={(event) => balance.setCustom(side, spirit.id, event.target.checked)} />
      <span>自定义种族值</span>
    </label>
    {!custom && hasDraft ? <button className="balance-restore" type="button"
      onClick={() => balance.setCustom(side, spirit.id, true)}>恢复上次手调值</button> : null}
    {custom && <>
      <div className="balance-stat-editor">
        {BALANCE_STATS.map(({ key, label }) => <RaceInput key={`${spirit.id}-${key}`}
          label={label} value={draft[key] ?? spirit.raceStats?.[key]}
          official={spirit.raceStats?.[key]}
          referenceLabel={placeholderStats ? "占位" : "官方"}
          onChange={(value) => balance.setStat(side, spirit.id, key, value)} />)}
      </div>
      <button className="balance-restore" type="button" onClick={() => balance.restore(side, spirit.id)}>{placeholderStats ? "恢复占位种族值" : "恢复官方种族值"}</button>
      <small className="balance-controls__note">{placeholderStats ? "六维100为测试占位；手调仅本页，不写入存档或分享。" : "仅本页伤害试算；存档、分享及其他工具使用官方种族值。"}</small>
    </>}
  </div>;
}

export function SpiritTrialChanges({ balance, spirit, side }) {
  if (!canTrial(spirit) || !balance.customEnabled[side]?.[spirit?.id]) return null;
  const draft = balance.customStats[side]?.[spirit.id] ?? {};
  const changed = BALANCE_STATS.filter(({ key }) => draft[key] !== undefined && draft[key] !== spirit.raceStats?.[key]);
  return <p className="balance-stat-changes" aria-label="自定义种族值摘要">
    <b>自定义</b>{changed.length ? changed.map(({ key, label }) =>
      <span key={key}>{label} {spirit.raceStats?.[key]} → {draft[key]}</span>) : <span>{spirit.previewIdentity?.raceStatsPlaceholder ? "沿用占位值" : "沿用官方值"}</span>}
  </p>;
}
