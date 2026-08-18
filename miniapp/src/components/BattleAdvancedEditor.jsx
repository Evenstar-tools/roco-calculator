import { Button, Input, Text, View } from "@tarojs/components";
import {
  BLOODLINE_MAGIC_OPTIONS,
  getBloodlineMagicOption,
} from "../shared/domain/bloodline-magic.js";
import ConditionSection from "./ConditionSection.jsx";

function readNumber(event, fallback = 0) {
  const raw = event?.detail?.value ?? event?.target?.value ?? "";
  if (String(raw).trim() === "") return null;
  const numeric = Number(raw);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function NumericField({ label, min = 0, onChange, suffix, value }) {
  return (
    <View className="battle-advanced__field">
      <Text className="battle-advanced__label">{label}</Text>
      <View className="battle-advanced__input-wrap">
        <Input
          aria-label={label}
          className="battle-advanced__input"
          inputMode="decimal"
          min={min}
          onInput={(event) => {
            const next = readNumber(event, min);
            if (next !== null) onChange(next);
          }}
          type="number"
          value={value}
        />
        <Text className="battle-advanced__suffix">{suffix}</Text>
      </View>
    </View>
  );
}

export default function BattleAdvancedEditor({ direction, onChange }) {
  const reductionPercent = Math.round(
    (1 - Number(direction.reduction ?? 1)) * 100,
  );
  const finalMultiplier = Number(direction.finalDamageMultiplier ?? 1);
  const context = direction.context ?? {};
  const bloodline = getBloodlineMagicOption(context.bloodlineMagicId);
  const bloodlineTriggered = context.bloodlineMagicTriggered === true;
  const active = reductionPercent !== 0 || finalMultiplier !== 1 ||
    bloodline.id !== "none";

  return (
    <ConditionSection
      className="condition-section--advanced"
      defaultOpen={active}
      summary={`减伤 ${reductionPercent}% · 终伤 ×${Number(finalMultiplier.toFixed(2))} · 血脉 ${bloodline.name}`}
      title="高级参数"
    >
      <View aria-label="高级参数" className="battle-advanced">
        <NumericField
          label="减伤比例"
          onChange={(value) => onChange({
            reduction: 1 - Math.min(100, Math.max(0, value)) / 100,
          })}
          suffix="%"
          value={reductionPercent}
        />
        <NumericField
          label="最终伤害倍率"
          onChange={(finalDamageMultiplier) => onChange({
            finalDamageMultiplier,
          })}
          suffix="×"
          value={finalMultiplier}
        />
        <View aria-label="血脉魔法" className="battle-advanced__bloodline">
          <View className="battle-advanced__bloodline-heading">
            <Text className="battle-advanced__label">血脉魔法</Text>
            <Text className="battle-advanced__bloodline-note">
              当前仅光合治愈参与伤害结算
            </Text>
          </View>
          <View className="battle-advanced__bloodline-options">
            {BLOODLINE_MAGIC_OPTIONS.map((option) => (
              <Button
                aria-label={`选择${option.name}`}
                aria-pressed={bloodline.id === option.id}
                className={[
                  "battle-advanced__bloodline-option",
                  bloodline.id === option.id
                    ? "battle-advanced__bloodline-option--selected"
                    : "",
                ].filter(Boolean).join(" ")}
                disabled={!option.implemented}
                key={option.id}
                onClick={() => onChange({
                  context: {
                    bloodlineMagicId: option.id,
                    bloodlineMagicTriggered: false,
                  },
                })}
              >
                {option.name}
              </Button>
            ))}
          </View>
          {bloodline.id !== "none" ? (
            <Button
              aria-label={bloodlineTriggered ? "取消使用血脉魔法" : "本次使用血脉魔法"}
              aria-pressed={bloodlineTriggered}
              className={[
                "battle-advanced__bloodline-trigger",
                bloodlineTriggered
                  ? "battle-advanced__bloodline-trigger--active"
                  : "",
              ].filter(Boolean).join(" ")}
              disabled={!bloodline.implemented}
              onClick={() => onChange({
                context: {
                  bloodlineMagicId: bloodline.id,
                  bloodlineMagicTriggered: !bloodlineTriggered,
                },
              })}
            >
              {bloodlineTriggered ? "本次已使用，再点取消" : "本次使用"}
            </Button>
          ) : null}
        </View>
      </View>
    </ConditionSection>
  );
}
