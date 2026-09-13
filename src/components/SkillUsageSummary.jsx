import { describeSkillUsage, skillUsageDisplay } from "../domain/skill-presentation.js";

export function SkillUsageSummary({ result, nextHint }) {
  const summary = describeSkillUsage(result);
  const usage = result?.usageSummary;
  nextHint ??= result?.usageSummary?.nextHint;
  if (!summary && !nextHint) return null;
  const display = skillUsageDisplay(usage, nextHint);
  if (!display.status && !display.next && !display.recorded.length) return null;
  return (
    <div className="skill-usage" onClick={(event) => event.stopPropagation()}>
      {display.status ? <p className="skill-usage__main" aria-label={usage?.count > 0 ? `${usage.historyIncomplete ? "已记录" : "已使用"} ${usage.count} 次` : undefined}>{display.status}</p> : null}
      {display.next ? <p className="skill-usage__next" title={display.next}>{display.next}</p> : null}
      {display.recorded.length ? <p className="skill-usage__notice">仅记录：{display.recorded.join(" · ")}（未参与结算）</p> : null}
    </div>
  );
}

export function UsageCountActions({ input, value, onChange }) {
  if ((input.contextKey ?? input.key) !== "skillUseCount") return null;
  const count = Number(value ?? input.defaultValue ?? 0);
  const minimum = input.min ?? 0;
  const maximum = input.max ?? Infinity;
  return (
    <span className="usage-count-actions" onClick={(event) => event.stopPropagation()}>
      <button type="button" aria-label={`${input.label}减少`} disabled={count <= minimum} onClick={() => onChange(Math.max(minimum, count - 1))}>−</button>
      <button type="button" aria-label={`${input.label}增加`} disabled={count >= maximum} onClick={() => onChange(Math.min(maximum, count + 1))}>＋</button>
      <button type="button" aria-label={`${input.label}重置`} disabled={count === minimum} onClick={() => onChange(minimum)}>重置</button>
    </span>
  );
}
