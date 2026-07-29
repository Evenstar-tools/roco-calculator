import { Shield, Sword, Wrench } from "@phosphor-icons/react";
import { getNature } from "../domain/natures.js";
import { ElementIcon } from "./ElementIcon.jsx";

function entryId(entry) {
  if (typeof entry === "string") return entry;
  return entry?.skillId ?? entry?.id ?? null;
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
    <ol aria-label="队伍成员" className="team-roster">
      {Array.from({ length: 6 }, (_, index) => {
        const member = members[index] ?? null;
        const spirit = member ? spirits.get(member.spiritId) : null;
        const name = spirit?.fullName ?? (member ? "需修复" : `空位 ${index + 1}`);
        return (
          <li
            className={`team-slot${selectedIndex === index ? " is-selected" : ""}${member?.needsRepair ? " needs-repair" : ""}`}
            key={index}
          >
            <button
              aria-label={`编辑${name}`}
              className="team-slot__select"
              onClick={() => onSelect(index)}
              type="button"
            >
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
            <div className="team-slot__actions">
              <button
                aria-label={`${name}设为攻击方`}
                disabled={!member || member.needsRepair}
                onClick={() => onApply("attacker", member)}
                title="设为攻击方"
                type="button"
              >
                <Sword aria-hidden="true" size={16} weight="bold" />
                攻
              </button>
              <button
                aria-label={`${name}设为防御方`}
                disabled={!member || member.needsRepair}
                onClick={() => onApply("defender", member)}
                title="设为防御方"
                type="button"
              >
                <Shield aria-hidden="true" size={16} weight="bold" />
                防
              </button>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
