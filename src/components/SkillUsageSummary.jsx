import { describeSkillUsage, skillUsageDetails } from "../domain/skill-presentation.js";

export function SkillUsageSummary({ result, nextHint }) {
  const summary = describeSkillUsage(result);
  nextHint ??= result?.usageSummary?.nextHint;
  if (!summary && !nextHint) return null;
  return (
    <div className="skill-usage" onClick={(event) => event.stopPropagation()}>
      {summary ? <strong className="skill-usage__main">{summary}</strong> : null}
      {nextHint ? <p className="skill-usage__next" title={nextHint}>{nextHint}</p> : null}
      {summary ? <details className="skill-usage__details">
        <summary>查看增益明细</summary>
        <ul>{skillUsageDetails(result).map((line, index) => <li key={index}>{line}</li>)}</ul>
      </details> : null}
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
