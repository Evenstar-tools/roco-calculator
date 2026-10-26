import { useLocale } from "../i18n/LocaleContext.jsx";
import { publicResourceUrl } from "../runtime/public-resource-url.js";
import { useRuntime } from "../runtime/RuntimeContext.jsx";
import {
  ArrowsLeftRight,
  DownloadSimple,
  UploadSimple,
  CheckCircle,
  Copy,
  PencilSimple,
  Plus,
  Shield,
  Trash,
  UsersThree,
  X,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AbilityWorkbench } from "./AbilityWorkbench.jsx";
import { createTeamMember } from "../state/team-presets.js";
import { TeamAnalysisPanel } from "./TeamAnalysisPanel.jsx";
import { TeamMemberEditor } from "./TeamMemberEditor.jsx";
import { TeamRoster } from "./TeamRoster.jsx";
import { TeamExchange } from "./TeamExchange.jsx";
import { isShortcutInput } from "../state/shortcut-settings.js";

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function trapFocus(event, container) {
  if (event.key !== "Tab" || !container) return;
  const focusable = [...container.querySelectorAll(FOCUSABLE_SELECTOR)];
  if (focusable.length === 0) return;
  const first = focusable[0];
  const last = focusable.at(-1);
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function spiritAsset(spirit) {
  return spirit?.asset?.localUrl ?? spirit?.assetUrl ?? null;
}

export function TeamDrawer({
  analysisEntry = null,
  getSpiritConfiguration,
  onActiveTeamChange,
  onAnalysisEntryClear,
  onApply,
  onApplyAnalysisSide,
  onCaptureSide,
  onClose,
  onCreateTeam,
  onImportTeam,
  onUpdateLineup,
  onDeleteTeam,
  onDuplicateTeam,
  onMemberChange,
  onMemberMove,
  onRenameTeam,
  open,
  returnFocusRef,
  snapshot,
  spiritChoices,
  teamsState,
  shortcutSettings = { enabled: true, bindings: { team: "t" } },
}) {
  const { t } = useLocale();
  const { serverId } = useRuntime();
  const analysisAvailable = serverId === "cn";
  const closeRef = useRef(null);
  const closeActionRef = useRef(null);
  const drawerRef = useRef(null);
  const importedIndexRef = useRef(null);
  const shortcutActionRef = useRef(null);
  const [analysisDirty, setAnalysisDirty] = useState(false);
  const [exchangeMode, setExchangeMode] = useState(null);
  const [deletePending, setDeletePending] = useState(false);
  const [memberPage, setMemberPage] = useState("configure");
  const [nameDraft, setNameDraft] = useState("");
  const [paneMode, setPaneMode] = useState("member");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const activeTeam =
    teamsState.teams.find((team) => team.id === teamsState.activeTeamId) ??
    null;
  const selectedMember = activeTeam?.members[selectedIndex] ?? null;
  const activeConfiguration = analysisEntry?.configuration ?? selectedMember;
  const activeSpirit = useMemo(
    () =>
      (snapshot.spirits ?? []).find(
        (candidate) => candidate.id === activeConfiguration?.spiritId,
      ) ?? null,
    [activeConfiguration?.spiritId, snapshot.spirits],
  );
  const analysisSource = analysisEntry
    ? { kind: "side", side: analysisEntry.side }
    : {
        index: selectedIndex,
        kind: "member",
        teamId: activeTeam?.id ?? null,
      };

  const canDiscardDraft = useCallback(() => {
    if (!analysisDirty) return true;
    if (typeof globalThis.confirm !== "function") return true;
    return globalThis.confirm(t("能力分析草稿尚未应用，确定丢弃吗？")) === true;
  }, [analysisDirty, t]);

  const close = useCallback(() => {
    if (!canDiscardDraft()) return;
    setAnalysisDirty(false);
    onAnalysisEntryClear?.();
    onClose();
    queueMicrotask(() => returnFocusRef?.current?.focus());
  }, [canDiscardDraft, onAnalysisEntryClear, onClose, returnFocusRef]);

  function navigate(action, shouldNavigate = true) {
    if (!shouldNavigate) return false;
    if (!canDiscardDraft()) return false;
    const result = action();
    if (result !== false) setAnalysisDirty(false);
    return result;
  }

  useEffect(() => {
    closeActionRef.current = close;
  }, [close]);

  useEffect(() => {
    shortcutActionRef.current = (event) => {
      if (!shortcutSettings.enabled || event.defaultPrevented || event.repeat || event.isComposing || event.keyCode === 229 || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey || isShortcutInput(event.target)) return;
      if (event.key.toLowerCase() === shortcutSettings.bindings.team) { event.preventDefault(); close(); return; }
      if (!activeTeam || exchangeMode || deletePending || !/^[1-6]$/.test(event.key)) return;
      const index = Number(event.key) - 1;
      event.preventDefault();
      navigate(() => { onAnalysisEntryClear?.(); setSelectedIndex(index); setPaneMode("member"); return true; }, Boolean(analysisEntry || index !== selectedIndex || paneMode !== "member"));
    };
  });

  useEffect(() => {
    if (!open) return undefined;
    closeRef.current?.focus();
    function handleKeyDown(event) {
      if (event.defaultPrevented) return;
      if (event.key === "Escape") {
        event.preventDefault();
        closeActionRef.current?.();
      } else {
        shortcutActionRef.current?.(event);
        trapFocus(event, drawerRef.current);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- 外部入口和队伍切换都需要同步重置工作台导航，不应在渲染期改状态 */
    if (analysisEntry) {
      setPaneMode("member");
      setMemberPage(analysisAvailable ? "ability" : "configure");
      setAnalysisDirty(false);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [analysisEntry, analysisAvailable]);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- 换队伍时重置删除确认和选中位，渲染期写入会冲掉当前交互 */
    setDeletePending(false);
    setSelectedIndex(importedIndexRef.current ?? 0);
    /* eslint-enable react-hooks/set-state-in-effect */
    if (importedIndexRef.current !== null) {
      const frame = requestAnimationFrame(() => {
        drawerRef.current?.querySelector('.team-member-editor__stats input')?.focus();
        importedIndexRef.current = null;
      });
      return () => cancelAnimationFrame(frame);
    }
  }, [activeTeam?.id]);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- 外部队名变化需要同步到命名草稿，但不应重置当前成员 */
    setNameDraft(activeTeam?.name ?? "");
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [activeTeam?.name]);

  if (!open) return null;

  const hasWorkspaceContent = Boolean(activeTeam || analysisEntry);
  const sourceLabel = analysisEntry
    ? analysisEntry.side === "attacker"
      ? t("临时攻击方")
      : t("临时防御方")
    : t("{index}号位", { index: selectedIndex + 1 });

  return (
    <div
      className="team-drawer-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <aside
        aria-label={t("队伍")}
        aria-modal="true"
        className="team-drawer team-workbench"
        data-empty={!activeTeam}
        ref={drawerRef}
        role="dialog"
      >
        <header className="team-drawer__header">
          <div>
            <UsersThree aria-hidden="true" size={22} weight="fill" />
            <h2>{t("队伍")}</h2>
            <span>{teamsState.teams.length}</span>
          </div>
          <button
            aria-label={t("关闭队伍")}
            className="icon-action"
            onClick={close}
            ref={closeRef}
            title={t("关闭")}
            type="button"
          >
            <X aria-hidden="true" size={20} weight="bold" />
          </button>
        </header>

        <div className="team-drawer__toolbar">
          {teamsState.teams.length ? (
            <select
              aria-label={t("选择队伍")}
              onChange={(event) =>
                navigate(() => {
                  onAnalysisEntryClear?.();
                  return onActiveTeamChange(event.target.value);
                }, event.target.value !== teamsState.activeTeamId)
              }
              value={teamsState.activeTeamId ?? ""}
            >
              {teamsState.teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          ) : (
            <span className="team-drawer__empty-label">
              {analysisEntry ? t("临时分析 · 不占队伍位置") : t("还没有队伍")}
            </span>
          )}
          <button
            aria-label={t("新建队伍")}
            onClick={() =>
              navigate(() =>
                onCreateTeam(t("队伍 {count}", { count: teamsState.teams.length + 1 })),
              )
            }
            type="button"
          >
            <Plus aria-hidden="true" size={17} weight="bold" />
            <span className="team-drawer__toolbar-label">{t("新建")}</span>
          </button>
          <button
            aria-label={t("复制队伍")}
            disabled={!activeTeam}
            onClick={() => navigate(() => onDuplicateTeam(activeTeam.id))}
            title={t("复制队伍")}
            type="button"
          >
            <Copy aria-hidden="true" size={17} />
            <span className="team-drawer__toolbar-label">{t("复制")}</span>
          </button>
          <button
            aria-label={t("删除队伍")}
            disabled={!activeTeam}
            onClick={() => setDeletePending(true)}
            title={t("删除队伍")}
            type="button"
          >
            <Trash aria-hidden="true" size={17} />
            <span className="team-drawer__toolbar-label">{t("删除")}</span>
          </button>
          <button aria-label={t("导入阵容")} title={t("导入阵容")} type="button"
            onClick={() => navigate(() => setExchangeMode("import"))}>
            <DownloadSimple aria-hidden="true" size={17} />
            <span className="team-drawer__toolbar-label">{t("导入")}</span>
          </button>
          <button aria-label={t("导出阵容")} title={t("导出阵容")} type="button" disabled={!activeTeam}
            onClick={() => navigate(() => setExchangeMode("export"))}>
            <UploadSimple aria-hidden="true" size={17} />
            <span className="team-drawer__toolbar-label">{t("导出")}</span>
          </button>
        </div>

        <nav aria-label={t("队伍面板")} className="team-drawer__pane-tabs">
          <button
            aria-pressed={paneMode === "member"}
            onClick={() =>
              navigate(() => {
                setExchangeMode(null);
                setPaneMode("member");
                return true;
              }, Boolean(exchangeMode || paneMode !== "member"))
            }
            type="button"
          >
            <UsersThree aria-hidden="true" size={17} weight="fill" />
            {t("成员")}
          </button>
          <button
            aria-pressed={paneMode === "analysis"}
            disabled={!activeTeam || !analysisAvailable}
            title={!analysisAvailable ? t("国际服规则尚未核验，分析暂不可用") : undefined}
            onClick={() =>
              navigate(() => {
                setExchangeMode(null);
                setPaneMode("analysis");
                return true;
              }, Boolean(exchangeMode || paneMode !== "analysis"))
            }
            type="button"
          >
            <Shield aria-hidden="true" size={17} weight="fill" />
            {t("队伍分析")}
          </button>
          <button
            aria-pressed={paneMode === "matchup"}
            disabled={!activeTeam || !analysisAvailable}
            title={!analysisAvailable ? t("国际服规则尚未核验，分析暂不可用") : undefined}
            onClick={() =>
              navigate(() => {
                setExchangeMode(null);
                setPaneMode("matchup");
                return true;
              }, Boolean(exchangeMode || paneMode !== "matchup"))
            }
            type="button"
          >
            <ArrowsLeftRight aria-hidden="true" size={17} />
            {t("对位")}
          </button>
        </nav>

        {deletePending && activeTeam ? (
          <div className="team-drawer__confirm" role="alert">
            <span>{t("删除当前队伍？")}</span>
            <button
              onClick={() =>
                navigate(() => {
                  const deleted = onDeleteTeam(activeTeam.id);
                  if (deleted === false) return false;
                  setDeletePending(false);
                  return true;
                })
              }
              type="button"
            >
              {t("确认删除")}
            </button>
            <button onClick={() => setDeletePending(false)} type="button">
              {t("取消")}
            </button>
          </div>
        ) : null}

        {exchangeMode ? (
          <TeamExchange
            key={`${exchangeMode}-${activeTeam?.id ?? "empty"}`}
            mode={exchangeMode}
            team={activeTeam}
            snapshot={snapshot}
            onCancel={() => setExchangeMode(null)}
            onUpdateLineup={onUpdateLineup}
            onImport={(team) => {
              if (onImportTeam?.(team) !== true) return false;
              importedIndexRef.current = Math.max(0, team.members.findIndex(Boolean));
              onAnalysisEntryClear?.();
              setPaneMode("member");
              setMemberPage("configure");
              setExchangeMode(null);
              return true;
            }}
          />
        ) : hasWorkspaceContent ? (
          <div className="team-drawer__content">
            <div className="team-drawer__roster-pane">
              {activeTeam ? (
                <>
                  <label className="team-drawer__name">
                    <span>{t("名称")}</span>
                    <input
                      aria-label={t("队伍名称")}
                      onBlur={() => {
                        if (nameDraft !== activeTeam.name) {
                          onRenameTeam(activeTeam.id, nameDraft);
                        }
                      }}
                      onChange={(event) => setNameDraft(event.target.value)}
                      value={nameDraft}
                    />
                  </label>
                  <TeamRoster
                    key={activeTeam.id}
                    members={activeTeam.members}
                    onApply={onApply}
                    onReorder={onMemberMove ? (from, to) => navigate(() => {
                      if (onMemberMove(activeTeam.id, from, to) === false) return false;
                      setSelectedIndex((current) => current === from ? to
                        : from < to && current > from && current <= to ? current - 1
                        : to < from && current >= to && current < from ? current + 1 : current);
                      return true;
                    }) : undefined}
                    onSelect={(index) =>
                      navigate(() => {
                        onAnalysisEntryClear?.();
                        setSelectedIndex(index);
                        return true;
                      }, Boolean(analysisEntry || index !== selectedIndex))
                    }
                    selectedIndex={analysisEntry ? -1 : selectedIndex}
                    snapshot={snapshot}
                  />
                </>
              ) : (
                <div className="team-workbench__transient-source">
                  <strong>{t("临时配置")}</strong>
                  <span>{t("从主计算器进入，不会创建队伍或占用槽位。")}</span>
                </div>
              )}
            </div>

            <main className="team-drawer__editor-pane">
              {paneMode === "member" || !analysisAvailable ? (
                <>
                  <header className="team-workbench__member-header">
                    <div className="team-workbench__identity">
                      {spiritAsset(activeSpirit) ? (
                        <img alt="" src={spiritAsset(activeSpirit)} />
                      ) : null}
                      <div>
                        <h3>
                          {sourceLabel} · {activeSpirit?.fullName ?? t("待选择精灵")}
                        </h3>
                        {analysisEntry ? <span>{t("临时配置")}</span> : (
                          <button type="button" onClick={() => navigate(() => {
                            setMemberPage("configure");
                            requestAnimationFrame(() => {
                              const picker = drawerRef.current?.querySelector('.team-member-editor input[role="combobox"]');
                              picker?.scrollIntoView({ block: "center" });
                              picker?.focus({ preventScroll: true });
                            });
                            return true;
                          })}>
                            <PencilSimple aria-hidden="true" size={13} />{t("更换精灵")}
                          </button>
                        )}
                        {!analysisEntry ? (
                          <small>
                            <CheckCircle aria-hidden="true" size={14} weight="fill" />
                            {t("更改自动保存")}
                          </small>
                        ) : null}
                      </div>
                    </div>
                    {activeTeam && !analysisEntry && memberPage === "configure" ? (
                      <div className="team-drawer__capture-actions">
                        {[true, false].flatMap((apply) => ["attacker", "defender"].map((side) => {
                          const name = side === "attacker" ? t("攻击方") : t("防御方");
                          const label = apply ? t("设为{side}", { side: name }) : t("从{side}复制", { side: name });
                          return (
                            <button
                              aria-label={apply ? label : t("用当前{side}填入{index}号位", { side: name, index: selectedIndex + 1 })}
                              data-side={side}
                              disabled={apply && (!selectedMember || selectedMember.needsRepair)}
                              key={`${side}-${apply}`}
                              onClick={() => navigate(() => apply
                                ? onApply(side, selectedMember)
                                : onCaptureSide(side, activeTeam.id, selectedIndex))}
                              title={apply ? t("将{index}号位设为{side}", { index: selectedIndex + 1, side: name }) : label}
                              type="button"
                            >
                              <svg aria-hidden="true" className={apply ? undefined : "team-capture-icon"} width="18" height="18" fill="currentColor" viewBox="0 0 256 256">
                                <use href={publicResourceUrl(`/assets/ui/team-actions.svg#${apply ? "set" : "copy"}`)} />
                              </svg>
                              {label}
                            </button>
                          );
                        }))}
                      </div>
                    ) : null}
                  </header>

                  <div aria-label={t("成员页面")} className="team-workbench__member-tabs">
                    <button
                      aria-pressed={memberPage === "configure"}
                      disabled={!activeTeam}
                      onClick={() =>
                        navigate(() => {
                          setMemberPage("configure");
                          return true;
                        }, memberPage !== "configure")
                      }
                      type="button"
                    >
                      {t("成员配置")}
                    </button>
                    <button
                      aria-pressed={memberPage === "ability"}
                      disabled={!analysisAvailable}
                      title={!analysisAvailable ? t("国际服规则尚未核验，分析暂不可用") : undefined}
                      onClick={() =>
                        navigate(() => {
                          setMemberPage("ability");
                          return true;
                        }, memberPage !== "ability")
                      }
                      type="button"
                    >
                      {t("能力分析")}
                    </button>
                  </div>

                  {(memberPage === "configure" || !analysisAvailable) && activeTeam ? (
                    <TeamMemberEditor
                      getSpiritConfiguration={getSpiritConfiguration}
                      index={selectedIndex}
                      member={selectedMember}
                      members={activeTeam.members}
                      onChange={(member) =>
                        onMemberChange(activeTeam.id, selectedIndex, member)
                      }
                      onOpenAbilityAnalysis={() => setMemberPage("ability")}
                      snapshot={snapshot}
                      spiritChoices={spiritChoices}
                    />
                  ) : !analysisAvailable ? <p role="status">{t("国际服规则尚未核验，分析暂不可用")}</p> : (
                    <AbilityWorkbench
                      configuration={activeConfiguration}
                      onApplyMember={
                        activeTeam && !analysisEntry
                          ? (member) => {
                              const applied = onMemberChange(
                                activeTeam.id,
                                selectedIndex,
                                member,
                              );
                              if (applied !== false) setAnalysisDirty(false);
                              return applied;
                            }
                          : undefined
                      }
                      onApplySide={
                        analysisEntry
                          ? (configuration) => {
                              const applied = onApplyAnalysisSide?.(
                                analysisEntry.side,
                                configuration,
                              );
                              if (applied !== false) setAnalysisDirty(false);
                              return applied;
                            }
                          : undefined
                      }
                      onDirtyChange={setAnalysisDirty}
                      snapshot={snapshot}
                      source={analysisSource}
                    />
                  )}
                </>
              ) : (
                <TeamAnalysisPanel
                  onApplyCandidate={(spirit, template) => { const config = getSpiritConfiguration(spirit.id) ?? createTeamMember(snapshot, spirit.id); onApply?.("defender", { ...config, spiritId: spirit.id, displayIvs: { ...template.displayIvs }, natureId: template.natureId }); onClose(); }}
                  getSpiritConfiguration={getSpiritConfiguration}
                  mode={paneMode}
                  snapshot={snapshot}
                  spiritChoices={spiritChoices}
                  team={activeTeam}
                  teams={teamsState.teams}
                />
              )}
            </main>
          </div>
        ) : (
          <div className="team-drawer__zero">
            <UsersThree aria-hidden="true" size={38} />
            <p>{t("还没有队伍")}</p>
            <div className="team-drawer__zero-actions">
              <button
                className="team-drawer__zero-cta"
                onClick={() => onCreateTeam(t("队伍 {count}", { count: teamsState.teams.length + 1 }))}
                type="button"
              >
                <Plus aria-hidden="true" size={16} weight="bold" />
                {t(analysisAvailable ? "新建六人队伍" : "新建空队伍")}
              </button>
              <button
                aria-label={t("导入已有阵容")}
                className="team-drawer__zero-import"
                onClick={() => navigate(() => setExchangeMode("import"))}
                type="button"
              >
                <DownloadSimple aria-hidden="true" size={17} />
                {t("导入")}
              </button>
            </div>
            <p className="team-drawer__zero-hint">
              {t(analysisAvailable ? "保存常用阵容，进行属性弱点、能力与对位分析" : "保存队伍草稿，配置成员与技能")}
            </p>
          </div>
        )}
      </aside>
    </div>
  );
}
