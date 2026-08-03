import { Button, Text, View } from "@tarojs/components";

export default function ErrorState({ message, onRetry }) {
  return (
    <View className="page page--state">
      <View className="state-card state-card--error">
        <Text className="state-card__eyebrow">洛克王国对战辅助工具</Text>
        <Text className="state-card__title">洛克对战计算器</Text>
        <Text className="state-card__message">
          {message || "计算数据加载失败，请检查网络后重试"}
        </Text>
        <Button
          className="state-card__action"
          onClick={onRetry}
        >
          重新加载
        </Button>
      </View>
    </View>
  );
}
