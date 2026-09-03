import {
  ArrowsLeftRight,
  CheckCircle,
  Copy,
  PencilSimple,
  Plus,
  Shield,
  Sword,
  Trash,
  UsersThree,
  X,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AbilityWorkbench } from "./AbilityWorkbench.jsx";
import { TeamAnalysisPanel } from "./TeamAnalysisPanel.jsx";
import { TeamMemberEditor } from "./TeamMemberEditor.jsx";
import { TeamRoster } from "./TeamRoster.jsx";

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
  onDeleteTeam,
  onDuplicateTeam,
  onMemberChange,
  onRenameTeam,
  open,
  returnFocusRef,
  snapshot,
  spiritChoices,
  teamsState,
}) {
  const closeRef = useRef(null);
  const closeActionRef = useRef(null);
  const drawerRef = useRef(null);
  const [analysisDirty, setAnalysisDirty] = useState(false);
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
    return globalThis.confirm("能力分析草稿尚未应用，确定丢弃吗？") === true;
  }, [analysisDirty]);

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
    if (!open) return undefined;
    closeRef.current?.focus();
    function handleKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeActionRef.current?.();
      } else {
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
      setMemberPage("ability");
      setAnalysisDirty(false);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [analysisEntry]);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- 换队伍时重置删除确认和选中位，渲染期写入会冲掉当前交互 */
    setDeletePending(false);
    setSelectedIndex(0);
    /* eslint-enable react-hooks/set-state-in-effect */
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
      ? "临时攻击方"
      : "临时防御方"
    : `${selectedIndex + 1}号位`;

  return (
    <div
      className="team-drawer-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <aside
        aria-label="队伍"
        aria-modal="true"
        className="team-drawer team-workbench"
        ref={drawerRef}
        role="dialog"
      >
        <header className="team-drawer__header">
          <div>
            <UsersThree aria-hidden="true" size={22} weight="fill" />
            <h2>队伍</h2>
            <span>{teamsState.teams.length}</span>
          </div>
          <button
            aria-label="关闭队伍"
            className="icon-action"
            onClick={close}
            ref={closeRef}
            title="关闭"
            type="button"
          >
            <X aria-hidden="true" size={20} weight="bold" />
          </button>
        </header>

        <div className="team-drawer__toolbar">
          {teamsState.teams.length ? (
            <select
              aria-label="选择队伍"
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
              {analysisEntry ? "临时分析 · 不占队伍位置" : "还没有队伍"}
            </span>
          )}
          <button
            aria-label="新建队伍"
            onClick={() =>
              navigate(() =>
                onCreateTeam(`队伍 ${teamsState.teams.length + 1}`),
              )
            }
            type="button"
          >
            <Plus aria-hidden="true" size={17} weight="bold" />
            新建
          </button>
          <button
            aria-label="复制队伍"
            disabled={!activeTeam}
            onClick={() => navigate(() => onDuplicateTeam(activeTeam.id))}
            title="复制队伍"
            type="button"
          >
            <Copy aria-hidden="true" size={17} />
            <span className="team-drawer__toolbar-label">复制</span>
          </button>
          <button
            aria-label="删除队伍"
            disabled={!activeTeam}
            onClick={() => setDeletePending(true)}
            title="删除队伍"
            type="button"
          >
            <Trash aria-hidden="true" size={17} />
            <span className="team-drawer__toolbar-label">删除</span>
          </button>
        </div>

        <nav aria-label="队伍面板" className="team-drawer__pane-tabs">
          <button
            aria-pressed={paneMode === "member"}
            onClick={() =>
              navigate(() => {
                setPaneMode("member");
                return true;
              }, paneMode !== "member")
            }
            type="button"
          >
            <UsersThree aria-hidden="true" size={17} weight="fill" />
            成员
          </button>
          <button
            aria-pressed={paneMode === "analysis"}
            disabled={!activeTeam}
            onClick={() =>
              navigate(() => {
                setPaneMode("analysis");
                return true;
              }, paneMode !== "analysis")
            }
            type="button"
          >
            <Shield aria-hidden="true" size={17} weight="fill" />
            队伍分析
          </button>
          <button
            aria-pressed={paneMode === "matchup"}
            disabled={!activeTeam}
            onClick={() =>
              navigate(() => {
                setPaneMode("matchup");
                return true;
              }, paneMode !== "matchup")
            }
            type="button"
          >
            <ArrowsLeftRight aria-hidden="true" size={17} />
            对位
          </button>
        </nav>

        {deletePending && activeTeam ? (
          <div className="team-drawer__confirm" role="alert">
            <span>删除当前队伍？</span>
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
              确认删除
            </button>
            <button onClick={() => setDeletePending(false)} type="button">
              取消
            </button>
          </div>
        ) : null}

        {hasWorkspaceContent ? (
          <div className="team-drawer__content">
            <div className="team-drawer__roster-pane">
              {activeTeam ? (
                <>
                  <label className="team-drawer__name">
                    <span>名称</span>
                    <input
                      aria-label="队伍名称"
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
                    members={activeTeam.members}
                    onApply={onApply}
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
                  <strong>临时配置</strong>
                  <span>从主计算器进入，不会创建队伍或占用槽位。</span>
                </div>
              )}
            </div>

            <main className="team-drawer__editor-pane">
              {paneMode === "member" ? (
                <>
                  <header className="team-workbench__member-header">
                    <div className="team-workbench__identity">
                      {spiritAsset(activeSpirit) ? (
                        <img alt="" src={spiritAsset(activeSpirit)} />
                      ) : null}
                      <div>
                        <h3>
                          {sourceLabel} · {activeSpirit?.fullName ?? "待选择精灵"}
                        </h3>
                        <span>
                          <PencilSimple aria-hidden="true" size={13} />
                          {analysisEntry ? "临时配置" : "队伍配置"}
                        </span>
                        {!analysisEntry ? (
                          <small>
                            <CheckCircle aria-hidden="true" size={14} weight="fill" />
                            更改自动保存
                          </small>
                        ) : null}
                      </div>
                    </div>
                    {activeTeam && !analysisEntry && memberPage === "configure" ? (
                      <div className="team-drawer__capture-actions">
                        <button
                          aria-label={`用当前攻击方填入${selectedIndex + 1}号位`}
                          onClick={() =>
                            navigate(() =>
                              onCaptureSide(
                                "attacker",
                                activeTeam.id,
                                selectedIndex,
                              ),
                            )
                          }
                          title="载入当前攻击方"
                          type="button"
                        >
                          <Sword aria-hidden="true" size={16} weight="bold" />
                          载入当前攻方
                        </button>
                        <button
                          aria-label={`用当前防御方填入${selectedIndex + 1}号位`}
                          onClick={() =>
                            navigate(() =>
                              onCaptureSide(
                                "defender",
                                activeTeam.id,
                                selectedIndex,
                              ),
                            )
                          }
                          title="载入当前防御方"
                          type="button"
                        >
                          <Shield aria-hidden="true" size={16} weight="bold" />
                          载入当前防方
                        </button>
                      </div>
                    ) : null}
                  </header>

                  <div aria-label="成员页面" className="team-workbench__member-tabs">
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
                      成员配置
                    </button>
                    <button
                      aria-pressed={memberPage === "ability"}
                      onClick={() =>
                        navigate(() => {
                          setMemberPage("ability");
                          return true;
                        }, memberPage !== "ability")
                      }
                      type="button"
                    >
                      能力分析
                    </button>
                  </div>

                  {memberPage === "configure" && activeTeam ? (
                    <TeamMemberEditor
                      getSpiritConfiguration={getSpiritConfiguration}
                      index={selectedIndex}
                      member={selectedMember}
                      onChange={(member) =>
                        onMemberChange(activeTeam.id, selectedIndex, member)
                      }
                      onOpenAbilityAnalysis={() => setMemberPage("ability")}
                      snapshot={snapshot}
                      spiritChoices={spiritChoices}
                    />
                  ) : (
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
            <p>还没有队伍</p>
            <button
              className="team-drawer__zero-cta"
              onClick={() => onCreateTeam(`队伍 ${teamsState.teams.length + 1}`)}
              type="button"
            >
              <Plus aria-hidden="true" size={16} weight="bold" />
              新建六人队伍
            </button>
            <p className="team-drawer__zero-hint">
              保存常用阵容，进行属性弱点、能力与对位分析
            </p>
          </div>
        )}
      </aside>
    </div>
  );
}
