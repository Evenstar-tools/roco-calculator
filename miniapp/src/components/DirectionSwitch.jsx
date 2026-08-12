import { Button, Image, Text, View } from "@tarojs/components";
import arrowsLeftRightIcon from "../assets/icons/arrows-left-right.png";

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
        hoverClass="button-hover"
        onClick={onSwap}
      >
        <Image
          alt="交换攻守"
          aria-label="交换攻守"
          className="direction-switch__icon"
          mode="aspectFit"
          src={arrowsLeftRightIcon}
        />
      </Button>
    </View>
  );
}
