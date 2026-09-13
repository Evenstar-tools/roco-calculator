import { Text, View } from "@tarojs/components";
import { skillUsageDisplay } from "../shared/domain/skill-presentation.js";

export default function SkillUsageSummary({ summary, usage, nextHint }) {
  if (!summary && !usage) return null;
  const display = skillUsageDisplay(usage, nextHint);
  const status = display.status || (!usage && summary !== "未使用｜无增益" ? summary : "");
  if (!status && !display.next && !display.recorded.length) return null;
  return <View className="skill-usage" onClick={(event) => event.stopPropagation()}>
    {status ? <Text className="skill-usage__main">{status}</Text> : null}
    {display.next ? <Text className="skill-usage__next">{display.next}</Text> : null}
    {display.recorded.length ? <Text className="skill-usage__notice">仅记录：{display.recorded.join(" · ")}（未参与结算）</Text> : null}
  </View>;
}
