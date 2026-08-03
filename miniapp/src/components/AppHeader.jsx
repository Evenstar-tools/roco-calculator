import { useState } from "react";
import { Button, Text, View } from "@tarojs/components";

export default function AppHeader({
  dataVersion,
  onClearLocalData,
  onReset,
  onRetry,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);

  return (
    <View className="app-header-shell">
      <View className="app-header">
        <View className="app-header__identity">
          <Text className="app-header__title">洛克对战计算器</Text>
          <Text className="app-header__version">
            数据 {dataVersion || "待确认"}
          </Text>
        </View>
        <View className="app-header__actions">
          <Button
            className="app-header__action"
            onClick={onReset}
          >
            重置配置
          </Button>
          <Button
            aria-expanded={menuOpen}
            className="app-header__action"
            onClick={() => setMenuOpen((open) => !open)}
          >
            更多
          </Button>
        </View>
      </View>
      {menuOpen ? (
        <View aria-label="更多菜单" className="app-header__menu">
          <Button
            className="app-header__menu-action"
            onClick={onRetry}
          >
            重试数据加载
          </Button>
          <Button
            className="app-header__menu-action app-header__menu-action--danger"
            onClick={onClearLocalData}
          >
            清除本机数据
          </Button>
          <Button
            aria-expanded={aboutOpen}
            className="app-header__menu-action"
            onClick={() => setAboutOpen((open) => !open)}
          >
            关于与数据来源
          </Button>
          {aboutOpen ? (
            <View className="app-header__about">
              <Text>数据参考 BWIKI 洛克王国公开资料整理。</Text>
              <Text>
                本工具为玩家自制的非官方免费计算工具，与游戏官方及相关权利方无隶属、授权或合作关系。
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
