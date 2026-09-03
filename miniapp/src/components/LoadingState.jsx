import { Text, View } from "@tarojs/components";

export default function LoadingState() {
  return (
    <View className="page page--state">
      <View className="state-card">
        <Text className="state-card__eyebrow">洛克王国对战辅助工具</Text>
        <Text className="state-card__title">洛克计算器 · S4前瞻</Text>
        <View className="state-card__progress" aria-hidden="true">
          <View className="state-card__progress-fill" />
        </View>
        <Text className="state-card__message">正在加载计算数据…</Text>
      </View>
    </View>
  );
}
