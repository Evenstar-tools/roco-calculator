import {
  CaretDown,
  ShieldCheck,
  ShieldWarning,
  WarningCircle,
} from "@phosphor-icons/react";
import { useState } from "react";
import { ElementIcon } from "./ElementIcon.jsx";

function formatMultiplier(value) {
  return Number.isInteger(value) ? String(value) : String(value);
}

function MultiplierSummary({ members, tone }) {
  const groups = new Map();
  members.forEach(({ multiplier }) => {
    groups.set(multiplier, (groups.get(multiplier) ?? 0) + 1);
  });
  if (groups.size === 0) return null;
  return (
    <div className={`team-type-analysis__multiplier-summary is-${tone}`}>
      {[...groups.entries()].map(([multiplier, count]) => (
        <span key={multiplier}>
          ×{formatMultiplier(multiplier)}
          {count > 1 ? <small>· {count}</small> : null}
        </span>
      ))}
    </div>
  );
}

function MemberDetail({ member, tone }) {
  return (
    <li className={`team-type-analysis__member is-${tone}`}>
      <span className="team-type-analysis__slot">{member.slotIndex + 1}</span>
      {member.assetUrl ? (
        <img alt="" src={member.assetUrl} />
      ) : (
        <span aria-hidden="true" className="team-type-analysis__avatar-fallback">
          {member.name.slice(0, 1)}
        </span>
      )}
      <span>{member.name}</span>
      <strong>×{formatMultiplier(member.multiplier)}</strong>
    </li>
  );
}

function DetailGroup({ label, members, tone }) {
  if (members.length === 0) return null;
  return (
    <div className={`team-type-analysis__detail-group is-${tone}`}>
      <div className="team-type-analysis__detail-label">{label}</div>
      <ul>
        {members.map((member) => (
          <MemberDetail
            key={`${member.slotIndex}-${member.spiritId}`}
            member={member}
            tone={tone}
          />
        ))}
      </ul>
    </div>
  );
}

function TypeRow({ expanded, onToggle, row }) {
  const protectedMembers = [...row.resistantMembers, ...row.immuneMembers];
  return (
    <div className={`team-type-analysis__row${expanded ? " is-expanded" : ""}`}>
      <button
        aria-expanded={expanded}
        aria-label={`${row.type}，弱 ${row.weakCount}，抗 ${row.resistanceCount + row.immunityCount}`}
        className="team-type-analysis__row-button"
        onClick={onToggle}
        type="button"
      >
        <span className="team-type-analysis__type">
          <ElementIcon size={22} type={row.type} />
          <strong>{row.type}</strong>
        </span>
        <span className="team-type-analysis__count is-weak">
          <ShieldWarning aria-hidden="true" size={17} weight="fill" />
          <span>弱</span>
          <strong>{row.weakCount}</strong>
        </span>
        <span className="team-type-analysis__count is-resist">
          <ShieldCheck aria-hidden="true" size={17} weight="fill" />
          <span>抗</span>
          <strong>{row.resistanceCount + row.immunityCount}</strong>
        </span>
        <MultiplierSummary members={row.weakMembers} tone="weak" />
        <MultiplierSummary members={protectedMembers} tone="resist" />
        <CaretDown aria-hidden="true" className="team-type-analysis__caret" size={16} />
      </button>
      {expanded ? (
        <div className="team-type-analysis__details">
          <DetailGroup label="弱点成员" members={row.weakMembers} tone="weak" />
          <DetailGroup label="抗性成员" members={protectedMembers} tone="resist" />
        </div>
      ) : null}
    </div>
  );
}

export function TeamTypeAnalysisPanel({ analysis }) {
  const [expandedType, setExpandedType] = useState(null);
  const [mode, setMode] = useState("risk");
  const rows = mode === "risk" ? analysis.riskRows : analysis.rows;

  return (
    <section aria-label="队伍防守面" className="team-type-analysis">
      <header className="team-type-analysis__header">
        <div>
          <ShieldCheck aria-hidden="true" size={20} weight="fill" />
          <h3>防守面</h3>
          <span>{analysis.configuredCount}/6</span>
        </div>
        <div aria-label="分析范围" className="team-type-analysis__modes">
          <button
            aria-pressed={mode === "risk"}
            onClick={() => setMode("risk")}
            type="button"
          >
            重点
          </button>
          <button
            aria-pressed={mode === "all"}
            onClick={() => setMode("all")}
            type="button"
          >
            全部
          </button>
        </div>
      </header>

      {analysis.skippedCount > 0 ? (
        <p className="team-type-analysis__warning" title="精灵数据缺失或配置需要修复">
          <WarningCircle aria-hidden="true" size={16} />
          {analysis.skippedCount} 个成员未计入
        </p>
      ) : null}

      {analysis.configuredCount === 0 ? (
        <div className="team-type-analysis__empty">
          <ShieldCheck aria-hidden="true" size={32} />
          <strong>添加精灵后查看</strong>
          <span>自动统计全队弱点与抗性</span>
        </div>
      ) : rows.length === 0 ? (
        <div className="team-type-analysis__empty is-compact">
          <ShieldCheck aria-hidden="true" size={26} weight="fill" />
          <strong>暂无明显弱点</strong>
        </div>
      ) : (
        <div className="team-type-analysis__rows">
          {rows.map((row) => (
            <TypeRow
              expanded={expandedType === row.type}
              key={row.type}
              onToggle={() =>
                setExpandedType((current) => (current === row.type ? null : row.type))
              }
              row={row}
            />
          ))}
        </div>
      )}
    </section>
  );
}
