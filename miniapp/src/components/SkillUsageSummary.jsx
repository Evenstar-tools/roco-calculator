import { useState } from "react";
import { Button, Text, View } from "@tarojs/components";
import { skillUsageDisplay } from "../shared/domain/skill-presentation.js";

export default function SkillUsageSummary({ summary, usage, nextHint, details = [] }) {
  const [expanded, setExpanded] = useState(false);
  if (!summary) return null;
  const display = skillUsageDisplay(usage, nextHint, details);
  return <View className="skill-usage" onClick={(event) => event.stopPropagation()}>
    {usage?.count > 0 ? <View className="skill-usage__main">
      <Text>{usage.historyIncomplete ? "已记录" : "已使用"} <Text className="skill-usage__value">{usage.count}</Text> 次</Text>
    </View> : !usage ? <Text className="skill-usage__main">{summary}</Text> : null}
    {display.current.length ? <Text className="skill-usage__main">当前计算：{display.current.join(" · ")}</Text> : null}
    {display.next ? <Text className="skill-usage__next">{display.next}</Text> : null}
    {display.recorded.length ? <Text className="skill-usage__notice">仅记录：{display.recorded.join(" · ")}（未参与结算）</Text> : null}
    {usage?.manualPower ? <Text className="skill-usage__notice">{display.hasHistory ? "威力已手动覆盖，累计记录保留" : "威力已手动覆盖，以当前值为准"}</Text> : null}
    {usage?.hitCountCapped ? <Text className="skill-usage__notice">连击已达上限 {usage.hitCountLimit}</Text> : null}
    {usage?.historyIncomplete ? <Text className="skill-usage__notice">此前记录不完整，不按当前条件倒推</Text> : null}
    {display.details.length ? <Button className="skill-usage__toggle" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? "收起增益明细" : "查看增益明细"}</Button> : null}
    {expanded && display.details.length ? <View className="skill-usage__details">
      <Text>来源：当前配置与战斗状态（含特性、印记及手动调整）；以下为历史记录，不再次叠加。</Text>
      {display.details.map((line, index) => <Text key={index}>{line}</Text>)}
    </View> : null}
  </View>;
}
