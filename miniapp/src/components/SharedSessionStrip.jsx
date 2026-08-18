import { Button, Text, View } from "@tarojs/components";

export default function SharedSessionStrip({ onReturnLocal, onRestore }) {
  return (
    <View className="shared-session-strip">
      <View className="shared-session-strip__copy">
        <Text className="shared-session-strip__title">正在基于好友分享调整</Text>
        <Text className="shared-session-strip__hint">修改会按当前记忆设置保存</Text>
      </View>
      <View className="shared-session-strip__actions">
        <Button
          className="shared-session-strip__button"
          hoverClass="button-hover"
          onClick={onRestore}
        >
          恢复分享原样
        </Button>
        <Button
          className="shared-session-strip__button shared-session-strip__button--primary"
          hoverClass="button-hover"
          onClick={onReturnLocal}
        >
          返回我的配置
        </Button>
      </View>
    </View>
  );
}
