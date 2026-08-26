import {
  ArrowsLeftRight,
  Crosshair,
  MagicWand,
  Plus,
  Shield,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import {
  analyzeTeamMatchups,
  analyzeTeamTypes,
} from "../domain/team-type-analysis.js";
import { ElementIcon } from "./ElementIcon.jsx";
import { TeamMemberEditor } from "./TeamMemberEditor.jsx";

function formatMultiplier(value) {
  if (value === null) return "—";
  return `×${value}`;
}

function MultiplierText({ value }) {
  if (value === null) return <span aria-hidden="true">—</span>;
  return (
    <>
      <span aria-hidden="true" className="team-analysis__cell-symbol">×</span>
      <span aria-hidden="true">{value}</span>
    </>
  );
}

function toneForMultiplier(value, mode) {
  if (value === null) return "empty";
  if (mode === "defense") {
    if (value > 1) return "danger";
    if (value < 1) return "safe";
    return "neutral";
  }
  if (value > 1) return "safe";
  if (value < 1) return "danger";
  return "neutral";
}

function MatrixTable({ analysis, mode, onCellSelect }) {
  return (
    <div className="team-analysis__matrix-scroll">
      <table aria-label="队伍防守与打击面矩阵" className="team-analysis__matrix">
        <thead>
          <tr>
            <th scope="col">成员</th>
            {analysis.types.map((type) => (
              <th aria-label={type} key={type} scope="col" title={type}>
                <ElementIcon size={20} type={type} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {analysis.members.map((member) => (
            <tr key={member.slotIndex}>
              <th scope="row" title={member.name}>
                <span>{member.slotIndex + 1}</span>
                {member.assetUrl ? <img alt="" src={member.assetUrl} /> : null}
                <strong className="sr-only">{member.name}</strong>
              </th>
              {member[mode].map((cell) => (
                <td key={cell.type}>
                  <button
                    aria-label={`${member.name} 对${cell.type}${mode === "defense" ? "承伤" : "打击"}${formatMultiplier(cell.multiplier)}`}
                    className={`team-analysis__cell is-${toneForMultiplier(cell.multiplier, mode)}`}
                    onClick={() => onCellSelect({ ...cell, member, mode })}
                    type="button"
                  >
                    <MultiplierText value={cell.multiplier} />
                  </button>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function cloneTeamMembers(members = []) {
  return Array.from({ length: 6 }, (_, index) => {
    const member = members[index];
    if (!member) return null;
    return {
      ...member,
      displayIvs: { ...member.displayIvs },
      skills: {
        ...member.skills,
        four: (member.skills?.four ?? []).map((entry) =>
          entry && typeof entry === "object" ? { ...entry } : entry,
        ),
      },
    };
  });
}

function ManualOpponentEditor({
  getSpiritConfiguration,
  importTeamId,
  members,
  onImport,
  onImportTeamChange,
  onMemberChange,
  onSelect,
  selectedIndex,
  snapshot,
  spiritChoices,
  teams,
}) {
  const [memberEditorOpen, setMemberEditorOpen] = useState(false);
  const spiritById = new Map(
    (snapshot.spirits ?? []).map((spirit) => [spirit.id, spirit]),
  );
  return (
    <section aria-label="现场队伍编辑" className="team-analysis__manual-editor">
      <div className="team-analysis__manual-import">
        <select
          aria-label="导入现有队伍"
          onChange={(event) => onImportTeamChange(event.target.value)}
          value={importTeamId}
        >
          {teams.length ? (
            teams.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.name}
              </option>
            ))
          ) : (
            <option value="">暂无可导入队伍</option>
          )}
        </select>
        <button disabled={!importTeamId} onClick={onImport} type="button">
          导入队伍
        </button>
        <small>导入后仅修改现场副本</small>
      </div>
      <ol aria-label="现场队伍成员" className="team-analysis__manual-roster">
        {members.map((member, index) => {
          const spirit = member ? spiritById.get(member.spiritId) : null;
          return (
            <li key={index}>
              <button
                aria-label={`编辑现场${spirit?.fullName ?? "空位"} ${index + 1}`}
                aria-pressed={selectedIndex === index}
                onClick={() => {
                  onSelect(index);
                  setMemberEditorOpen(true);
                }}
                type="button"
              >
                <span>{index + 1}</span>
                {spirit?.asset?.localUrl ? (
                  <img alt="" src={spirit.asset.localUrl} />
                ) : (
                  <Plus aria-hidden="true" size={20} />
                )}
                <strong>{spirit?.fullName ?? "空位"}</strong>
              </button>
            </li>
          );
        })}
      </ol>
      {memberEditorOpen ? (
        <div className="team-analysis__manual-member">
          <header>
            <strong>现场编辑 · {selectedIndex + 1}号位</strong>
            <div>
              {members[selectedIndex] ? (
                <button onClick={() => onMemberChange(selectedIndex, null)} type="button">
                  清空
                </button>
              ) : null}
              <button
                aria-label="收起现场配置"
                onClick={() => setMemberEditorOpen(false)}
                type="button"
              >
                收起
              </button>
            </div>
          </header>
          <TeamMemberEditor
            getSpiritConfiguration={getSpiritConfiguration}
            index={selectedIndex}
            member={members[selectedIndex]}
            onChange={(member) => onMemberChange(selectedIndex, member)}
            snapshot={snapshot}
            spiritChoices={spiritChoices}
          />
        </div>
      ) : null}
    </section>
  );
}

function MatrixSummary({ analysis, mode }) {
  const cells = analysis.members.flatMap((member) => member[mode]);
  const groups = mode === "defense"
    ? [
        ["抗性", cells.filter(({ multiplier }) => multiplier > 0 && multiplier < 1).length, "safe"],
        ["等倍", cells.filter(({ multiplier }) => multiplier === 1).length, "neutral"],
        ["弱点", cells.filter(({ multiplier }) => multiplier > 1).length, "danger"],
        ["免疫", cells.filter(({ multiplier }) => multiplier === 0).length, "immune"],
      ]
    : [
        ["克制", cells.filter(({ multiplier }) => multiplier > 1).length, "safe"],
        ["等倍", cells.filter(({ multiplier }) => multiplier === 1).length, "neutral"],
        ["受阻", cells.filter(({ multiplier }) => multiplier !== null && multiplier < 1).length, "danger"],
        ["无技能", cells.filter(({ multiplier }) => multiplier === null).length, "empty"],
      ];
  return (
    <aside aria-label={mode === "defense" ? "防守概览" : "打击概览"} className="team-analysis__summary">
      <strong>{mode === "defense" ? "防守概览" : "打击概览"}</strong>
      {groups.map(([label, count, tone]) => (
        <span className={`is-${tone}`} key={label}>
          <i aria-hidden="true" />
          <small>{label}</small>
          <b>{count}</b>
        </span>
      ))}
    </aside>
  );
}

function MatchupTable({ matchup, onCellSelect }) {
  return (
    <div className="team-analysis__matchup-scroll">
      <table aria-label="队伍六乘六对位" className="team-analysis__matchup-table">
        <thead>
          <tr>
            <th scope="col">攻击方 \ 防守方</th>
            {matchup.defenders.map((member) => (
              <th key={member.slotIndex} scope="col">
                {member.assetUrl ? <img alt="" src={member.assetUrl} /> : null}
                <span>{member.name}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matchup.attackers.map((attacker, rowIndex) => (
            <tr key={attacker.slotIndex}>
              <th scope="row">
                {attacker.assetUrl ? <img alt="" src={attacker.assetUrl} /> : null}
                <span>{attacker.name}</span>
              </th>
              {matchup.cells[rowIndex].map((cell, columnIndex) => (
                <td key={cell.defenderSlotIndex}>
                  <button
                    aria-label={`${attacker.name} 对${matchup.defenders[columnIndex]?.name ?? "目标"}打击${formatMultiplier(cell.multiplier)}`}
                    className={`team-analysis__cell is-${toneForMultiplier(cell.multiplier, "offense")}`}
                    onClick={() =>
                      onCellSelect({ ...cell, member: attacker, mode: "matchup" })
                    }
                    type="button"
                  >
                    <MultiplierText value={cell.multiplier} />
                  </button>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function TeamAnalysisPanel({
  getSpiritConfiguration,
  mode = "analysis",
  snapshot,
  spiritChoices,
  team,
  teams,
}) {
  const [includeWishPower, setIncludeWishPower] = useState(false);
  const [isDirectionReversed, setIsDirectionReversed] = useState(false);
  const [matrixMode, setMatrixMode] = useState("defense");
  const [manualImportTeamId, setManualImportTeamId] = useState(
    teams?.[0]?.id ?? "",
  );
  const [manualMembers, setManualMembers] = useState(() => Array(6).fill(null));
  const [manualSelectedIndex, setManualSelectedIndex] = useState(0);
  const [selectedCell, setSelectedCell] = useState(null);
  const view = mode;
  useEffect(() => {
    setSelectedCell(null);
  }, [mode]);
  const analysis = useMemo(
    () =>
      analyzeTeamTypes({
        includeWishPower,
        learnsets: snapshot.learnsets,
        members: team?.members ?? [],
        skills: snapshot.skills,
        spirits: snapshot.spirits,
        typeChart: snapshot.typeChart,
      }),
    [
      includeWishPower,
      snapshot.learnsets,
      snapshot.skills,
      snapshot.spirits,
      snapshot.typeChart,
      team?.members,
    ],
  );
  const matchupOpponent = {
    id: "manual-opponent",
    members: manualMembers,
    name: "现场队伍",
  };
  const matchup = useMemo(
    () =>
      analyzeTeamMatchups({
        attackers: isDirectionReversed
          ? matchupOpponent?.members ?? []
          : team?.members ?? [],
        defenders: isDirectionReversed
          ? team?.members ?? []
          : matchupOpponent?.members ?? [],
        includeWishPower,
        learnsets: snapshot.learnsets,
        skills: snapshot.skills,
        spirits: snapshot.spirits,
        typeChart: snapshot.typeChart,
      }),
    [
      includeWishPower,
      isDirectionReversed,
      matchupOpponent?.members,
      snapshot.learnsets,
      snapshot.skills,
      snapshot.spirits,
      snapshot.typeChart,
      team?.members,
    ],
  );
  return (
    <section aria-label="队伍分析" className={`team-analysis is-${view}`}>
      {view === "analysis" ? (
        <>
          <div className="team-analysis__toolbar">
            <div aria-label="矩阵类型" className="team-analysis__mode-tabs">
              <button
                aria-pressed={matrixMode === "defense"}
                onClick={() => {
                  setMatrixMode("defense");
                  setSelectedCell(null);
                }}
                type="button"
              >
                <Shield aria-hidden="true" size={17} weight="fill" />
                防守承伤
              </button>
              <button
                aria-pressed={matrixMode === "offense"}
                onClick={() => {
                  setMatrixMode("offense");
                  setSelectedCell(null);
                }}
                type="button"
              >
                <Crosshair aria-hidden="true" size={17} />
                技能打击面
              </button>
            </div>
            <label className="team-analysis__wish-toggle">
              <MagicWand aria-hidden="true" size={17} />
              愿力冲击
              <input
                aria-label="计入愿力冲击"
                checked={includeWishPower}
                onChange={(event) => setIncludeWishPower(event.target.checked)}
                type="checkbox"
              />
            </label>
          </div>
          {analysis.members.length ? (
            <div className="team-analysis__matrix-layout">
              <MatrixTable
                analysis={analysis}
                mode={matrixMode}
                onCellSelect={setSelectedCell}
              />
              <div className="team-analysis__summaries">
                <MatrixSummary analysis={analysis} mode="defense" />
                <MatrixSummary analysis={analysis} mode="offense" />
              </div>
            </div>
          ) : (
            <div className="team-analysis__empty">添加精灵后查看分析</div>
          )}
        </>
      ) : (
        <>
          <ManualOpponentEditor
            getSpiritConfiguration={getSpiritConfiguration}
            importTeamId={manualImportTeamId}
            members={manualMembers}
            onImport={() => {
              const source = (teams ?? []).find(
                (candidate) => candidate.id === manualImportTeamId,
              );
              if (source) setManualMembers(cloneTeamMembers(source.members));
              setSelectedCell(null);
            }}
            onImportTeamChange={setManualImportTeamId}
            onMemberChange={(index, member) => {
              setManualMembers((current) =>
                current.map((entry, memberIndex) =>
                  memberIndex === index ? member : entry,
                ),
              );
              setSelectedCell(null);
            }}
            onSelect={setManualSelectedIndex}
            selectedIndex={manualSelectedIndex}
            snapshot={snapshot}
            spiritChoices={spiritChoices}
            teams={teams ?? []}
          />
          {matchupOpponent?.members?.some(Boolean) ? (
            <>
              <div className="team-analysis__matchup-controls">
                <span>{team.name}</span>
                <button
                  aria-label="切换攻击方向"
                  onClick={() => {
                    setIsDirectionReversed((current) => !current);
                    setSelectedCell(null);
                  }}
                  title="切换攻击方向"
                  type="button"
                >
                  <ArrowsLeftRight aria-hidden="true" size={21} />
                </button>
                <span>现场队伍</span>
              </div>
              <MatchupTable matchup={matchup} onCellSelect={setSelectedCell} />
            </>
          ) : (
            <div className="team-analysis__empty">添加现场对手后查看对位</div>
          )}
        </>
      )}
      {selectedCell ? (
        <div aria-label="单元格详情" className="team-analysis__source-strip">
          {selectedCell.member.assetUrl ? (
            <img alt="" src={selectedCell.member.assetUrl} />
          ) : null}
          <strong>{selectedCell.member.name}</strong>
          <span>→</span>
          {selectedCell.skillType ? (
            <ElementIcon label size={24} type={selectedCell.skillType} />
          ) : null}
          <span>{selectedCell.skillName ?? selectedCell.type}</span>
          <strong>{formatMultiplier(selectedCell.multiplier)}</strong>
        </div>
      ) : null}
    </section>
  );
}
