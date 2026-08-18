import { Button, Text, View } from "@tarojs/components";
import { clampResultPercent, resultTone } from "../view-models/result-presentation.js";

function completenessLabel(value) {
  if (value === "full") return "将发送完整配置";
  if (value === "reduced") return "将发送核心配置";
  return "将发送基础配置";
}

export default function SharePreviewSheet({
  completeness = "full",
  onClose,
  open,
  view,
}) {
  if (!open) return null;

  const selected = view?.selectedResult;
  const percent = Number.isFinite(selected?.hpPercent)
    ? selected.hpPercent
    : null;
  const tone = resultTone(percent);

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
              好友先看到只读快照，确认后才会载入配置
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

        <View className="share-preview__included">
          <Text className="share-preview__included-title">好友会收到</Text>
          <View className="share-preview__included-tags">
            <Text>双方精灵</Text>
            <Text>性格个体</Text>
            <Text>技能结果</Text>
            <Text>战斗条件</Text>
          </View>
          <Text className="share-preview__completeness">
            {completenessLabel(completeness)}
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
