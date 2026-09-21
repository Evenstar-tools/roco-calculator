import { Shield, Sword, WarningCircle, Wrench } from "@phosphor-icons/react";
import { getNature } from "../domain/natures.js";
import { getBossBloodlineConflicts } from "../domain/skill-loadout.js";
import { ElementIcon } from "./ElementIcon.jsx";

function entryId(entry) {
  if (typeof entry === "string") return entry;
  return entry?.skillId ?? entry?.id ?? null;
}

function MemberActions({ member, name, onApply }) {
  return (
    <div className="team-slot__actions">
      {[["attacker", Sword, "攻击方", "攻"], ["defender", Shield, "防御方", "防"]].map(([side, Icon, label, short]) => (
        <button
          aria-label={name + "设为" + label}
          disabled={!member || member.needsRepair}
          key={side}
          onClick={() => onApply(side, member)}
          title={"设为" + label}
          type="button"
        >
          <Icon aria-hidden="true" size={16} weight="bold" />{short}
        </button>
      ))}
    </div>
  );
}

export function TeamRoster({
  members,
  onApply,
  onSelect,
  selectedIndex,
  snapshot,
}) {
  const spirits = new Map(
    (snapshot.spirits ?? []).map((spirit) => [spirit.id, spirit]),
  );
  const skills = new Map(
    (snapshot.skills ?? []).map((skill) => [skill.id, skill]),
  );

  return (
    <>
    <ol aria-label="队伍成员" className="team-roster">
      {Array.from({ length: 6 }, (_, index) => {
        const member = members[index] ?? null;
        const spirit = member ? spirits.get(member.spiritId) : null;
        const name = spirit?.fullName ?? (member ? "需修复" : `空位 ${index + 1}`);
        const conflicts = getBossBloodlineConflicts(snapshot, member);
        return (
          <li
            className={`team-slot${selectedIndex === index ? " is-selected" : ""}${member?.needsRepair ? " needs-repair" : ""}${conflicts.length ? " has-bloodline-conflict" : ""}`}
            key={index}
          >
            <button
              aria-label={`编辑${name}`}
              aria-pressed={selectedIndex === index}
              title={`${index + 1}号位 · ${name}`}
              className="team-slot__select"
              onClick={() => onSelect(index)}
              type="button"
            >
              <span aria-hidden="true" className="team-slot__number">{index + 1}</span>
              {conflicts.length ? <span className="team-slot__bloodline-flag" role="img" aria-label="血脉技能与首领冲突" title={`首领与血脉技能冲突：${conflicts.map(skill => skill.name).join("、")}`}><WarningCircle aria-hidden="true" size={16} weight="fill" /></span> : null}
              {spirit?.asset?.localUrl ? (
                <img
                  alt=""
                  height="48"
                  src={spirit.asset.localUrl}
                  width="48"
                />
              ) : (
                <span aria-hidden="true" className="team-slot__empty">
                  {member ? <Wrench size={20} /> : index + 1}
                </span>
              )}
              <span className="team-slot__identity">
                <strong>{name}</strong>
                <small>
                  {member
                    ? member.needsRepair
                      ? member.repairReason
                      : getNature(member.natureId).name
                    : "添加精灵"}
                </small>
                {member?.ivsPending ? <small className="team-iv-pending">个体待设置</small> : null}
                {conflicts.length ? <small className="team-slot__bloodline-warning" title={`首领与血脉技能冲突：${conflicts.map(skill => skill.name).join("、")}`}>血脉技能冲突</small> : null}
              </span>
              <span aria-label="携带技能" className="team-slot__types">
                {member?.skills?.four?.map((entry, skillIndex) => {
                  const skill = skills.get(entryId(entry));
                  return skill ? (
                    <ElementIcon
                      key={`${skill.id}-${skillIndex}`}
                      size={16}
                      type={skill.type}
                    />
                  ) : (
                    <span
                      aria-hidden="true"
                      className="team-slot__empty-skill"
                      key={`empty-${skillIndex}`}
                    />
                  );
                })}
              </span>
            </button>
            <MemberActions member={member} name={name} onApply={onApply} />
          </li>
        );
      })}
    </ol>
    {selectedIndex >= 0 ? (
      <details className="team-roster__current-actions" key={selectedIndex}>
        <summary>当前成员操作</summary>
        <MemberActions
          member={members[selectedIndex]}
          name={spirits.get(members[selectedIndex]?.spiritId)?.fullName ?? `空位 ${selectedIndex + 1}`}
          onApply={onApply}
        />
      </details>
    ) : null}
    </>
  );
}
