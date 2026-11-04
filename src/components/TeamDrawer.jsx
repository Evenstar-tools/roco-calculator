import { useToolLocale as useLocale } from "../i18n/useToolLocale.js";
import { publicResourceUrl } from "../runtime/public-resource-url.js";
import { useRuntime } from "../runtime/RuntimeContext.jsx";
import {
  CaretDown,
  DownloadSimple,
  DotsThree,
  UploadSimple,
  CheckCircle,
  Copy,
  PencilSimple,
  Plus,
  Trash,
  UsersThree,
  X,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AbilityWorkbench } from "./AbilityWorkbench.jsx";
import { createTeamMember } from "../state/team-presets.js";
import { analyzeTeamTypes } from "../domain/team-type-analysis.js";
import { useMediaQuery } from "../hooks/useMediaQuery.js";
import { ElementIcon } from "./ElementIcon.jsx";
import { TeamAnalysisPanel } from "./TeamAnalysisPanel.jsx";
import { teamWeaknessRows } from "./TeamWeaknessSummary.jsx";
import { TeamMemberEditor } from "./TeamMemberEditor.jsx";
import { TeamRoster } from "./TeamRoster.jsx";
import { TeamExchange } from "./TeamExchange.jsx";
import { isShortcutInput } from "../state/shortcut-settings.js";
import { SpiritImage } from "./SpiritImage.jsx";

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

