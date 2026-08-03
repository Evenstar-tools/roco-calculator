import { Button, Text, View } from "@tarojs/components";

export default function SkillResultRows({
  onSelect,
  rows,
  selectedIndex,
}) {
  return (
    <View aria-label="四技能计算结果" className="result-rows">
      {(rows ?? []).map((row, index) => (
        <Button
          aria-label={`查看${row.skillName ?? `技能 ${index + 1}`}结果`}
          aria-pressed={selectedIndex === index}
          className={
            selectedIndex === index
              ? "result-row result-row--selected"
              : "result-row"
          }
          key={`${row.skillId ?? "empty"}-${index}`}
          onClick={() => onSelect(index)}
        >
          <Text className="result-row__name">
            {row.skillName ?? `技能 ${index + 1}`}
          </Text>
          <Text className="result-row__damage">
            {row.status === "exact"
              ? `${row.totalDamage} 伤害`
              : row.message}
          </Text>
        </Button>
      ))}
    </View>
  );
}
