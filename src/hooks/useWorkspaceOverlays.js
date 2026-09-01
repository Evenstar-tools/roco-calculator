import { useRef, useState } from "react";
import { FEEDBACK_QQ } from "../components/DataSourceDialog.jsx";
import {
  readPowerDisplayMode,
  readTypeCoverageSetting,
  writeNegativeStatusSettlementSetting,
  writePowerDisplayMode,
  writeTypeCoverageSetting,
} from "../state/display-settings.js";

export function useWorkspaceOverlays({
  configurationReady,
  dispatch,
  negativeStatusEnabled,
  onCleanupConfirm,
  onDirectionToggle,
  onToast,
  resultModel,
  updateDirection,
  viewMode,
}) {
  const [cleanupConfigsOpen, setCleanupConfigsOpen] = useState(false);
  const [dataSourceOpen, setDataSourceOpen] = useState(false);
  const [displaySettingsOpen, setDisplaySettingsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileResultOpen, setMobileResultOpen] = useState(false);
  const [productAccessOpen, setProductAccessOpen] = useState(false);
  const [teamOpen, setTeamOpen] = useState(false);
  const [powerDisplayMode, setPowerDisplayMode] = useState(() =>
    readPowerDisplayMode(),
  );
  const [typeCoverageEnabled, setTypeCoverageEnabled] = useState(() =>
    readTypeCoverageSetting(),
  );
  const drawerCloseRef = useRef(null);
  const menuButtonRef = useRef(null);
  const menuRef = useRef(null);
  const mobileResultTriggerRef = useRef(null);
  const resultDrawerRef = useRef(null);
  const teamsButtonRef = useRef(null);

  const cleanupConfigsProps = {
    onCancel: () => setCleanupConfigsOpen(false),
    onConfirm: () => {
      const message = onCleanupConfirm();
      setCleanupConfigsOpen(false);
      onToast(message);
    },
    open: cleanupConfigsOpen,
  };

  const dataSourceProps = {
    onClose: () => setDataSourceOpen(false),
    onCopyFeedback: async () => {
      if (!globalThis.navigator?.clipboard?.writeText) {
        onToast(`反馈 QQ：${FEEDBACK_QQ}`);
        return;
      }
      try {
        await globalThis.navigator.clipboard.writeText(FEEDBACK_QQ);
        onToast("反馈 QQ 已复制");
      } catch {
        onToast(`反馈 QQ：${FEEDBACK_QQ}`);
      }
    },
    open: dataSourceOpen,
  };

  const productAccessProps = {
    onClose: () => setProductAccessOpen(false),
    open: productAccessOpen,
  };

  const displaySettingsProps = {
    negativeStatusSettlementEnabled: negativeStatusEnabled,
    onClose: () => setDisplaySettingsOpen(false),
    onNegativeStatusSettlementChange: (enabled) => {
      const value = writeNegativeStatusSettlementSetting(undefined, enabled);
      dispatch({
        type: "calculation-option/set-negative-status",
        value,
      });
    },
    onPowerDisplayModeChange: (mode) => {
      setPowerDisplayMode(writePowerDisplayMode(undefined, mode));
    },
    onTypeCoverageChange: (enabled) => {
      setTypeCoverageEnabled(writeTypeCoverageSetting(undefined, enabled));
    },
    open: displaySettingsOpen,
    powerDisplayMode,
    typeCoverageEnabled,
  };

  const mobileResultProps = {
    actions: {
      onClose: () => setMobileResultOpen(false),
      onCurrentHpChange: (currentHp) => updateDirection({ currentHp }),
      onCurrentHpPercentChange: (currentHpPercent) =>
        updateDirection({ context: { currentHpPercent } }),
      onDirectionToggle,
      onOpen: () => setMobileResultOpen(true),
    },
    configurationReady,
    open: mobileResultOpen,
    refs: {
      close: drawerCloseRef,
      drawer: resultDrawerRef,
      trigger: mobileResultTriggerRef,
    },
    result: resultModel,
    showTypeCoverage: typeCoverageEnabled,
    viewMode,
  };

  return {
    cleanupConfigsProps,
    dataSourceProps,
    displaySettingsProps,
    menu: {
      buttonRef: menuButtonRef,
      open: menuOpen,
      ref: menuRef,
      setOpen: setMenuOpen,
    },
    mobileResultProps,
    powerDisplayMode,
    productAccessProps,
    setCleanupConfigsOpen,
    setDataSourceOpen,
    setDisplaySettingsOpen,
    setProductAccessOpen,
    team: {
      buttonRef: teamsButtonRef,
      open: teamOpen,
      setOpen: setTeamOpen,
    },
    typeCoverageEnabled,
  };
}
