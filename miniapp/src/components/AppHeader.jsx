import { useState } from "react";
import { Button, ScrollView, Text, View } from "@tarojs/components";
import {
  MINIAPP_RELEASE_LABEL,
  MINIAPP_UPDATE_DATE,
  MINIAPP_VERSION,
} from "../version.js";

export default function AppHeader({
  commonConfigCount = 0,
  dataVersion,
  memoryEnabled = true,
  onImportCommonConfig,
  onMemoryChange,
  onReset,
}) {
  const [settingsOpen, setSettingsOpen] = useState(false);

  async function resetCurrentPage() {
    const completed = await onReset?.();
    if (completed) {
      setSettingsOpen(false);
    }
  }

  return (
    <View className={settingsOpen
      ? "app-header-shell app-header-shell--settings-open"
      : "app-header-shell"}
    >
      <View className="app-header">
        <View className="app-header__identity">
          <Text className="app-header__title">洛克对战计算器</Text>
          <Text className="app-header__version">
            数据 {dataVersion || "待确认"}
          </Text>
          <Text className="app-header__version">
            {MINIAPP_RELEASE_LABEL}
          </Text>
        </View>
        <View className="app-header__actions">
          <Button
            aria-expanded={settingsOpen}
            aria-label="打开设置"
            className={settingsOpen
              ? "app-header__action app-header__action--expanded"
              : "app-header__action"}
            hoverClass="button-hover"
            onClick={() => setSettingsOpen(true)}
          >
            设置
          </Button>
        </View>
      </View>
      {settingsOpen ? (
        <View
          aria-label="关闭设置遮罩"
          className="settings-sheet__overlay"
          onClick={() => setSettingsOpen(false)}
        >
          <View
            aria-label="设置"
            aria-modal="true"
            className="settings-sheet"
            onClick={(event) => event.stopPropagation?.()}
            role="dialog"
          >
            <View className="settings-sheet__header">
              <View className="settings-sheet__heading">
                <Text className="settings-sheet__title">设置</Text>
              </View>
              <Button
                aria-label="关闭设置"
                className="settings-sheet__close"
                hoverClass="button-hover"
                onClick={() => setSettingsOpen(false)}
              >
                完成
              </Button>
            </View>
            <ScrollView className="settings-sheet__body" scrollY>
              <View className="settings-sheet__body-content">
              <View className="settings-sheet__row">
                <View className="settings-sheet__copy">
                  <Text className="settings-sheet__label">配置记忆</Text>
                  <Text className="settings-sheet__description">
                    开启后自动恢复上次页面
                  </Text>
                </View>
                <Button
                  aria-checked={memoryEnabled}
                  aria-label="配置记忆"
                  className={memoryEnabled
                    ? "settings-sheet__switch settings-sheet__switch--on"
                    : "settings-sheet__switch"}
                  hoverClass="settings-sheet__switch--pressed"
                  onClick={() => onMemoryChange?.(!memoryEnabled)}
                  role="switch"
                >
                  <View className="settings-sheet__switch-thumb" />
                </Button>
              </View>
              <View className="settings-sheet__divider" />
              <Button
                aria-label="导入PVP热门配置"
                className="settings-sheet__action-row"
                hoverClass="settings-sheet__action-row--pressed"
                onClick={() => onImportCommonConfig?.()}
              >
                <View className="settings-sheet__copy">
                  <Text className="settings-sheet__label">常用精灵配置</Text>
                  <Text className="settings-sheet__description">
                    {commonConfigCount > 0
                      ? `已导入 ${commonConfigCount} 只，选择时自动应用`
                      : "一键导入 PVP 热门配置"}
                  </Text>
                </View>
                <Text className="settings-sheet__action-text">
                  {commonConfigCount > 0 ? "更新" : "一键导入"}
                </Text>
              </Button>
              <View className="settings-sheet__divider" />
              <Button
                aria-label="重置本页"
                className="settings-sheet__reset"
                hoverClass="settings-sheet__reset--pressed"
                onClick={resetCurrentPage}
              >
                <View className="settings-sheet__copy">
                  <Text className="settings-sheet__label">重置本页</Text>
                  <Text className="settings-sheet__description">
                    恢复计算参数，不影响收藏
                  </Text>
                </View>
                <Text aria-hidden="true" className="settings-sheet__chevron">
                  ›
                </Text>
              </Button>
              <View className="settings-sheet__divider" />
              <View className="settings-sheet__source">
                <Text className="settings-sheet__label">数据来源</Text>
                <Text className="settings-sheet__description">
                  数据素材来源：BWIKI 洛克王国公开资料
                </Text>
                <Text className="settings-sheet__description">
                  使用体验、功能优化或 Bug 反馈：QQ 1215583051
                </Text>
              </View>
              <View className="settings-sheet__divider" />
              <View className="settings-sheet__source">
                <Text className="settings-sheet__label">当前版本</Text>
                <Text className="settings-sheet__description">
                  v{MINIAPP_VERSION} · 更新于 {MINIAPP_UPDATE_DATE}
                </Text>
              </View>
              </View>
            </ScrollView>
          </View>
        </View>
      ) : null}
    </View>
  );
}
