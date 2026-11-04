import { useToolLocale as useLocale } from "../i18n/useToolLocale.js";
import { useState } from "react";
import { Eye, EyeSlash } from "@phosphor-icons/react";
import { useRuntime } from "../runtime/RuntimeContext.jsx";
import { localizeGlobalSkill } from "../runtime/global-entity-localization.js";
import {
  calculateAllPanelStats,
  hasCompleteRaceStats,
} from "../domain/stat.js";
import { calculateDurability } from "../features/team-ability/domain/durability.js";
import { validateAbilityInvestment } from "../features/team-ability/domain/ability-investment.js";
import { getNatureMultipliers } from "../domain/natures.js";
import {
  getBossBloodlineConflicts,
  getSkillChoices,
} from "../domain/skill-loadout.js";
import {
  TEAM_BLOODLINE_OPTIONS,
  createTeamMember,
  createTeamMemberFromSpiritConfig,
} from "../state/team-presets.js";
import { NatureEffect } from "./NatureEffect.jsx";
import { NatureSelect } from "./NatureSelect.jsx";
import { SkillPicker } from "./SkillPicker.jsx";
import { SpiritPicker } from "./SpiritPicker.jsx";
import { StatTile } from "./StatTile.jsx";
import { StatRadar } from "./StatRadar.jsx";
import { ElementIcon } from "./ElementIcon.jsx";

const SKILL_CATEGORIES = {
  physical: "物理",
  magical: "魔法",
  dual: "双攻",
  defense: "防御",
  status: "变化",
};

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

