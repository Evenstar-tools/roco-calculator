import { useCalculatorLocale } from "../i18n/calculator-text.js";
import { describeSkillUsage, skillUsageDisplay } from "../domain/skill-presentation.js";

export function SkillUsageSummary({ result, nextHint }) {
  const { tc } = useCalculatorLocale();
  const summary = describeSkillUsage(result);
  const usage = result?.usageSummary;
  nextHint ??= result?.usageSummary?.nextHint;
  if (!summary && !nextHint) return null;
  const display = skillUsageDisplay(usage, nextHint);
  if (!display.status && !display.next && !display.recorded.length) return null;
  return (
    <div className="skill-usage" onClick={(event) => event.stopPropagation()}>
      {display.status ? <p className="skill-usage__main" aria-label={usage?.count > 0 ? tc("{v0} {v1} 次", { v0: usage.historyIncomplete ? "已记录" : "已使用", v1: usage.count }) : tc(undefined)}>{tc(display.status)}</p> : null}
      {display.next ? <p className="skill-usage__next" title={tc(display.next)}>{tc(display.next)}</p> : null}
      {display.recorded.length ? <p className="skill-usage__notice">{tc("仅记录：")}{tc(display.recorded.join(" · "))}{tc("（未参与结算）")}</p> : null}
    </div>
  );
}

export function UsageCountActions({ input, value, onChange }) {
  const { tc } = useCalculatorLocale();
  if (!["skillUseCount", "pressureValveUseCount"].includes(input.contextKey ?? input.key)) return null;
  const count = Number(value ?? input.defaultValue ?? 0);
  const minimum = input.min ?? 0;
  const maximum = input.max ?? Infinity;
  return (
    <span className="usage-count-actions" onClick={(event) => event.stopPropagation()}>
      <button type="button" aria-label={tc("{v0}减少", { v0: input.label })} disabled={count <= minimum} onClick={() => onChange(Math.max(minimum, count - 1))}>−</button>
      <button type="button" aria-label={tc("{v0}增加", { v0: input.label })} disabled={count >= maximum} onClick={() => onChange(Math.min(maximum, count + 1))}>＋</button>
      <button type="button" aria-label={tc("{v0}重置", { v0: input.label })} disabled={count === minimum} onClick={() => onChange(minimum)}>{tc("重置")}</button>
    </span>
  );
}
