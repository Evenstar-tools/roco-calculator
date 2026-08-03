import { Button, Text, View } from "@tarojs/components";

export default function DirectionSwitch({ onSwap }) {
  return (
    <View className="direction-switch">
      <View className="direction-switch__copy">
        <Text className="direction-switch__label">当前计算方向</Text>
        <Text className="direction-switch__value">攻击方对防守方</Text>
      </View>
      <Button
        aria-label="切换攻守配置"
        className="direction-switch__button"
        onClick={onSwap}
      >
        切换攻守
      </Button>
    </View>
  );
}
