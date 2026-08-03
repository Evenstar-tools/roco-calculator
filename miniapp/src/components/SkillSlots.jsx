import { View } from "@tarojs/components";
import SkillPicker from "./SkillPicker.jsx";

export default function SkillSlots({
  choices,
  label,
  onChange,
  onSelect,
  selectedIndex,
  values,
}) {
  return (
    <View aria-label={`${label}四技能`} className="skill-slots">
      {Array.from({ length: 4 }, (_, index) => (
        <View
          className={
            selectedIndex === index
              ? "skill-slots__slot skill-slots__slot--selected"
              : "skill-slots__slot"
          }
          key={index}
        >
          <SkillPicker
            choices={choices}
            label={`${label}技能 ${index + 1}`}
            onChange={(value) => {
              onChange(index, value);
              onSelect(index);
            }}
            onOpen={() => onSelect(index)}
            value={values[index]}
          />
        </View>
      ))}
    </View>
  );
}
