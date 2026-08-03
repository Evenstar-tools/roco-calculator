import { useState } from "react";
import { Button, Text, View } from "@tarojs/components";

function entryId(entry) {
  if (typeof entry === "string") return entry;
  return entry?.skillId ?? entry?.id ?? null;
}

function skillSummary(skill) {
  const power =
    Number.isFinite(Number(skill.basePower)) && skill.basePower > 0
      ? `威力 ${skill.basePower}`
      : "辅助技能";
  return `${skill.type ?? "未知系"} · ${power}`;
}

export default function SkillPicker({
  choices,
  label,
  onChange,
  onOpen,
  value,
}) {
  const [open, setOpen] = useState(false);
  const selectedId = entryId(value);
  const selected = choices.find((skill) => skill.id === selectedId);

  function toggle() {
    const nextOpen = !open;
    setOpen(nextOpen);
    if (nextOpen) onOpen?.();
  }

  return (
    <View className="skill-picker">
      <Button
        aria-expanded={open}
        aria-label={`选择${label}`}
        className="skill-picker__trigger"
        onClick={toggle}
      >
        <View className="skill-picker__trigger-copy">
          <Text className="skill-picker__label">{label}</Text>
          <Text className="skill-picker__name">
            {selected?.name ?? "请选择技能"}
          </Text>
        </View>
        <Text className="skill-picker__meta">
          {selected ? skillSummary(selected) : "仅显示可学习技能"}
        </Text>
      </Button>
      {open ? (
        <View
          aria-label={`${label}选项`}
          className="skill-picker__options"
        >
          {choices.length ? (
            choices.map((skill) => (
              <Button
                aria-label={`${skill.name} ${skillSummary(skill)}`}
                aria-pressed={skill.id === selectedId}
                className={
                  skill.id === selectedId
                    ? "skill-picker__option skill-picker__option--selected"
                    : "skill-picker__option"
                }
                key={skill.id}
                onClick={() => {
                  onChange(skill.id);
                  setOpen(false);
                }}
              >
                <Text className="skill-picker__option-name">
                  {skill.name}
                </Text>
                <Text className="skill-picker__option-meta">
                  {skillSummary(skill)}
                </Text>
              </Button>
            ))
          ) : (
            <Text className="skill-picker__empty">
              当前宠物没有可用技能数据
            </Text>
          )}
        </View>
      ) : null}
    </View>
  );
}
