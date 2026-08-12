import { Button, Text, View } from "@tarojs/components";
import {
  clampResultPercent,
  resultTone,
} from "../view-models/result-presentation.js";

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
        const tone = resultTone(exact ? row.hpPercent : null);
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
              <View
                className={`result-row__track-fill result-row__track-fill--${tone}`}
                style={{
                  width: exact
                    ? `${clampResultPercent(row.hpPercent)}%`
                    : "0%",
                }}
              />
            </View>
            <Text
              className={`result-row__damage result-row__damage--${tone}`}
            >
              {exact
                ? `${row.hpPercent.toFixed(1)}%`
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
