import { describeSkillUsage, skillUsageDetails, skillUsageDisplay } from "../domain/skill-presentation.js";

export function SkillUsageSummary({ result, nextHint }) {
  const summary = describeSkillUsage(result);
  const usage = result?.usageSummary;
  nextHint ??= result?.usageSummary?.nextHint;
  if (!summary && !nextHint) return null;
  const display = skillUsageDisplay(usage, nextHint, skillUsageDetails(result));
  return (
    <div className="skill-usage" onClick={(event) => event.stopPropagation()}>
      {usage?.count > 0 ? <div className="skill-usage__main" aria-label={`${usage.historyIncomplete ? "已记录" : "已使用"} ${usage.count} 次`}>
        <span>{usage.historyIncomplete ? "已记录" : "已使用"} <b>{usage.count}</b> 次</span>
      </div> : null}
      {display.current.length ? <p className="skill-usage__main">当前计算：{display.current.join(" · ")}</p> : null}
      {display.next ? <p className="skill-usage__next" title={display.next}>{display.next}</p> : null}
      {display.recorded.length ? <p className="skill-usage__notice">仅记录：{display.recorded.join(" · ")}（未参与结算）</p> : null}
      {usage?.manualPower ? <p className="skill-usage__notice">{display.hasHistory ? "威力已手动覆盖，累计记录保留" : "威力已手动覆盖，以当前值为准"}</p> : null}
      {usage?.hitCountCapped ? <p className="skill-usage__notice">连击已达上限 {usage.hitCountLimit}</p> : null}
      {usage?.historyIncomplete ? <p className="skill-usage__notice">此前记录不完整，不按当前条件倒推</p> : null}
      {display.details.length ? <details className="skill-usage__details">
        <summary>查看增益明细</summary>
        <ul>
          <li>来源：当前配置与战斗状态（含特性、印记及手动调整）；以下为历史记录，不再次叠加。</li>
          {display.details.map((line, index) => <li key={index}>{line}</li>)}
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
