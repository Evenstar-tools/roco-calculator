import { useRuntime } from "../runtime/RuntimeContext.jsx";
import { useLocale } from "../i18n/LocaleContext.jsx";
import { createServerStorage } from "../state/server-storage.js";
import { useMemo, useRef, useState, useSyncExternalStore } from "react";
import { getFormConfigPreferences } from "../state/form-config-preferences.js";
import { FEEDBACK_QQ } from "../components/DataSourceDialog.jsx";
import { FEATURED_USER_RELEASE } from "../data/user-release-notes.js";
import {
  readCompactOptionLabelsSetting,
  readDamageComparisonSetting,
  readDurabilityOverviewSetting,
  readPowerDisplayMode,
  readTypeCoverageSetting,
  writeDamageComparisonSetting,
  writeCompactOptionLabelsSetting,
  writeDurabilityOverviewSetting,
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
  const { serverId } = useRuntime();
  const { t } = useLocale();
  const storage = useMemo(() => { try { return createServerStorage(serverId); } catch { return null; } }, [serverId]);
  const formPrefs = getFormConfigPreferences(serverId);
  const [cleanupConfigsOpen, setCleanupConfigsOpen] = useState(false);
  const [dataSourceOpen, setDataSourceOpen] = useState(false);
  const [displaySettingsOpen, setDisplaySettingsOpen] = useState(false);
  const [compactOptionLabelsEnabled, setCompactOptionLabelsEnabled] = useState(
    () => readCompactOptionLabelsSetting(storage),
  );
  const formConfigMemoryEnabled = useSyncExternalStore(
    formPrefs.subscribe, formPrefs.readMemoryEnabled, () => false,
  );
  const [damageComparisonEnabled, setDamageComparisonEnabled] = useState(
    () => readDamageComparisonSetting(storage),
  );
  const [durabilityOverviewEnabled, setDurabilityOverviewEnabled] = useState(
    () => readDurabilityOverviewSetting(storage),
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileResultOpen, setMobileResultOpen] = useState(false);
  const [productAccessOpen, setProductAccessOpen] = useState(false);
  const [teamAnalysisEntry, setTeamAnalysisEntry] = useState(null);
  const [teamOpen, setTeamOpen] = useState(false);
  const [whatsNewOpen, setWhatsNewOpen] = useState(false);
  const [powerDisplayMode, setPowerDisplayMode] = useState(() =>
    readPowerDisplayMode(storage),
  );
  const [typeCoverageEnabled, setTypeCoverageEnabled] = useState(() =>
    readTypeCoverageSetting(storage),
  );
  const drawerCloseRef = useRef(null);
  const menuButtonRef = useRef(null);
  const mobileResultRestoreFocusRef = useRef(true);
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
    initialView: dataSourceOpen === "release" ? "release" : "",
    onClose: () => setDataSourceOpen(false),
    onCopyFeedback: async () => {
      if (!globalThis.navigator?.clipboard?.writeText) {
        onToast(t("反馈 QQ：{number}", { number: FEEDBACK_QQ }));
        return;
      }
      try {
        await globalThis.navigator.clipboard.writeText(FEEDBACK_QQ);
        onToast(t("反馈 QQ 已复制"));
      } catch {
        onToast(t("反馈 QQ：{number}", { number: FEEDBACK_QQ }));
      }
    },
    open: dataSourceOpen,
  };

  const productAccessProps = {
    onClose: () => setProductAccessOpen(false),
    open: productAccessOpen,
  };

  const displaySettingsProps = {
    compactOptionLabelsEnabled,
    formConfigMemoryEnabled,
    onFormConfigMemoryChange: formPrefs.writeMemoryEnabled,
    damageComparisonEnabled,
    durabilityOverviewEnabled,
    negativeStatusSettlementEnabled: negativeStatusEnabled,
    onClose: () => setDisplaySettingsOpen(false),
    onCompactOptionLabelsChange: (enabled) => {
      setCompactOptionLabelsEnabled(writeCompactOptionLabelsSetting(storage, enabled));
    },
    onDamageComparisonChange: (enabled) => {
      setDamageComparisonEnabled(writeDamageComparisonSetting(storage, enabled));
    },
    onNegativeStatusSettlementChange: (enabled) => {
      const value = writeNegativeStatusSettlementSetting(storage, enabled);
      dispatch({
        type: "calculation-option/set-negative-status",
        value,
      });
    },
    onDurabilityOverviewChange: (enabled) => {
      setDurabilityOverviewEnabled(
        writeDurabilityOverviewSetting(storage, enabled),
      );
    },
    onPowerDisplayModeChange: (mode) => {
      setPowerDisplayMode(writePowerDisplayMode(storage, mode));
    },
    onTypeCoverageChange: (enabled) => {
      setTypeCoverageEnabled(writeTypeCoverageSetting(storage, enabled));
    },
    open: displaySettingsOpen,
    powerDisplayMode,
    typeCoverageEnabled,
  };

  const mobileResultProps = {
    actions: {
      onClose: ({ restoreFocus = true } = {}) => {
        mobileResultRestoreFocusRef.current = restoreFocus;
        setMobileResultOpen(false);
      },
      onCurrentHpChange: (currentHp) => updateDirection({ currentHp }),
      onCurrentHpPercentChange: (currentHpPercent) =>
        updateDirection({ context: { currentHpPercent } }),
      onDirectionToggle,
      onOpen: () => {
        mobileResultRestoreFocusRef.current = true;
        setMobileResultOpen(true);
      },
    },
    configurationReady,
    open: mobileResultOpen,
    refs: {
      close: drawerCloseRef,
      drawer: resultDrawerRef,
      restoreFocus: mobileResultRestoreFocusRef,
      trigger: mobileResultTriggerRef,
    },
    result: resultModel,
    showTypeCoverage: typeCoverageEnabled,
    viewMode,
  };

  return {
    cleanupConfigsProps,
    compactOptionLabelsEnabled,
    damageComparisonEnabled,
    dataSourceProps,
    displaySettingsProps,
    durabilityOverviewEnabled,
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
    setWhatsNewOpen,
    team: {
      analysisEntry: teamAnalysisEntry,
      buttonRef: teamsButtonRef,
      close: () => {
        setTeamOpen(false);
        setTeamAnalysisEntry(null);
      },
      open: teamOpen,
      openAbilityAnalysis: (entry) => {
        setTeamAnalysisEntry(entry);
        setTeamOpen(true);
      },
      setAnalysisEntry: setTeamAnalysisEntry,
      setOpen: setTeamOpen,
    },
    typeCoverageEnabled,
    whatsNewProps: {
      onClose: () => setWhatsNewOpen(false),
      open: whatsNewOpen,
      release: FEATURED_USER_RELEASE,
      version: FEATURED_USER_RELEASE.version,
    },
  };
}
