import { Button, Text, View } from "@tarojs/components";
import SkillPicker from "./SkillPicker.jsx";

export default function SingleSkillResultRow({
  choices,
  fallbackSkill,
  label,
  onChange,
  onOpen,
  onOpenResult,
  resultsHidden = false,
  row,
  selected = false,
  value,
}) {
  const exact = row?.status === "exact" && Number.isFinite(row?.hpPercent);
  const damageLabel = exact ? row.totalDamage : "--";
  const percentLabel = exact ? `${row.hpPercent.toFixed(1)}% HP` : "--% HP";
  const skillName = row?.skillName ?? fallbackSkill?.name ?? "当前技能";
  const damageLength = String(damageLabel).length;
  const percentLength = percentLabel.length;
  const longMetrics = damageLength >= 5 || percentLength >= 9;

  return (
    <View
      className={selected
        ? "skill-result-row skill-result-row--selected"
        : "skill-result-row"}
    >
      <SkillPicker
        choices={choices}
        fallbackSkill={fallbackSkill ?? row}
        label={label}
        onChange={onChange}
        onOpen={onOpen}
        value={value}
      />
      <Button
        aria-hidden={resultsHidden}
        aria-label={`查看${skillName}伤害 ${damageLabel} ${percentLabel}`}
        aria-pressed={selected}
        className={[
          "skill-result-row__result",
          selected ? "skill-result-row__result--selected" : "",
          longMetrics ? "skill-result-row__result--long" : "",
        ].filter(Boolean).join(" ")}
        hoverClass="button-hover"
        onClick={(event) => {
          event.stopPropagation();
          onOpenResult?.();
        }}
        tabIndex={resultsHidden ? -1 : 0}
      >
        <Text className={[
          "skill-result-row__damage",
          damageLength >= 5 ? "skill-result-row__damage--compact" : "",
          damageLength >= 7 ? "skill-result-row__damage--tight" : "",
        ].filter(Boolean).join(" ")}>{damageLabel}</Text>
        <Text className={[
          "skill-result-row__percent",
          percentLength >= 9 ? "skill-result-row__percent--compact" : "",
        ].filter(Boolean).join(" ")}>{percentLabel}</Text>
      </Button>
    </View>
  );
}
