import { useState } from "react";
import { Button, Text, View } from "@tarojs/components";

export default function SkillUsageSummary({ summary, details = [] }) {
  const [expanded, setExpanded] = useState(false);
  if (!summary) return null;
  return <View className="skill-usage" onClick={(event) => event.stopPropagation()}>
    <Text className="skill-usage__main">{summary}</Text>
    <Button className="skill-usage__toggle" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? "收起增益明细" : "查看增益明细"}</Button>
    {expanded ? <View className="skill-usage__details">{details.map((line, index) => <Text key={index}>{line}</Text>)}</View> : null}
  </View>;
}
