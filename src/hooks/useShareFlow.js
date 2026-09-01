import { useEffect, useRef, useState } from "react";
import {
  assertSnapshotReferences,
  migrateSharedConfiguration,
  replaceConfiguration,
  sameConfigurationVersions,
  shareHashFromInput,
} from "../state/calculator-session.js";
import { decodeShareState, encodeShareState } from "../state/share.js";

export function useShareFlow({
  commitSession,
  configurationReady,
  initialState,
  onToast,
  snapshot,
  state,
  stateRef,
}) {
  const [importDraft, setImportDraft] = useState("");
  const [pendingSharedState, setPendingSharedState] = useState(null);
  const [shareLink, setShareLink] = useState("");
  const [shareOpen, setShareOpen] = useState(false);
  const shareDialogRef = useRef(null);
  const versionDialogRef = useRef(null);

  function applySharedConfiguration(configuration, options) {
    commitSession(
      replaceConfiguration(stateRef.current, configuration, {
        remember: false,
        source: "share",
      }),
      options,
    );
  }

  async function loadSharedState(value) {
    const hash = shareHashFromInput(value);
    const decodedState = await decodeShareState(hash);
    const sharedState = migrateSharedConfiguration(
      decodedState,
      decodedState.versions,
      snapshot,
    );
    assertSnapshotReferences(sharedState, snapshot);
    if (!sameConfigurationVersions(sharedState.versions, initialState.versions)) {
      setPendingSharedState(sharedState);
      return;
    }
    applySharedConfiguration(sharedState);
    onToast("分享配置已载入");
  }

  useEffect(() => {
    if (!globalThis.location?.hash?.startsWith("#v1.")) return undefined;
    let active = true;
    decodeShareState(globalThis.location.hash)
      .then((decodedState) => {
        if (!active) return;
        const sharedState = migrateSharedConfiguration(
          decodedState,
          decodedState.versions,
          snapshot,
        );
        assertSnapshotReferences(sharedState, snapshot);
        if (!sameConfigurationVersions(sharedState.versions, initialState.versions)) {
          setPendingSharedState(sharedState);
        } else {
          applySharedConfiguration(sharedState, { recordHistory: false });
        }
      })
      .catch((error) => {
        if (active) onToast(error.message);
      });
    return () => {
      active = false;
    };
    // 仅在快照初始化变化时读取一次 URL hash，与原 App 内实现保持一致。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialState]);

  async function generateShareLink() {
    if (!configurationReady) {
      setShareLink("");
      return "";
    }
    const hash = await encodeShareState(state);
    globalThis.history?.replaceState?.(null, "", hash);
    const nextShareLink = globalThis.location.href;
    setShareLink(nextShareLink);
    return nextShareLink;
  }

  async function openShareConfiguration() {
    setImportDraft("");
    setShareOpen(true);
    try {
      await generateShareLink();
    } catch (error) {
      onToast(error instanceof Error ? error.message : "分享失败");
    }
  }

  async function copyShareLink() {
    try {
      const link = shareLink || await generateShareLink();
      if (!link) {
        onToast("请先选择双方精灵");
        return;
      }
      if (!globalThis.navigator?.clipboard?.writeText) {
        onToast("复制受限，请手动复制上方链接");
        return;
      }
      try {
        await globalThis.navigator.clipboard.writeText(link);
        onToast("分享链接已复制");
      } catch {
        onToast("复制受限，请手动复制上方链接");
      }
    } catch (error) {
      onToast(error instanceof Error ? error.message : "分享失败");
    }
  }

  const overlayProps = {
    actions: {
      onCloseAll: () => {
        setPendingSharedState(null);
        setShareOpen(false);
      },
      onClose: () => setShareOpen(false),
      onCopy: copyShareLink,
      onImportDraftChange: setImportDraft,
      onImportSubmit: (event) => {
        event.preventDefault();
        const sharedValue = importDraft.trim();
        if (!sharedValue) return;
        loadSharedState(sharedValue)
          .then(() => {
            setShareOpen(false);
            setImportDraft("");
          })
          .catch((error) =>
            onToast(error instanceof Error ? error.message : "导入失败"),
          );
      },
      onPendingClose: () => setPendingSharedState(null),
      onPendingConfirm: () => {
        applySharedConfiguration(
          migrateSharedConfiguration(
            pendingSharedState,
            initialState.versions,
            snapshot,
          ),
        );
        setPendingSharedState(null);
        globalThis.history?.replaceState?.(
          null,
          "",
          `${globalThis.location.pathname}${globalThis.location.search}`,
        );
        onToast("已按当前版本重算，请核对右侧结果");
      },
    },
    importDraft,
    open: shareOpen,
    pendingState: pendingSharedState,
    refs: {
      dialog: shareDialogRef,
      version: versionDialogRef,
    },
    shareLink,
    versions: initialState.versions,
  };

  return { openShareConfiguration, overlayProps };
}
