import { Button, Text, View } from "@tarojs/components";
import {
  damagePresentation,
  resultTone,
} from "../view-models/result-presentation.js";
import DamageSegments from "./DamageSegments.jsx";

export default function SkillResultRows({
  onSelect,
  rows,
  selectedIndex,
}) {
  return (
    <View aria-label="技能结果" className="result-rows">
      {(rows ?? []).map((row, index) => {
        const exact =
          row?.status === "exact" && Number.isFinite(row?.hpPercent);
        const presentation = damagePresentation(row);
        const tone = resultTone(exact ? presentation.percent : null);
        return (
          <Button
            aria-label={`查看${row.skillName ?? `技能 ${index + 1}`}结果`}
            aria-pressed={selectedIndex === index}
            className={
              selectedIndex === index
                ? "result-row result-row--selected"
                : "result-row"
            }
            hoverClass="button-hover"
            key={`${row.skillId ?? "empty"}-${index}`}
            onClick={() => onSelect(index)}
          >
            <Text className="result-row__index">{index + 1}</Text>
            <View className="result-row__copy">
              <Text className="result-row__name">
                {row.skillName ?? `技能 ${index + 1}`}
              </Text>
            </View>
            <View className="result-row__track" aria-hidden="true">
              <DamageSegments presentation={presentation} className={`result-row__track-fill--${tone}`} />
            </View>
            <Text
              className={`result-row__damage result-row__damage--${tone}`}
            >
              {exact
                ? `${presentation.percent.toFixed(1)}%${presentation.freezePercent > 0 ? " 覆盖" : ""}`
                : row.status === "exact"
                  ? `${row.totalDamage} 伤害`
                  : row.message}
            </Text>
          </Button>
        );
      })}
    </View>
  );
}
