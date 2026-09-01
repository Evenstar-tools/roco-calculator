import { useState } from "react";
import { Button, ScrollView, Text, View } from "@tarojs/components";
import {
  MINIAPP_RELEASE_LABEL,
  MINIAPP_UPDATE_DATE,
} from "../version.js";

export default function AppHeader({
  commonConfigCount = 0,
  commonConfigStatus,
  dataVersion,
  memoryEnabled = true,
  negativeStatusEnabled = false,
  onImportCommonConfig,
  onMemoryChange,
  onNegativeStatusChange,
  onQuickUndoChange,
  onReset,
  onTeamAnalysisChange,
  onTypeAnalysisChange,
  quickUndoEnabled = true,
  teamAnalysisEnabled = false,
  typeAnalysisEnabled = false,
}) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const resolvedCommonConfigStatus = commonConfigStatus
    ?? (commonConfigCount > 0 ? "update" : "available");
  const commonConfigCurrent = resolvedCommonConfigStatus === "current";

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
          <Text className="app-header__title">洛克计算器 · S3季中</Text>
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
              <Button
                aria-label={commonConfigCurrent
                  ? "PVP热门配置已更新"
                  : "导入PVP热门配置"}
                className={commonConfigCurrent
                  ? "settings-sheet__action-row settings-sheet__action-row--current"
                  : "settings-sheet__action-row"}
                disabled={commonConfigCurrent}
                hoverClass={commonConfigCurrent
                  ? "none"
                  : "settings-sheet__action-row--pressed"}
                onClick={() => onImportCommonConfig?.()}
              >
                <View className="settings-sheet__copy">
                  <Text className="settings-sheet__label">常用精灵配置</Text>
                  <Text className="settings-sheet__description">
                    {commonConfigCurrent
                      ? `当前 ${commonConfigCount} 只，已是最新`
                      : commonConfigCount > 0
                        ? `已有 ${commonConfigCount} 只，更新时保留个人修改`
                        : "一键导入 PVP 热门配置"}
                  </Text>
                </View>
                <Text className="settings-sheet__action-text">
                  {commonConfigCurrent
                    ? "已更新"
                    : commonConfigCount > 0
                      ? "更新"
                      : "一键导入"}
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
              <View className="settings-sheet__row">
                <View className="settings-sheet__copy">
                  <Text className="settings-sheet__label">
                    队伍防守面分析
                  </Text>
                  <Text className="settings-sheet__description">
                    分析六人队伍的属性弱点、抗性与免疫
                  </Text>
                </View>
                <Button
                  aria-checked={teamAnalysisEnabled}
                  aria-label="队伍防守面分析"
                  className={teamAnalysisEnabled
                    ? "settings-sheet__switch settings-sheet__switch--on"
                    : "settings-sheet__switch"}
                  hoverClass="settings-sheet__switch--pressed"
                  onClick={() => onTeamAnalysisChange?.(!teamAnalysisEnabled)}
                  role="switch"
                >
                  <View className="settings-sheet__switch-thumb" />
                </Button>
              </View>
              <View className="settings-sheet__divider" />
              <View className="settings-sheet__row">
                <View className="settings-sheet__copy">
                  <Text className="settings-sheet__label">
                    属性克制与打击面
                  </Text>
                  <Text className="settings-sheet__description">
                    在结果中显示自身弱点、抗性和四技能覆盖
                  </Text>
                </View>
                <Button
                  aria-checked={typeAnalysisEnabled}
                  aria-label="属性克制与打击面"
                  className={typeAnalysisEnabled
                    ? "settings-sheet__switch settings-sheet__switch--on"
                    : "settings-sheet__switch"}
                  hoverClass="settings-sheet__switch--pressed"
                  onClick={() => onTypeAnalysisChange?.(!typeAnalysisEnabled)}
                  role="switch"
                >
                  <View className="settings-sheet__switch-thumb" />
                </Button>
              </View>
              <View className="settings-sheet__divider" />
              <View className="settings-sheet__row">
                <View className="settings-sheet__copy">
                  <Text className="settings-sheet__label">负面状态结算</Text>
                  <Text className="settings-sheet__description">
                    计算灼烧、冻结、寄生、中毒与引电结算
                  </Text>
                </View>
                <Button
                  aria-checked={negativeStatusEnabled}
                  aria-label="负面状态结算"
                  className={negativeStatusEnabled
                    ? "settings-sheet__switch settings-sheet__switch--on"
                    : "settings-sheet__switch"}
                  hoverClass="settings-sheet__switch--pressed"
                  onClick={() => onNegativeStatusChange?.(!negativeStatusEnabled)}
                  role="switch"
                >
                  <View className="settings-sheet__switch-thumb" />
                </Button>
              </View>
              <View className="settings-sheet__divider" />
              <View className="settings-sheet__row">
                <View className="settings-sheet__copy">
                  <Text className="settings-sheet__label">快捷撤回</Text>
                  <Text className="settings-sheet__description">
                    显示一步撤回按钮，避免误触后重复录入
                  </Text>
                </View>
                <Button
                  aria-checked={quickUndoEnabled}
                  aria-label="快捷撤回"
                  className={quickUndoEnabled
                    ? "settings-sheet__switch settings-sheet__switch--on"
                    : "settings-sheet__switch"}
                  hoverClass="settings-sheet__switch--pressed"
                  onClick={() => onQuickUndoChange?.(!quickUndoEnabled)}
                  role="switch"
                >
                  <View className="settings-sheet__switch-thumb" />
                </Button>
              </View>
              <View className="settings-sheet__divider" />
              <View className="settings-sheet__source">
                <Text className="settings-sheet__label">数据来源</Text>
                <Text className="settings-sheet__description">
                  数据快照：{dataVersion || "待确认"}
                </Text>
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
                  {MINIAPP_RELEASE_LABEL}
                </Text>
                <Text className="settings-sheet__description">
                  更新于 {MINIAPP_UPDATE_DATE}
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
