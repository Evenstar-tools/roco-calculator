import { View } from "@tarojs/components";
import SingleSkillResultRow from "./SingleSkillResultRow.jsx";

export default function SkillSlots({
  choices,
  fallbackSkills = [],
  label,
  onChange,
  onOpenResult,
  onSelect,
  resultsHidden = false,
  rows = [],
  selectedIndex,
  values,
}) {
  const slotCount = Math.max(4, values?.length ?? 0, rows?.length ?? 0);
  return (
    <View aria-label={`${label}四技能`} className="skill-slots">
      {Array.from({ length: slotCount }, (_, index) => {
        const row = rows[index];

        return (
          <SingleSkillResultRow
            choices={choices}
            fallbackSkill={fallbackSkills[index] ?? row}
            label={`${label}技能 ${index + 1}`}
            key={index}
            onChange={(value) => {
              onChange(index, value);
              onSelect(index);
            }}
            onOpen={() => onSelect(index)}
            onOpenResult={() => {
              onSelect(index);
              onOpenResult?.(index);
            }}
            resultsHidden={resultsHidden}
            row={row}
            selected={selectedIndex === index}
            value={values[index]}
          />
        );
      })}
    </View>
  );
}
