import { useLocale } from "../i18n/LocaleContext.jsx";
import { useRuntime } from "../runtime/RuntimeContext.jsx";
import { Shield, Sword, WarningCircle, Wrench } from "@phosphor-icons/react";
import { getNature, NATURES, STAT_LABELS } from "../domain/natures.js";
import { getBossBloodlineConflicts } from "../domain/skill-loadout.js";
import { ElementIcon } from "./ElementIcon.jsx";

function entryId(entry) {
  if (typeof entry === "string") return entry;
  return entry?.skillId ?? entry?.id ?? null;
}

function MemberActions({ member, name, onApply }) {
  const { t } = useLocale();
  return (
    <div className="team-slot__actions">
      {[["attacker", Sword, t("攻击方"), t("攻")], ["defender", Shield, t("防御方"), t("防")]].map(([side, Icon, label, short]) => (
        <button
          aria-label={t("{name}设为{side}", { name, side: label })}
          disabled={!member || member.needsRepair}
          key={side}
          onClick={() => onApply(side, member)}
          title={t("设为{side}", { side: label })}
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
  const { t } = useLocale();
  const { serverId } = useRuntime();
  const global = serverId === "global" || snapshot.meta?.serverId === "global";
  const placeholder = global && Boolean(snapshot.meta?.placeholderSource);
  const spirits = new Map(
    (snapshot.spirits ?? []).map((spirit) => [spirit.id, spirit]),
  );
  const skills = new Map(
    (snapshot.skills ?? []).map((skill) => [skill.id, skill]),
  );

  return (
    <>
    <ol aria-label={t("队伍成员")} className="team-roster">
      {Array.from({ length: 6 }, (_, index) => {
        const member = members[index] ?? null;
        const spirit = member ? spirits.get(member.spiritId) : null;
        const name = spirit?.fullName ?? (member ? member.spiritId ?? t("需修复") : t("空位 {index}", { index: index + 1 }));
        const conflicts = global ? [] : getBossBloodlineConflicts(snapshot, member);
        const referenceNature = placeholder && member?.natureId != null
          ? NATURES.find((nature) => nature.id === member.natureId)
          : null;
        const natureLabel = placeholder
          ? member?.natureId == null ? t("未设置")
            : referenceNature?.upStat
              ? `${t(STAT_LABELS[referenceNature.upStat])}↑ ${t(STAT_LABELS[referenceNature.downStat])}↓`
              : referenceNature ? t("普通") : String(member.natureId)
          : t(getNature(member?.natureId).name);
        return (
          <li
            className={`team-slot${selectedIndex === index ? " is-selected" : ""}${member?.needsRepair ? " needs-repair" : ""}${conflicts.length ? " has-bloodline-conflict" : ""}`}
            key={index}
          >
            <button
              aria-label={t("编辑{name}", { name })}
              aria-pressed={selectedIndex === index}
              title={t("{index}号位 · {name}", { index: index + 1, name })}
              className="team-slot__select"
              onClick={() => onSelect(index)}
              type="button"
            >
              <span aria-hidden="true" className="team-slot__number">{index + 1}</span>
              {conflicts.length ? <span className="team-slot__bloodline-flag" role="img" aria-label={t("血脉技能与首领冲突")} title={t("首领与血脉技能冲突：{skills}", { skills: conflicts.map(skill => skill.name).join("、") })}><WarningCircle aria-hidden="true" size={16} weight="fill" /></span> : null}
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
                      ? t("引用待核验，原配置已保留")
                      : natureLabel
                    : t("添加精灵")}
                </small>
                {member?.ivsPending ? <small className="team-iv-pending">{t("个体待设置")}</small> : null}
                {conflicts.length ? <small className="team-slot__bloodline-warning" title={t("首领与血脉技能冲突：{skills}", { skills: conflicts.map(skill => skill.name).join("、") })}>{t("血脉技能冲突")}</small> : null}
              </span>
              <span aria-label={t("携带技能")} className="team-slot__types">
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
        <summary>{t("当前成员操作")}</summary>
        <MemberActions
          member={members[selectedIndex]}
          name={spirits.get(members[selectedIndex]?.spiritId)?.fullName ?? t("空位 {index}", { index: selectedIndex + 1 })}
          onApply={onApply}
        />
      </details>
    ) : null}
    </>
  );
}
