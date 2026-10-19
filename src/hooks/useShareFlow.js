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
import { useLocale } from "../i18n/LocaleContext.jsx";
import { formatShareError } from "../runtime/share-feedback.js";

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
  const shareKind = serverId === "global" ? "configuration-draft" : "configuration";
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
      : /^\/(?:en(?:\/|$)|global(?:\/|$))/.test(path);
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
    if (envelope.kind !== shareKind) {
      throw Object.assign(new TypeError("当前工作区不支持此分享类型"), { code: "SHARE_UNSUPPORTED_KIND" });
    }
    if (serverId === "global") {
      applySharedConfiguration(envelope.payload, { recordHistory: !initial || initialImportHasPreviousSession });
      consumedHashRef.current = hash;
      globalThis.history?.replaceState?.(globalThis.history?.state ?? null, "", `${globalThis.location.pathname}${globalThis.location.search}`);
      if (notify) onToast(t("草稿已载入；占位资料可继续编辑，国际服计算尚未开放"));
      return true;
    }
    if (envelope.protocolVersion === 2 && envelope.gameVersion !== (snapshot.meta?.gameVersion ?? null)) {
      const error = new TypeError("分享游戏版本与当前工作区不匹配");
      error.code = "SHARE_VERSION_MISMATCH";
      throw error;
    }
    const decodedState = envelope.payload;
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
    return serverId === "global" && error?.code?.startsWith("SHARE_")
      ? formatShareError(error, locale) : t(error instanceof Error ? error.message : fallback);
  }

  async function generateShareLink() {
    const scope = scopeRef.current;
    if (!canApply(scope) || (serverId === "cn" && !configurationReady)) {
      setShareLink("");
      return "";
    }
    const hash = await encodeShareEnvelope({
      serverId, gameVersion: serverId === "global" ? null : snapshot.meta?.gameVersion ?? null,
      dataVersion: serverId === "global" ? null : state.versions.data,
      rulesVersion: serverId === "global" ? null : state.versions.rules,
      locale, kind: shareKind, payload: serverId === "global" ? selectConfigurationDraftInputs(state) : selectShareableInputs(state),
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
