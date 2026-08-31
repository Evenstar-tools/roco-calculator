import { Text, View } from "@tarojs/components";
import SingleSkillResultRow from "./SingleSkillResultRow.jsx";

export default function SkillSlots({
  choices,
  fallbackSkills = [],
  label,
  onChange,
  onOpenResult,
  onSelect,
  presentation,
  resultsHidden = false,
  rows = [],
  selectedIndex,
  showSkillIcons = true,
  values,
}) {
  const slotCount = Math.max(4, values?.length ?? 0, rows?.length ?? 0);
  return (
    <View
      aria-label={`${label}四技能`}
      className="skill-slots skill-slots--matrix"
    >
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
            showSkillIcons={showSkillIcons}
            value={values[index]}
          />
        );
      })}
      {presentation?.description || presentation?.effectHint ? (
        <View
          aria-label={`${label}\u5f53\u524d\u6280\u80fd\u8bf4\u660e`}
          className="skill-context-note"
        >
          {presentation.description ? (
            <Text className="skill-context-note__description">
              {presentation.description}
            </Text>
          ) : null}
          {presentation.effectHint ? (
            <Text className="skill-context-note__effect">
              {presentation.effectHint}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
