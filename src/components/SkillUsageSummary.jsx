import { describeSkillUsage, skillUsageDetails } from "../domain/skill-presentation.js";

export function SkillUsageSummary({ result, nextHint }) {
  const summary = describeSkillUsage(result);
  const usage = result?.usageSummary;
  const signed = (value = 0) => `${value >= 0 ? "+" : ""}${value}`;
  nextHint ??= result?.usageSummary?.nextHint;
  if (!summary && !nextHint) return null;
  return (
    <div className="skill-usage" onClick={(event) => event.stopPropagation()}>
      {usage ? <div className="skill-usage__main" aria-label={summary}>
        <span>{usage.historyIncomplete ? "已记录" : "已使用"} <b>{usage.count}</b> 次</span>
        <span>累计威力 <b>{signed(usage.powerGain)}</b></span>
        <span>累计连击 <b>{signed(usage.hitCountGain)}</b></span>
      </div> : null}
      {nextHint ? <p className="skill-usage__next" title={nextHint}>{nextHint}</p> : null}
      {usage?.manualPower ? <p className="skill-usage__notice">威力已手动覆盖，累计记录保留</p> : null}
      {usage?.hitCountCapped ? <p className="skill-usage__notice">连击已达上限 {usage.hitCountLimit}</p> : null}
      {usage?.historyIncomplete ? <p className="skill-usage__notice">此前记录不完整，不按当前条件倒推</p> : null}
      {summary ? <details className="skill-usage__details">
        <summary>查看增益明细</summary>
        <ul>
          {usage.count === 0 && !usage.historyIncomplete ? <li>暂无使用记录</li> : null}
          {skillUsageDetails(result).filter((line) => !line.startsWith("累计已生效：") && !line.startsWith("折射无独立")).map((line, index) => <li key={index}>{line}</li>)}
        </ul>
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
