import { calculateAllPanelStats } from "../domain/stat.js";
import { getNatureMultipliers } from "../domain/natures.js";
import {
  getLegalSkillIds,
  getSkillChoices,
  reconcileSkillLoadout,
} from "../domain/skill-loadout.js";
import { createTeamMember } from "../state/team-presets.js";
import { NatureEffect } from "./NatureEffect.jsx";
import { NatureSelect } from "./NatureSelect.jsx";
import { SkillPicker } from "./SkillPicker.jsx";
import { SpiritPicker } from "./SpiritPicker.jsx";
import { StatTile } from "./StatTile.jsx";

const STAT_VIEW = [
  { key: "physicalAttack", label: "物攻" },
  { key: "magicalAttack", label: "魔攻" },
  { key: "speed", label: "速度" },
  { key: "hp", label: "HP" },
  { key: "physicalDefense", label: "物防" },
  { key: "magicalDefense", label: "魔防" },
];

function entryId(entry) {
  if (typeof entry === "string") return entry;
  return entry?.skillId ?? entry?.id ?? null;
}

function spiritView(spirit) {
  if (!spirit) {
    return {
      assetUrl: null,
      fullName: "",
      id: null,
      stage: "",
      traitName: "",
      types: [],
    };
  }
  return {
    ...spirit,
    assetUrl: spirit.asset?.localUrl,
  };
}

export function TeamMemberEditor({ index, member, onChange, snapshot }) {
  const spirit = (snapshot.spirits ?? []).find(
    (candidate) => candidate.id === member?.spiritId,
  );
  const spirits = (snapshot.spirits ?? []).map(spiritView);
  const legalSkills = member
    ? getSkillChoices(snapshot, member.spiritId).filter(
        (skill) => skill.learnable,
      )
    : [];
  const skillById = new Map(
    (snapshot.skills ?? []).map((skill) => [skill.id, skill]),
  );
  const panel = spirit
    ? calculateAllPanelStats({
        displayIvs: member.displayIvs,
        natureMultipliers: getNatureMultipliers(member.natureId),
        raceStats: spirit.raceStats,
      })
    : null;

  function selectSpirit(spiritId) {
    const defaults = createTeamMember(snapshot, spiritId);
    if (!member) {
      onChange(defaults);
      return;
    }
    onChange({
      ...defaults,
      displayIvs: { ...member.displayIvs },
      natureId: member.natureId,
      skills: reconcileSkillLoadout(
        member.skills,
        getLegalSkillIds(snapshot, spiritId),
      ),
    });
  }

  function updateSkill(skillIndex, skillId) {
    const four = [...member.skills.four];
    four[skillIndex] = skillId;
    onChange({
      ...member,
      skills: {
        four,
        single: four.find(Boolean) ?? null,
      },
    });
  }

  return (
    <section aria-label={`成员 ${index + 1} 配置`} className="team-member-editor">
      <SpiritPicker
        favorite={false}
        label="成员"
        onFavoriteToggle={() => {}}
        onSelect={selectSpirit}
        selected={spiritView(spirit)}
        showFavorite={false}
        side="team"
        spirits={spirits}
      />

      {member && spirit ? (
        <>
          <div className="team-member-editor__nature">
            <NatureSelect
              ariaLabel="成员性格"
              onChange={(natureId) => onChange({ ...member, natureId })}
              value={member.natureId}
            />
            <NatureEffect natureId={member.natureId} />
          </div>

          <div className="stat-grid team-member-editor__stats">
            {STAT_VIEW.map(({ key, label }) => (
              <StatTile
                displayIv={member.displayIvs[key]}
                key={key}
                label={label}
                onIvChange={(value) =>
                  onChange({
                    ...member,
                    displayIvs: { ...member.displayIvs, [key]: value },
                  })
                }
                panel={panel[key]}
                race={spirit.raceStats[key]}
                stat={key}
              />
            ))}
          </div>

          <div className="team-member-editor__skills">
            {Array.from({ length: 4 }, (_, skillIndex) => (
              <label key={skillIndex}>
                <span>{skillIndex + 1}</span>
                <SkillPicker
                  ariaLabel={`成员技能${skillIndex + 1}`}
                  onSelect={(skillId) => updateSkill(skillIndex, skillId)}
                  selected={skillById.get(
                    entryId(member.skills.four[skillIndex]),
                  )}
                  skills={legalSkills}
                />
              </label>
            ))}
          </div>
        </>
      ) : (
        <p className="team-member-editor__empty">选择精灵后配置性格、个体和技能</p>
      )}
    </section>
  );
}