// 原生 details 做轻量菜单：点外部、选中按钮或按 Esc 都收起，不额外引入菜单库。
function DrawerMenu({ children, className, label, summary }) {
  const ref = useRef(null);
  useEffect(() => {
    function dismiss(event) {
      if (ref.current?.open && !ref.current.contains(event.target)) ref.current.open = false;
    }
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, []);
  return (
    <details
      className={`team-drawer__menu ${className}`}
      onClick={(event) => { if (event.target.closest("button")) ref.current.open = false; }}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !ref.current.open) return;
        event.preventDefault();
        ref.current.open = false;
        ref.current.querySelector("summary")?.focus();
      }}
      ref={ref}
    >
      <summary aria-label={label} title={label}>{summary}</summary>
      <div>{children}</div>
    </details>
  );
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
  const { t, typeName } = useLocale();
  const { serverId, release } = useRuntime();
  const compact = useMediaQuery("(max-width: 719px)");
  const wide = useMediaQuery("(min-width: 1280px)");
  const analysisAvailable = release.capabilities.calculate && (serverId !== "global" || Boolean(snapshot.meta?.id));
  const closeRef = useRef(null);
  const closeActionRef = useRef(null);
  const drawerRef = useRef(null);
  const importedIndexRef = useRef(null);
  const shortcutActionRef = useRef(null);
  const [analysisDirty, setAnalysisDirty] = useState(false);
  const [exchangeMode, setExchangeMode] = useState(null);
  const [deletePending, setDeletePending] = useState(false);
  const [memberPage, setMemberPage] = useState("configure");
  const [hideSkillDescriptions, setHideSkillDescriptions] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [renaming, setRenaming] = useState(false);
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
  const overview = useMemo(
    () => wide && activeTeam && analysisAvailable
      ? teamWeaknessRows(analyzeTeamTypes({
          learnsets: snapshot.learnsets,
          members: activeTeam.members,
          skills: snapshot.skills,
          spirits: snapshot.spirits,
          typeChart: snapshot.typeChart,
        })).slice(0, 5)
      : null,
    [wide, activeTeam, analysisAvailable, snapshot],
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
    setRenaming(false);
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

  const currentTab = paneMode === "member" || !analysisAvailable
    ? analysisAvailable ? memberPage : "configure"
    : paneMode;
  const tabs = [
    ["configure", t("成员配置"), !activeTeam],
    ["ability", t("能力分析"), !analysisAvailable || !(activeTeam || analysisEntry)],
    ["analysis", t("属性覆盖"), !activeTeam || !analysisAvailable],
    ["matchup", t("对位"), !activeTeam || !analysisAvailable],
  ];
  const selectTab = (tab) => navigate(() => {
    setExchangeMode(null);
    if (tab === "configure" || tab === "ability") {
      setPaneMode("member");
      setMemberPage(tab);
    } else setPaneMode(tab);
    return true;
  }, Boolean(exchangeMode || tab !== currentTab));
  const commitRename = () => {
    setRenaming(false);
    if (activeTeam && nameDraft.trim() && nameDraft !== activeTeam.name) onRenameTeam(activeTeam.id, nameDraft);
    else setNameDraft(activeTeam?.name ?? "");
  };
  const primaryActions = (
    <>
      <button
        aria-label={t("新建队伍")}
        onClick={() =>
          navigate(() =>
            onCreateTeam(t("队伍 {count}", { count: teamsState.teams.length + 1 })),
          )
        }
        title={t("新建队伍")}
        type="button"
      >
        <Plus aria-hidden="true" size={17} weight="bold" />
        <span className="team-drawer__toolbar-label">{t("新建")}</span>
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
    </>
  );

  const renderMemberHeader = (picker) => (
    <header className="team-workbench__member-header">
      {picker ?? (
        <div className="team-workbench__identity">
          {spiritAsset(activeSpirit) ? (
            <SpiritImage name={activeSpirit?.fullName} alt="" src={spiritAsset(activeSpirit)} />
          ) : null}
          <div>
            <h3>{t(sourceLabel)} · {t(activeSpirit?.fullName ?? t("待选择精灵"))}</h3>
            {analysisEntry ? null : (
              <button aria-label={t("更换精灵")} title={t("更换精灵")} type="button" onClick={() => navigate(() => {
                setMemberPage("configure");
                requestAnimationFrame(() => {
                  const picker = drawerRef.current?.querySelector('.team-member-editor input[role="combobox"]');
                  picker?.scrollIntoView({ block: "center" });
                  picker?.focus({ preventScroll: true });
                });
                return true;
              })}>
                <CaretDown aria-hidden="true" size={13} weight="bold" />{t("更换")}
              </button>
            )}
            <p>
              {analysisEntry ? <span>{t("临时配置")}</span> : null}
              {(activeSpirit?.types ?? []).map((type) => <span key={type}>{typeName(type)}</span>)}
              {activeSpirit?.stage ? <span>{t(activeSpirit.stage)}</span> : null}
            </p>
          </div>
        </div>
      )}
      {activeTeam && !analysisEntry ? (
        <div className="team-drawer__capture-actions">
          {["attacker", "defender"].map((side) => {
            const name = side === "attacker" ? t("攻击方") : t("防御方");
            return (
              <button
                aria-label={t("设为{side}", { side: name })}
                data-side={side}
                disabled={!selectedMember || selectedMember.needsRepair}
                key={side}
                onClick={() => navigate(() => onApply(side, selectedMember))}
                title={t("将{index}号位设为{side}", { index: selectedIndex + 1, side: name })}
                type="button"
              >
                <svg aria-hidden="true" width="18" height="18" fill="currentColor" viewBox="0 0 256 256">
                  <use href={publicResourceUrl("/assets/ui/team-actions.svg#set")} />
                </svg>
                {t("设为{side}", { side: name })}
              </button>
            );
          })}
          <DrawerMenu
            className="team-drawer__copy-menu"
            label={t("从计算器复制")}
            summary={<>
              <svg aria-hidden="true" className="team-capture-icon" width="18" height="18" fill="currentColor" viewBox="0 0 256 256">
                <use href={publicResourceUrl("/assets/ui/team-actions.svg#copy")} />
              </svg>
              <span>{t("从计算器复制")}</span>
              <CaretDown aria-hidden="true" size={12} weight="bold" />
            </>}
          >
            {["attacker", "defender"].map((side) => {
              const name = side === "attacker" ? t("攻击方") : t("防御方");
              return (
                <button
                  aria-label={t("用当前{side}填入{index}号位", { side: name, index: selectedIndex + 1 })}
                  data-side={side}
                  key={side}
                  onClick={() => navigate(() => onCaptureSide(side, activeTeam.id, selectedIndex))}
                  type="button"
                >
                  {t("从{side}复制", { side: name })}
                </button>
              );
            })}
          </DrawerMenu>
        </div>
      ) : null}
    </header>
  );

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
          <div className="team-drawer__title">
            <UsersThree aria-hidden="true" size={22} weight="fill" />
            <h2>{t("队伍")}</h2>
          </div>
          <div className="team-drawer__toolbar">
            <div className="team-drawer__switcher">
              {renaming && activeTeam ? (
                <input
                  aria-label={t("队伍名称")}
                  autoFocus
                  onBlur={commitRename}
                  onChange={(event) => setNameDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      commitRename();
                    } else if (event.key === "Escape") {
                      event.preventDefault();
                      setNameDraft(activeTeam.name);
                      setRenaming(false);
                    }
                  }}
                  value={nameDraft}
                />
              ) : teamsState.teams.length ? (
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
              {activeTeam && !renaming ? (
                <button aria-label={t("重命名队伍")} className="team-drawer__rename" onClick={() => setRenaming(true)} title={t("重命名队伍")} type="button">
                  <PencilSimple aria-hidden="true" size={15} />
                </button>
              ) : null}
            </div>
            {activeTeam ? (
              <span className="team-drawer__meta">
                {t("{count}/6 · 共 {total} 队", { count: activeTeam.members.filter(Boolean).length, total: teamsState.teams.length })}
              </span>
            ) : null}
            {activeTeam ? (
              <small className="team-workbench__saved">
                <CheckCircle aria-hidden="true" size={14} weight="fill" />
                {t("已自动保存")}
              </small>
            ) : null}
            {compact ? null : primaryActions}
            <DrawerMenu
              className="team-drawer__more"
              label={t("更多队伍操作")}
              summary={<DotsThree aria-hidden="true" size={22} weight="bold" />}
            >
              {compact ? primaryActions : null}
              <button
                aria-label={t("复制队伍")}
                disabled={!activeTeam}
                onClick={() => navigate(() => onDuplicateTeam(activeTeam.id))}
                type="button"
              >
                <Copy aria-hidden="true" size={17} />
                <span className="team-drawer__toolbar-label">{t("复制队伍")}</span>
              </button>
              <button
                aria-label={t("删除队伍")}
                className="is-danger"
                disabled={!activeTeam}
                onClick={() => setDeletePending(true)}
                type="button"
              >
                <Trash aria-hidden="true" size={17} />
                <span className="team-drawer__toolbar-label">{t("删除队伍")}</span>
              </button>
            </DrawerMenu>
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

        <nav aria-label={t("队伍面板")} className="team-drawer__pane-tabs">
          {tabs.flatMap(([tab, label, disabled], index) => [
            index === 2 ? <span aria-hidden="true" className="team-drawer__tab-divider" key="divider" /> : null,
            <button
              aria-pressed={currentTab === tab}
              disabled={disabled}
              key={tab}
              onClick={() => selectTab(tab)}
              title={disabled && !analysisAvailable && tab !== "configure" ? t("当前服务器暂不支持此分析") : undefined}
              type="button"
            >
              {label}
            </button>,
          ])}
          {hasWorkspaceContent ? (
            <small className="team-drawer__scope">
              {currentTab === "analysis" || currentTab === "matchup"
                ? t("整队 · {name}", { name: activeTeam?.name ?? "" })
                : t("当前成员 · {name}", { name: analysisEntry ? t(sourceLabel) : `${t(sourceLabel)} ${t(activeSpirit?.fullName ?? t("空位"))}` })}
            </small>
          ) : null}
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
          <div className="team-drawer__content" data-pane={paneMode === "member" || !analysisAvailable ? "member" : "team"}>
            <div className="team-drawer__roster-pane">
              {activeTeam ? (
                <>
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
                  {overview?.length ? (
                    <section aria-label={t("队伍速览")} className="team-drawer__overview">
                      <h3>{t("队伍速览")}<small>{t("弱点最多的属性")}</small></h3>
                      <button onClick={() => selectTab("analysis")} title={t("查看属性覆盖")} type="button">
                        {overview.map((row) => (
                          <span className={row.resistant.length ? undefined : "is-uncovered"} key={row.type}>
                            <ElementIcon size={18} type={row.type} />
                            <b>{typeName(row.type)}</b>
                            <small>{t("{count} 只怕", { count: row.members.length })}</small>
                            <em>{row.resistant.length ? t("{count} 只抗", { count: row.resistant.length }) : t("无人抵抗")}</em>
                          </span>
                        ))}
                      </button>
                    </section>
                  ) : null}
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
                  {(memberPage === "configure" || !analysisAvailable) && activeTeam ? (
                    <TeamMemberEditor
                      getSpiritConfiguration={getSpiritConfiguration}
                      hideSkillDescriptions={hideSkillDescriptions}
                      index={selectedIndex}
                      member={selectedMember}
                      members={activeTeam.members}
                      onChange={(member) =>
                        onMemberChange(activeTeam.id, selectedIndex, member)
                      }
                      renderHeader={renderMemberHeader}
                      onHideSkillDescriptionsChange={setHideSkillDescriptions}
                      snapshot={snapshot}
                      spiritChoices={spiritChoices}
                    />
                  ) : !analysisAvailable ? <p role="status">{t("当前服务器暂不支持此分析")}</p> : (
                    <>
                      {renderMemberHeader()}
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
                    </>
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
