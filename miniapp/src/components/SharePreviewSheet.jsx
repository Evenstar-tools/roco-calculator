import { Button, Text, View } from "@tarojs/components";
import { clampResultPercent, resultTone } from "../view-models/result-presentation.js";

function completenessLabel(value) {
  if (value === "full") return "将发送完整配置";
  if (value === "reduced") return "将发送核心配置";
  return "将发送基础配置";
}

function inputKey(input) {
  return input.contextKey ?? input.key ?? input.id;
}

function optionLabel(input, value) {
  return input.options?.find((option) => Object.is(option.value, value))?.label
    ?? String(value);
}

function skillParameterLabels({ context = {}, direction = {}, presentation }) {
  const labels = (presentation?.inputs ?? []).flatMap((input) => {
    const value = context[inputKey(input)] ?? input.defaultValue;
    if (input.type === "boolean") {
      if (value === true) return [input.label];
      return input.defaultValue === true ? [`${input.label}关闭`] : [];
    }
    if (Object.is(value, input.defaultValue) || value === undefined || value === "") {
      return [];
    }
    return [`${input.label} ${optionLabel(input, value)}`];
  });
  const powerOverride = direction?.overrides?.powerOverride;
  if (powerOverride && Number.isFinite(Number(powerOverride.value))) {
    labels.push(
      `${powerOverride.mode === "panel" ? "显示" : "静态"}威力 ${powerOverride.value}`,
    );
  }
  const hitCount = Math.max(1, Math.floor(Number(direction?.hitCount) || 1));
  if (hitCount > 1) labels.push(`连击 ${hitCount}`);
  return labels.slice(0, 4);
}

function ConfigurationRow({ label, primary, secondary }) {
  return (
    <View className="share-preview__configuration-row">
      <Text className="share-preview__configuration-label">{label}</Text>
      <View className="share-preview__configuration-value">
        <Text>{primary}</Text>
        {secondary ? (
          <Text className="share-preview__configuration-secondary">
            {secondary}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

export default function SharePreviewSheet({
  completeness = "full",
  onClose,
  open,
  skillContext,
  skillDirection,
  skillPresentation,
  summary,
  view,
}) {
  if (!open) return null;

  const selected = view?.selectedResult;
  const percent = Number.isFinite(selected?.hpPercent)
    ? selected.hpPercent
    : null;
  const tone = resultTone(percent);
  const parameterLabels = [
    ...skillParameterLabels({
      context: skillContext,
      direction: skillDirection,
      presentation: skillPresentation,
    }),
    ...(summary?.appliedSkillEffects ?? []),
  ];
  const conditionLabels = summary?.conditions?.length
    ? summary.conditions
    : ["无额外战斗条件"];

  return (
    <View className="share-preview__overlay" onClick={onClose}>
      <View
        aria-label="分享预览"
        aria-modal="true"
        className="share-preview"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <View className="share-preview__header">
          <View>
            <Text className="share-preview__title">分享给好友前确认</Text>
            <Text className="share-preview__subtitle">
              好友打开后先看只读结果，可自行决定是否载入配置
            </Text>
          </View>
          <Button
            aria-label="关闭分享预览"
            className="share-preview__close"
            hoverClass="button-hover"
            onClick={onClose}
          >
            ×
          </Button>
        </View>

        <View className="share-preview__result">
          <Text className="share-preview__matchup">
            {view?.attackerName ?? "攻击方"} → {view?.defenderName ?? "防守方"}
          </Text>
          <Text className="share-preview__skill">
            {selected?.skillName ?? view?.message ?? "计算结果"}
          </Text>
          <View className="share-preview__damage-row">
            <Text className="share-preview__damage">
              {Number.isFinite(selected?.totalDamage)
                ? selected.totalDamage
                : "—"}
            </Text>
            <Text className={`share-preview__percent share-preview__percent--${tone}`}>
              {Number.isFinite(percent) ? `${percent.toFixed(1)}% HP` : "暂不可计算"}
            </Text>
          </View>
          <View className="share-preview__health">
            <View className="share-preview__health-track">
              <View
                className={`share-preview__health-fill share-preview__health-fill--${tone}`}
                style={{
                  width: Number.isFinite(percent)
                    ? `${clampResultPercent(percent)}%`
                    : "0%",
                }}
              />
            </View>
            <Text className="share-preview__remaining">
              {Number.isFinite(selected?.remainingHp)
                ? `剩余 ${selected.remainingHp} HP`
                : "等待补充条件"}
            </Text>
          </View>
        </View>

        <View aria-label="分享配置摘要" className="share-preview__configuration">
          <View className="share-preview__configuration-heading">
            <Text className="share-preview__included-title">本次配置</Text>
            <Text className="share-preview__completeness">
              {completenessLabel(completeness)}
            </Text>
          </View>
          {completeness !== "full" ? (
            <Text className="share-preview__incomplete-warning">
              吞噬特性/参数可能未完整携带
            </Text>
          ) : null}
          <View className="share-preview__configuration-list">
            <ConfigurationRow
              label="攻击方配置"
              primary={summary?.attackerNature ?? "默认性格"}
              secondary={summary?.attackerIvs ?? "默认个体"}
            />
            <ConfigurationRow
              label="防守方配置"
              primary={summary?.defenderNature ?? "默认性格"}
              secondary={summary?.defenderIvs ?? "默认个体"}
            />
            <ConfigurationRow
              label="能力等级"
              primary={`攻击 ${summary?.attackStageLabel ?? "0"} · 防御 ${summary?.defenseStageLabel ?? "0"}`}
            />
            <ConfigurationRow
              label="技能参数"
              primary={(parameterLabels.length ? parameterLabels : ["默认参数"])
                .join(" · ")}
            />
            <ConfigurationRow
              label="战斗条件"
              primary={conditionLabels.join(" · ")}
            />
          </View>
          <Text className="share-preview__load-note">
            好友只会在点击“载入配置”后替换自己当前的计算。
          </Text>
        </View>

        <View className="share-preview__actions">
          <Button
            aria-label="返回修改"
            className="share-preview__secondary"
            hoverClass="button-hover"
            onClick={onClose}
          >
            返回修改
          </Button>
          <Button
            aria-label="确认分享"
            className="share-preview__primary"
            hoverClass="button-hover"
            openType="share"
          >
            确认分享
          </Button>
        </View>
      </View>
    </View>
  );
}
