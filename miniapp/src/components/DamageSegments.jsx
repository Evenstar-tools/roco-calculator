import { View } from "@tarojs/components";
import { damageSegments } from "../view-models/result-presentation.js";

export default function DamageSegments({ presentation, className = "" }) {
  return <View className={`damage-coverage ${className}`}>
    {damageSegments(presentation).map(({ kind, width }) =>
      <View className={`damage-coverage__${kind}`} key={kind} style={{ width: `${width}%` }} />,
    )}
  </View>;
}
