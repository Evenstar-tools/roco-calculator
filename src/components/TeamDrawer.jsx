import {
  Copy,
  Plus,
  Shield,
  Sword,
  Trash,
  UsersThree,
  X,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";
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

export function TeamDrawer({
  onActiveTeamChange,
  onApply,
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
  teamsState,
}) {
  const closeRef = useRef(null);
  const drawerRef = useRef(null);
  const [deletePending, setDeletePending] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const activeTeam =
    teamsState.teams.find((team) => team.id === teamsState.activeTeamId) ??
    null;

  const close = useCallback(() => {
    onClose();
    queueMicrotask(() => returnFocusRef?.current?.focus());
  }, [onClose, returnFocusRef]);

  useEffect(() => {
    if (!open) return undefined;
    closeRef.current?.focus();
    function handleKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
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
  }, [close, open]);

  useEffect(() => {
    setNameDraft(activeTeam?.name ?? "");
    setDeletePending(false);
    setSelectedIndex(0);
  }, [activeTeam?.id, activeTeam?.name]);

  if (!open) return null;

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
        className="team-drawer"
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
              onChange={(event) => onActiveTeamChange(event.target.value)}
              value={teamsState.activeTeamId ?? ""}
            >
              {teamsState.teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          ) : (
            <span className="team-drawer__empty-label">还没有队伍</span>
          )}
          <button
            aria-label="新建队伍"
            onClick={() => onCreateTeam(`队伍 ${teamsState.teams.length + 1}`)}
            type="button"
          >
            <Plus aria-hidden="true" size={17} weight="bold" />
            新建
          </button>
          <button
            aria-label="复制队伍"
            disabled={!activeTeam}
            onClick={() => onDuplicateTeam(activeTeam.id)}
            title="复制队伍"
            type="button"
          >
            <Copy aria-hidden="true" size={17} />
          </button>
          <button
            aria-label="删除队伍"
            disabled={!activeTeam}
            onClick={() => setDeletePending(true)}
            title="删除队伍"
            type="button"
          >
            <Trash aria-hidden="true" size={17} />
          </button>
        </div>

        {deletePending && activeTeam ? (
          <div className="team-drawer__confirm" role="alert">
            <span>删除当前队伍？</span>
            <button
              onClick={() => {
                onDeleteTeam(activeTeam.id);
                setDeletePending(false);
              }}
              type="button"
            >
              确认删除
            </button>
            <button onClick={() => setDeletePending(false)} type="button">
              取消
            </button>
          </div>
        ) : null}

        {activeTeam ? (
          <div className="team-drawer__content">
            <div className="team-drawer__roster-pane">
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
                onSelect={setSelectedIndex}
                selectedIndex={selectedIndex}
                snapshot={snapshot}
              />
            </div>
            <div className="team-drawer__editor-pane">
              <div className="team-drawer__capture-actions">
                <span>{selectedIndex + 1}号位</span>
                <button
                  aria-label={`用当前攻击方填入${selectedIndex + 1}号位`}
                  onClick={() =>
                    onCaptureSide("attacker", activeTeam.id, selectedIndex)
                  }
                  title="存入当前攻击方"
                  type="button"
                >
                  <Sword aria-hidden="true" size={16} weight="bold" />
                  存攻方
                </button>
                <button
                  aria-label={`用当前防御方填入${selectedIndex + 1}号位`}
                  onClick={() =>
                    onCaptureSide("defender", activeTeam.id, selectedIndex)
                  }
                  title="存入当前防御方"
                  type="button"
                >
                  <Shield aria-hidden="true" size={16} weight="bold" />
                  存防方
                </button>
              </div>
              <TeamMemberEditor
                index={selectedIndex}
                member={activeTeam.members[selectedIndex]}
                onChange={(member) =>
                  onMemberChange(activeTeam.id, selectedIndex, member)
                }
                snapshot={snapshot}
              />
            </div>
          </div>
        ) : (
          <div className="team-drawer__zero">
            <UsersThree aria-hidden="true" size={38} />
            <p>新建一支六人队伍</p>
          </div>
        )}
      </aside>
    </div>
  );
}
