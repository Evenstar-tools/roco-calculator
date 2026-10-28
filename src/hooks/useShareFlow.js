import { useEffect, useRef, useState } from "react";
import { WEBSITE_URL } from "../data/product-links.js";
import {
  assertSnapshotReferences,
  migrateSharedConfiguration,
  replaceConfiguration,
  sameConfigurationVersions,
} from "../state/calculator-session.js";
import { decodeShareEnvelope, encodeShareEnvelope, selectConfigurationDraftInputs, selectShareableInputs, shareHashFromInput } from "../state/share.js";
import { useRuntime } from "../runtime/RuntimeContext.jsx";
import { routeFor } from "../runtime/routes.js";
import { migrateGlobalDraftState } from "../runtime/global-session-migration.js";
import { useLocale } from "../i18n/LocaleContext.jsx";
import { UI_MESSAGES } from "../i18n/messages.js";
import { formatShareError } from "../runtime/share-feedback.js";
import { IS_PREVIEW_BUILD } from "../runtime/preview-channel.js";
import { correctS5PreviewReferences } from "../features/s5-preview/reference-corrections.js";

export function useShareFlow({
  active = true,
  serverId: serverOverride,
  locale: localeOverride,
  shareRequestId: shareRequestOverride,
  onCrossServerShare,
  commitSession,
  configurationReady,
  initialState,
  initialImportHasPreviousSession = false,
  onToast,
  snapshot,
  state,
  stateRef,
}) {
  const runtime = useRuntime();
  const { t } = useLocale();
  const serverId = serverOverride ?? runtime.serverId;
  const locale = localeOverride ?? runtime.locale;
  const shareRequestId = shareRequestOverride ?? runtime.shareRequestId ?? 0;
  const offerCrossServerShare = onCrossServerShare ?? runtime.onShareConflict;
  const draftOnly = serverId === "global" && !snapshot?.meta?.id;
  const shareKind = draftOnly ? "configuration-draft" : "configuration";
  const [importDraft, setImportDraft] = useState("");
  const [pendingSharedState, setPendingSharedState] = useState(null);
  const [shareLink, setShareLink] = useState("");
  const [shareOpen, setShareOpen] = useState(false);
  const shareDialogRef = useRef(null);
  const versionDialogRef = useRef(null);
  const scopeRef = useRef(0);
  const importRef = useRef(0);
  const pendingRequestRef = useRef(null);
  const consumedHashRef = useRef("");
  const handledShareRequestRef = useRef(shareRequestId);
  const sessionKey = `${serverId}:${active}`;
  const [sessionIdentity, setSessionIdentity] = useState(sessionKey);

  if (sessionIdentity !== sessionKey) {
    setSessionIdentity(sessionKey);
    setPendingSharedState(null);
    setShareOpen(false);
    setShareLink("");
  }

  useEffect(() => {
    scopeRef.current += 1;
    return () => { scopeRef.current += 1; };
  }, [active, initialState, serverId]);

  function canApply(scope, request = importRef.current) {
    const path = globalThis.location?.pathname ?? "";
    const wrongPath = serverId === "global" ? /^\/(?:cn|dianlu)(?:\/|$)/.test(path)
      : /^\/(?:en(?:\/|$)|jp(?:\/|$)|global(?:\/|$))/.test(path);
    return active && scope === scopeRef.current && request === importRef.current && !wrongPath;
  }

  function applySharedConfiguration(configuration, options) {
    if (!canApply(scopeRef.current)) return;
    commitSession(
      replaceConfiguration(stateRef.current, configuration, {
        remember: false,
        source: "share",
        serverId,
      }),
      options,
    );
  }

  async function loadSharedState(value, { initial = false, notify = true } = {}) {
    const scope = scopeRef.current;
    const request = ++importRef.current;
    if (!canApply(scope, request)) return false;
    setPendingSharedState(null);
    const hash = shareHashFromInput(value);
    const envelope = await decodeShareEnvelope(hash);
    if (!canApply(scope, request)) return false;
    if (envelope.serverId !== serverId) {
      if (offerCrossServerShare) { offerCrossServerShare(envelope, hash); return true; }
      throw Object.assign(new TypeError("分享服务器与当前工作区不匹配"), { code: "SHARE_SERVER_MISMATCH" });
    }
    if (envelope.kind !== shareKind && !(serverId === "global" && envelope.kind === "configuration-draft")) {
      throw Object.assign(new TypeError("当前工作区不支持此分享类型"), { code: "SHARE_UNSUPPORTED_KIND" });
    }
    if (envelope.kind === "configuration-draft") {
      const payload = draftOnly ? envelope.payload : migrateGlobalDraftState(envelope.payload, initialState);
      if (!draftOnly) assertSnapshotReferences(payload, snapshot);
      applySharedConfiguration(payload, { recordHistory: !initial || initialImportHasPreviousSession });
      consumedHashRef.current = hash;
      globalThis.history?.replaceState?.(globalThis.history?.state ?? null, "", `${globalThis.location.pathname}${globalThis.location.search}`);
      if (notify) onToast(t("配置已载入"));
      return true;
    }
    if (envelope.protocolVersion === 2 && envelope.gameVersion !== (snapshot.meta?.gameVersion ?? null)) {
      const error = new TypeError("分享游戏版本与当前工作区不匹配");
      error.code = "SHARE_VERSION_MISMATCH";
      throw error;
    }
    const decodedState = IS_PREVIEW_BUILD ? correctS5PreviewReferences(envelope.payload) : envelope.payload;
    const sharedState = migrateSharedConfiguration(
      decodedState,
      decodedState.versions,
      snapshot,
    );
    assertSnapshotReferences(sharedState, snapshot);
    if (!sameConfigurationVersions(sharedState.versions, initialState.versions)) {
      pendingRequestRef.current = { scope, request };
      setPendingSharedState(sharedState);
      return true;
    }
    applySharedConfiguration(sharedState, { recordHistory: !initial || initialImportHasPreviousSession });
    consumedHashRef.current = hash;
    if (notify) onToast(t("分享配置已载入"));
    return true;
  }

  useEffect(() => {
    if (!active) return undefined;
    const explicitRequest = handledShareRequestRef.current !== shareRequestId;
    handledShareRequestRef.current = shareRequestId;
    let cancelled = false;
    function readHash(initial = false) {
      const scope = scopeRef.current;
      importRef.current += 1;
      // 隐藏会话不能抢先读取另一服的分享。
      const hash = globalThis.location?.hash ?? "";
      if (!canApply(scope) || !/^#v\d+\./.test(hash) || (initial && hash === consumedHashRef.current)) return;
      const loading = loadSharedState(hash, { initial, notify: false });
      const request = importRef.current;
      loading.catch((error) => { if (!cancelled && canApply(scope, request)) onToast(shareFailure(error, "导入失败")); });
    }
    const onHashChange = () => readHash(false);
    readHash(!explicitRequest);
    window.addEventListener("hashchange", onHashChange);
    return () => {
      cancelled = true;
      window.removeEventListener("hashchange", onHashChange);
    };
    // 状态回填读取stateRef；只随快照与会话激活重绑，避免编辑时重复导入。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialState, active, serverId, shareRequestId]);

  function shareFailure(error, fallback) {
    if (serverId === "global" && error?.code?.startsWith("SHARE_")) return formatShareError(error, locale);
    const source = error instanceof Error && (locale === "zh-CN" || UI_MESSAGES[error.message]?.[locale])
      ? error.message : fallback === "导入失败"
        ? "无法导入配置，请检查分享链接或分享码后重试。"
        : "无法生成分享链接，请重试。";
    return t(source);
  }

  async function generateShareLink() {
    const scope = scopeRef.current;
    if (!canApply(scope) || (!draftOnly && !configurationReady)) {
      setShareLink("");
      return "";
    }
    const hash = await encodeShareEnvelope({
      serverId, gameVersion: draftOnly ? null : snapshot.meta?.gameVersion ?? null,
      dataVersion: draftOnly ? null : state.versions.data,
      rulesVersion: draftOnly ? null : state.versions.rules,
      locale, kind: shareKind, payload: draftOnly ? selectConfigurationDraftInputs(state) : selectShareableInputs(state),
    });
    if (!canApply(scope)) return "";
    consumedHashRef.current = hash;
    globalThis.history?.replaceState?.(globalThis.history?.state ?? null, "", hash);
    const nextShareLink = `${WEBSITE_URL.replace(/\/$/, "")}${routeFor(serverId, locale)}${hash}`;
    setShareLink(nextShareLink);
    return nextShareLink;
  }

  async function openShareConfiguration() {
    if (!canApply(scopeRef.current)) return;
    const scope = scopeRef.current;
    setImportDraft("");
    setShareOpen(true);
    try {
      await generateShareLink();
    } catch (error) {
      if (canApply(scope)) onToast(shareFailure(error, "分享失败"));
    }
  }

  async function copyShareLink() {
    const scope = scopeRef.current;
    if (!canApply(scope)) return;
    try {
      const link = shareLink || await generateShareLink();
      if (!canApply(scope)) return;
      if (!link) {
        onToast(t("请先选择双方精灵"));
        return;
      }
      if (!globalThis.navigator?.clipboard?.writeText) {
        onToast(t("复制受限，请手动复制上方链接"));
        return;
      }
      try {
        await globalThis.navigator.clipboard.writeText(link);
        if (canApply(scope)) onToast(t("分享链接已复制"));
      } catch {
        if (canApply(scope)) onToast(t("复制受限，请手动复制上方链接"));
      }
    } catch (error) {
      if (canApply(scope)) onToast(shareFailure(error, "分享失败"));
    }
  }

  const overlayProps = {
    actions: {
      onCloseAll: () => {
        importRef.current += 1;
        setPendingSharedState(null);
        setShareOpen(false);
      },
      onClose: () => { importRef.current += 1; setShareOpen(false); },
      onCopy: copyShareLink,
      onImportDraftChange: setImportDraft,
      onImportSubmit: (event) => {
        event.preventDefault();
        const sharedValue = importDraft.trim();
        if (!sharedValue) return;
        const scope = scopeRef.current;
        const loading = loadSharedState(sharedValue);
        const request = importRef.current;
        loading.then((applied) => {
            if (!applied || !canApply(scope, request)) return;
            setShareOpen(false);
            setImportDraft("");
          })
          .catch((error) => {
            if (canApply(scope, request)) onToast(shareFailure(error, "导入失败"));
          });
      },
      onPendingClose: () => setPendingSharedState(null),
      onPendingConfirm: () => {
        const pendingRequest = pendingRequestRef.current;
        if (!pendingSharedState || !pendingRequest || !canApply(pendingRequest.scope, pendingRequest.request)) return;
        applySharedConfiguration(
          migrateSharedConfiguration(
            pendingSharedState,
            initialState.versions,
            snapshot,
          ),
        );
        setPendingSharedState(null);
        globalThis.history?.replaceState?.(
          globalThis.history?.state ?? null,
          "",
          `${globalThis.location.pathname}${globalThis.location.search}`,
        );
        onToast(t("已按当前版本重算，请核对右侧结果"));
      },
    },
    importDraft,
    open: active && shareOpen,
    pendingState: active ? pendingSharedState : null,
    refs: {
      dialog: shareDialogRef,
      version: versionDialogRef,
    },
    shareLink,
    versions: initialState.versions,
  };

  return { openShareConfiguration, overlayProps };
}