export function TeamMemberEditor({
  getSpiritConfiguration = () => null,
  hideSkillDescriptions: sharedHideSkillDescriptions,
  index,
  member,
  members = [],
  onChange,
  onHideSkillDescriptionsChange,
  renderHeader,
  snapshot,
  spiritChoices,
}) {
  const { t, locale, typeName } = useLocale();
  const { serverId, release } = useRuntime();
  const [localHideSkillDescriptions, setLocalHideSkillDescriptions] = useState(false);
  const hideSkillDescriptions = sharedHideSkillDescriptions ?? localHideSkillDescriptions;
  const setHideSkillDescriptions = onHideSkillDescriptionsChange ?? setLocalHideSkillDescriptions;
  const global = serverId === "global" || snapshot.meta?.serverId === "global";
  const placeholder = global && Boolean(snapshot.meta?.placeholderSource);
  const enabled = release.capabilities.calculate && (!global || Boolean(snapshot.meta?.id));
  const spirit = (snapshot.spirits ?? []).find(
    (candidate) => candidate.id === member?.spiritId,
  );
  const pickerSpirits =
    spiritChoices ?? (snapshot.spirits ?? []).map(spiritView);
  const selectedSpirit = pickerSpirits.find(
    (candidate) => candidate.id === member?.spiritId,
  );
  const legalSkills = member
    ? getSkillChoices(snapshot, member.spiritId).filter(
        (skill) => skill.learnable,
      )
    : [];
  const skillById = new Map(
    (snapshot.skills ?? []).map((skill) => [skill.id, skill]),
  );
  const bloodlineSkillIds = new Set(!enabled ? [] : legalSkills.filter(skill => skill.bloodlineSkill).map(skill => skill.id));
  const bloodlineConflicts = !enabled ? [] : getBossBloodlineConflicts(snapshot, member);
  const conflictIds = new Set(bloodlineConflicts.map(skill => skill.id));
  const teamSkillTypes = enabled && ["布灵", "布灵布灵"].includes(spirit?.fullName)
    ? [...new Set(members.slice(0, 6).flatMap((entry) =>
        (entry?.skills?.four ?? []).slice(0, 4).map((skill) => skillById.get(entryId(skill))?.type),
      ).filter(Boolean))]
    : null;
  const calculationReady = enabled && hasCompleteRaceStats(spirit?.raceStats) &&
    spirit.calculationStatus !== "pending-race-stats" && !spirit.previewIdentity?.raceStatsPlaceholder;
  const panel = calculationReady
    ? calculateAllPanelStats({
        displayIvs: member.displayIvs,
        natureMultipliers: getNatureMultipliers(member.natureId),
        raceStats: spirit.raceStats,
      })
    : null;
  const durability = panel
    ? calculateDurability({
        magicalDefense: panel.magicalDefense,
        maxHp: panel.hp,
        physicalDefense: panel.physicalDefense,
      }).display
    : null;
  const investmentValidation = enabled && member
    ? validateAbilityInvestment({ values: member.displayIvs })
    : null;

  function selectSpirit(spiritId) {
    const personalConfiguration = getSpiritConfiguration(spiritId);
    onChange(
      personalConfiguration
        ? createTeamMemberFromSpiritConfig(personalConfiguration, { serverId: global ? "global" : "cn" })
        : createTeamMember(snapshot, spiritId),
    );
  }

  function updateSkill(skillIndex, skillId) {
    const four = [...(member.skills?.four ?? [])];
    four[skillIndex] = skillId;
    onChange({
      ...member,
      skills: {
        ...member.skills,
        four,
        single: !enabled ? member.skills?.single ?? null : four.find(Boolean) ?? null,
      },
    });
  }

  const picker = (
    <SpiritPicker
      caretLabel={t("更换")}
      clearOnOpen
      compactIdentity
      identityLabel={t("{index}号位", { index: index + 1 })}
      favorite={false}
      label={t("成员")}
      onFavoriteToggle={() => {}}
      onSelect={selectSpirit}
      selected={selectedSpirit ?? spiritView(spirit)}
      showFavorite={false}
      side="team"
      spirits={pickerSpirits}
    />
  );

  return (
    <section aria-label={t("成员 {index} 配置", { index: index + 1 })} className="team-member-editor">
      {renderHeader ? renderHeader(picker) : picker}
      {teamSkillTypes ? (
        <section aria-label={t("旧玩具队伍技能系别")} className="team-member-editor__types">
          <strong>{t("旧玩具 · 队伍技能系别")}</strong>
          <b>{t("{count} 种", { count: teamSkillTypes.length })}</b>
          <small>{t("按配招去重，非已使用次数")}</small>
          <div>{teamSkillTypes.map((type) => (
            <span key={type}><ElementIcon size={16} type={type} />{typeName(type)}</span>
          ))}</div>
        </section>
      ) : null}

      {member && spirit && (calculationReady || placeholder) ? (
        <div className="team-member-editor__columns">
          <section className="team-member-editor__panel">
            <header className="team-member-editor__section-heading">
              <strong>{t("能力值")}</strong>
              {investmentValidation && (<span className={investmentValidation.valid ? "is-ready" : "is-warning"}>
                {investmentValidation.valid
                  ? t("可用于能力分析 · 已选 {count}/3", { count: investmentValidation.activeCount })
                  : t("历史个体需在能力分析中重选")}
              </span>)}
            </header>
            <div className="team-member-editor__nature">
              <NatureSelect
                allowUnset={placeholder}
                ariaLabel={t("成员性格")}
                onChange={(natureId) => onChange({ ...member, natureId })}
                placeholder={placeholder}
                value={member.natureId}
              />
              <NatureEffect natureId={member.natureId} placeholder={placeholder} />
            </div>

            {member.ivsPending && !placeholder ? <p className="team-member-editor__iv-notice"><span className="team-iv-pending">{t("个体待设置")}</span> {t("原码个体为空或暂无法识别，请按实际配置调整。")}</p> : null}
            <div className={`team-member-editor__stats${placeholder ? " stat-grid" : " team-member-editor__stats--radar"}`}>
              {panel ?
                <StatRadar
                  className="team-member-editor__radar"
                  displayIvs={member.displayIvs}
                  ivLabel={t("成员")}
                  label={t("成员面板")}
                  minimumMaximum={600}
                  natureId={member.natureId}
                  stats={panel}
                  variant="game"
                  onIvChange={(stat, value) => onChange({
                    ...member,
                    displayIvs: { ...member.displayIvs, [stat]: value },
                  })}
                />
               : STAT_VIEW.map(({ key, label }) => (
                <StatTile
                  allowUnset={placeholder}
                  displayIv={member.displayIvs?.[key]}
                  key={key}
                  label={t(label)}
                  natureId={member.natureId}
                  onIvChange={(value) =>
                    onChange({
                      ...member,
                      displayIvs: { ...member.displayIvs, [key]: value },
                    })
                  }
                  panel={panel?.[key]}
                  placeholder={placeholder}
                  race={spirit.raceStats?.[key]}
                  stat={key}
                />
              ))}
            </div>

            {panel ? <p className="team-member-editor__iv-help">{t("点击数值切换个体 0 / 60")}</p> : null}
            {durability && <section aria-label={t("成员面板耐久")} className="team-member-editor__durability">
              <header>
                <strong>{t("面板耐久")}</strong>
              </header>
              <div>
                <span><small>{t("物理耐久")}</small><b>{durability.physical.toLocaleString(locale)}</b></span>
                <span><small>{t("魔法耐久")}</small><b>{durability.magical.toLocaleString(locale)}</b></span>
                <span><small>{t("综合耐久")}</small><b>{durability.combined.toLocaleString(locale)}</b></span>
              </div>
            </section>}
          </section>
          <section className="team-member-editor__loadout">
            <header className="team-member-editor__section-heading">
              <div className="team-member-editor__loadout-title">
                <strong>{t("配招")}</strong>
                <button
                  type="button"
                  className="team-member-editor__description-toggle"
                  aria-label={t(hideSkillDescriptions ? "显示效果说明" : "隐藏效果说明")}
                  title={t(hideSkillDescriptions ? "显示效果说明" : "隐藏效果说明")}
                  aria-pressed={hideSkillDescriptions}
                  onClick={() => setHideSkillDescriptions(!hideSkillDescriptions)}
                >
                  {hideSkillDescriptions ? <Eye aria-hidden="true" size={19} /> : <EyeSlash aria-hidden="true" size={19} />}
                </button>
              </div>
              {enabled && <label className="team-member-editor__bloodline">
              <span>{t("血脉")}</span>
              <select
                aria-label={t("血脉")}
                aria-invalid={bloodlineConflicts.length > 0 || undefined}
                aria-describedby={bloodlineConflicts.length ? `team-bloodline-conflict-${index}` : undefined}
                onChange={(event) =>
                  onChange({ ...member, bloodlineType: event.target.value })
                }
                value={
                  member.bloodlineType ??
                  (spirit.stage === "首领" ? "boss" : "normal")
                }
              >
                {TEAM_BLOODLINE_OPTIONS.map(({ label, value }) => (
                  <option key={value} value={value}>
                    {value === "boss" ? t(label) : typeName(label)}
                  </option>
                ))}
              </select>
            </label>}
            </header>
            {bloodlineConflicts.length > 0 ? (
              <p className="team-member-editor__bloodline-warning" id={`team-bloodline-conflict-${index}`} role="alert">
                {t("首领化／首领形态不能携带血脉技能：{skills}。请更换这些技能，或改用非首领配置。", { skills: bloodlineConflicts.map(skill => skill.name).join("、") })}
              </p>
            ) : null}

            <div className="team-member-editor__skills">
              {Array.from({ length: Math.max(4, member.skills?.four?.length ?? 0) }, (_, skillIndex) => {
                const skill = skillById.get(entryId(member.skills?.four?.[skillIndex]));
                const description = global && skill ? localizeGlobalSkill(skill, locale).description : skill?.description;
                const bloodline = bloodlineSkillIds.has(skill?.id);
                const conflict = conflictIds.has(skill?.id);
                return (
                  <div key={skillIndex} className={`team-member-editor__skill${bloodline ? " has-bloodline" : ""}${conflict ? " has-bloodline-conflict" : ""}`}>
                    <span className="team-member-editor__skill-number">{skillIndex + 1}</span>
                    <div className="team-member-editor__skill-body">
                      <SkillPicker
                        ariaLabel={t("成员技能{index}", { index: skillIndex + 1 })}
                        onSelect={(skillId) => updateSkill(skillIndex, skillId)}
                        placeholder={placeholder}
                        selected={skill}
                        skills={legalSkills}
                      />
                      {skill ? <>
                        <div className="team-member-editor__skill-meta">
                          <span>{typeName(skill.type)} · {t(SKILL_CATEGORIES[skill.category] ?? skill.category)}</span>
                          <span>{t("能耗")} {skill.cost ?? "—"}</span>
                          <span>{t("威力")} {skill.basePower ?? "—"}</span>
                          {bloodline ? <small className="team-member-editor__skill-source">{t(conflict ? "血脉技能 · 冲突" : "血脉技能")}</small> : null}
                        </div>
                        {!hideSkillDescriptions && description ? <p className="team-member-editor__skill-description">{t(description)}</p> : null}
                      </> : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      ) : member && spirit ? (
        <p className="team-member-editor__empty">{t("种族值待确认")}</p>
      ) : (
        <p className="team-member-editor__empty">{t("选择精灵后配置性格、个体和技能")}</p>
      )}
    </section>
  );
}
