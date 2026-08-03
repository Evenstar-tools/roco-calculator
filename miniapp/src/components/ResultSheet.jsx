import {
  Button,
  ScrollView,
  Text,
  View,
} from "@tarojs/components";
import SkillResultRows from "./SkillResultRows.jsx";

export default function ResultSheet({
  onClose,
  onSelectSkill,
  open,
  selectedIndex,
  view,
}) {
  if (!open) return null;

  const exact = view?.status === "exact";
  const result = view?.selectedResult;
  const remainingHp = Number.isFinite(result?.remainingHp)
    ? result.remainingHp
    : "--";
  const remainingHpPercent = Number.isFinite(
    result?.remainingHpPercent,
  )
    ? `${Math.round(result.remainingHpPercent)}%`
    : "--";

  return (
    <View
      catchMove
      className="result-sheet__overlay"
      onClick={onClose}
    >
      <View
        aria-label="伤害结果"
        aria-modal="true"
        className="result-sheet"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <View className="result-sheet__header">
          <View className="result-sheet__heading">
            <Text className="result-sheet__title">伤害结果</Text>
            <Text className="result-sheet__direction">
              {view?.attackerName ?? "攻击方"} →{" "}
              {view?.defenderName ?? "防守方"}
            </Text>
          </View>
          <Button
            aria-label="关闭伤害结果"
            className="result-sheet__close"
            onClick={onClose}
          >
            关闭
          </Button>
        </View>
        <ScrollView
          className="result-sheet__scroll"
          scrollY
          showScrollbar
        >
          {view?.rows?.length > 1 ? (
            <SkillResultRows
              onSelect={onSelectSkill}
              rows={view.rows}
              selectedIndex={selectedIndex}
            />
          ) : null}
          {exact ? (
            <View className="result-sheet__metrics">
              <View className="result-sheet__metric">
                <Text className="result-sheet__metric-label">
                  {result.skillName}
                </Text>
                <Text className="result-sheet__damage">
                  {result.totalDamage}
                </Text>
                <Text className="result-sheet__metric-unit">伤害</Text>
              </View>
              <View className="result-sheet__metric">
                <Text className="result-sheet__metric-label">
                  剩余生命
                </Text>
                <Text className="result-sheet__value">
                  {remainingHp}
                </Text>
                <Text className="result-sheet__metric-unit">
                  {remainingHpPercent}
                </Text>
              </View>
            </View>
          ) : (
            <View
              aria-label="计算未解析"
              className="result-sheet__unresolved"
            >
              <Text className="result-sheet__unresolved-title">
                伤害暂未解析
              </Text>
              <Text className="result-sheet__message">
                {view?.message}
              </Text>
            </View>
          )}
        </ScrollView>
        <Button
          aria-label="分享当前计算"
          className="result-sheet__share"
          openType="share"
        >
          分享当前计算
        </Button>
      </View>
    </View>
  );
}
