import { damagePresentation, DamageSegments } from "../../components/damagePresentation.jsx";

function issueText(issue) {
  return typeof issue === "string" ? issue : issue?.message ?? issue?.reason ?? null;
}

function resultIssue(result) {
  if (!result) return "尚未得到两侧计算结果";
  if (result.status && result.status !== "exact") return result.reason ?? "该规则待核验";
  const presentation = damagePresentation(result);
  if (!Number.isFinite(presentation.damage) && !result.statusOnly) {
    return result.reason ?? "伤害条件尚未完整";
  }
  return null;
}

function actualDamage(result, presentation) {
  return Number.isFinite(presentation.damage) ? presentation.damage : result.statusOnly ? 0 : null;
}

function signed(value, digits = 0) {
  const normalized = Number(value.toFixed(digits));
  return `${normalized > 0 ? "+" : ""}${normalized.toFixed(digits)}`;
}

function relativeChange(before, after) {
  if (before === 0) return after === 0 ? "无变化" : "新增伤害";
  return before === after ? "无变化" : `${signed((after - before) / before * 100, 1)}%`;
}

/** Compact supplementary damage text. Freeze thresholds are never added to HP damage. */
export function ComparisonDamage({ before, after, issue }) {
  const reason = issueText(issue) ?? resultIssue(before) ?? resultIssue(after);
  if (reason) return <span className="balance-damage balance-damage--unavailable" title={reason}>
    不可对比<span className="balance-damage__reason"> · {reason}</span>
  </span>;
  const beforeDamage = actualDamage(before, damagePresentation(before));
  const afterDamage = actualDamage(after, damagePresentation(after));
  return <span className="balance-damage" aria-label={`更新前 ${beforeDamage} 伤害，更新后 ${afterDamage} 伤害，${relativeChange(beforeDamage, afterDamage)}`}>
    <span className="balance-damage__values">{beforeDamage}<span aria-hidden="true"> → </span><strong>{afterDamage}</strong></span>
    <span className="balance-damage__delta"> · {relativeChange(beforeDamage, afterDamage)}</span>
  </span>;
}

function resultView(view) {
  return view?.result ?? view;
}

function VersionResult({ label, view, result, presentation }) {
  const damage = actualDamage(result, presentation);
  const actualPercent = Number.isFinite(result.hpPercent)
    ? presentation.directPercent + presentation.statusPercent : null;
  const remainingHp = presentation.remainingHp ?? (Number.isFinite(view?.defenderHp)
    ? Math.max(0, view.defenderHp - damage) : null);
  return <div className="balance-summary__version">
    <p className="balance-summary__version-label">{label}</p>
    <p className="balance-summary__number"><strong>{damage}</strong><span>HP 伤害</span></p>
    {actualPercent !== null ? <p className="balance-summary__share">占最大生命 {actualPercent.toFixed(1)}%</p> : null}
    <div className="balance-summary__track" role="img" aria-label={presentation.detail ?? `实际伤害占最大生命 ${actualPercent?.toFixed(1) ?? "未知"}%`}>
      <DamageSegments presentation={presentation} />
    </div>
    {presentation.freezePercent > 0 ? <p className="balance-summary__freeze">冻结斩杀线 {presentation.freezePercent}% · 不额外扣血</p> : null}
    <p className="balance-summary__outcome">{presentation.lethal ? presentation.outcome ?? "可击倒"
      : remainingHp !== null ? `剩余 ${remainingHp} HP` : "剩余生命待确认"}</p>
  </div>;
}

function changeText(change) {
  if (typeof change === "string") return change;
  if (change.text) return change.text;
  const before = change.before ?? change.from;
  const after = change.after ?? change.to;
  const label = [change.entityName, change.label ?? change.field].filter(Boolean).join(" · ");
  const sourceName = change.source ?? (change.kind === "custom" ? "自定义" : null);
  const source = sourceName ? `（${sourceName}）` : "";
  if (before === undefined && after === undefined) return `${label}${source}`;
  return `${label}：${before ?? "—"} → ${after ?? "—"}${source}`;
}

/** The comparison is supplementary to the existing result and uses its settled presentation. */
export function ComparisonSummary({ comparison }) {
  if (!comparison?.active) return null;
  const beforeView = resultView(comparison.beforeView);
  const afterView = resultView(comparison.afterView);
  const before = beforeView?.selectedResult;
  const after = afterView?.selectedResult;
  const reason = issueText(comparison.issue) ?? resultIssue(before) ?? resultIssue(after);
  const beforeLabel = comparison.beforeLabel ?? "更新前";
  const afterLabel = comparison.afterLabel ?? "更新后";
  if (reason) return <section aria-label="更新前后对比" className="balance-summary balance-summary--unavailable">
    <strong>当前不可对比</strong><p>{reason}</p>
    <small>{beforeLabel} → {afterLabel}</small>
  </section>;
  const beforePresentation = damagePresentation(before);
  const afterPresentation = damagePresentation(after);
  const beforeDamage = actualDamage(before, beforePresentation);
  const afterDamage = actualDamage(after, afterPresentation);
  const delta = afterDamage - beforeDamage;
  const hasShare = Number.isFinite(before.hpPercent) && Number.isFinite(after.hpPercent);
  const shareDelta = afterPresentation.directPercent + afterPresentation.statusPercent
    - beforePresentation.directPercent - beforePresentation.statusPercent;
  const changes = comparison.changes ?? [];
  return <section aria-label="更新前后对比" className="balance-summary">
    <div className="balance-summary__versions">
      <VersionResult label={beforeLabel} view={beforeView} result={before} presentation={beforePresentation} />
      <VersionResult label={afterLabel} view={afterView} result={after} presentation={afterPresentation} />
    </div>
    <div className="balance-summary__delta" data-direction={delta > 0 ? "increase" : delta < 0 ? "decrease" : "unchanged"}>
      <strong>{delta === 0 ? "伤害无变化" : `伤害${delta > 0 ? "增加" : "减少"} ${Math.abs(delta)} HP`}</strong>
      <span>{relativeChange(beforeDamage, afterDamage)}</span>
      {hasShare ? <small>生命占比 {signed(shareDelta, 1)} 个百分点</small> : null}
    </div>
    {changes.length > 0 ? <details className="balance-summary__changes">
      <summary>本局改动 · {changes.length} 项</summary>
      {comparison.patch ? <p>只回放本补丁已记录的改动，其余沿用当前规则。</p> : null}
      <ul>{changes.map((change, index) => <li key={change.id ?? `${change.entityId ?? "change"}-${index}`}>{changeText(change)}</li>)}</ul>
    </details> : null}
  </section>;
}

export function ComparisonStatus({ comparison }) {
  if (!comparison?.active) return null;
  return <div className="balance-active-bar" aria-label="对比版本">
    <strong>{comparison.patch ? "本期改动对比" : "种族值试算"}</strong>
    {comparison.patch ? <span>{comparison.patch.date} · {comparison.patch.label}</span> : null}
    <span>{comparison.beforeLabel ?? "更新前"} → {comparison.afterLabel ?? "更新后"}</span>
    {issueText(comparison.issue) ? <span className="balance-active-bar__issue">不可对比</span> : null}
  </div>;
}
