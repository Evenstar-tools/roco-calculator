import { useState } from "react";
import { Button, Text, View } from "@tarojs/components";

export default function SkillUsageSummary({ summary, usage, nextHint, details = [] }) {
  const [expanded, setExpanded] = useState(false);
  if (!summary) return null;
  const signed = (value = 0) => `${value >= 0 ? "+" : ""}${value}`;
  const records = details.filter((line) => !line.startsWith("累计已生效：") && !line.startsWith("折射无独立"));
  return <View className="skill-usage" onClick={(event) => event.stopPropagation()}>
    {usage ? <View className="skill-usage__main">
      <Text>{usage.historyIncomplete ? "已记录" : "已使用"} <Text className="skill-usage__value">{usage.count}</Text> 次</Text>
      <Text>累计威力 <Text className="skill-usage__value">{signed(usage.powerGain)}</Text></Text>
      <Text>累计连击 <Text className="skill-usage__value">{signed(usage.hitCountGain)}</Text></Text>
    </View> : <Text className="skill-usage__main">{summary}</Text>}
    {nextHint ? <Text className="skill-usage__next">{nextHint}</Text> : null}
    {usage?.manualPower ? <Text className="skill-usage__notice">威力已手动覆盖，累计记录保留</Text> : null}
    {usage?.hitCountCapped ? <Text className="skill-usage__notice">连击已达上限 {usage.hitCountLimit}</Text> : null}
    {usage?.historyIncomplete ? <Text className="skill-usage__notice">此前记录不完整，不按当前条件倒推</Text> : null}
    <Button className="skill-usage__toggle" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? "收起增益明细" : "查看增益明细"}</Button>
    {expanded ? <View className="skill-usage__details">
      {usage?.count === 0 && !usage.historyIncomplete ? <Text>暂无使用记录</Text> : null}
      {records.map((line, index) => <Text key={index}>{line}</Text>)}
    </View> : null}
  </View>;
}
