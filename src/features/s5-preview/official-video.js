import reviewed from "../../../data/reviewed/s5-official-video-20261031.json";
import { chooseDefaultSkillIds } from "../../domain/skill-loadout.js";

/** Confirmed additions for existing spirits, scoped to the CN S5 Web overlay. */
export function withS5OfficialVideoSkills(snapshot) {
  if ((snapshot.meta?.serverId ?? "cn") !== "cn") return snapshot;
  const additions = reviewed.additionalSkills.filter(definition =>
    !snapshot.skills.some(skill => skill.id === definition.id));
  let changed = additions.length > 0;
  const learnsets = snapshot.learnsets.map(learnset => {
    const update = reviewed.learnsets.find(entry => entry.spiritId === learnset.spiritId);
    if (!update) return learnset;
    const extraIds = update.skillIds.filter(id => !learnset.skillIds.includes(id));
    if (!extraIds.length) return learnset;
    changed = true;
    return {
      ...learnset,
      skillIds: [...learnset.skillIds, ...extraIds],
      defaultSkillIds: [...update.skillIds,
        ...chooseDefaultSkillIds(snapshot, learnset.spiritId).filter(id => !update.skillIds.includes(id))].slice(0, 4),
      acquisitions: {
        ...learnset.acquisitions,
        ...Object.fromEntries(extraIds.map(id => [id, ["S5官方技能演示"]])),
      },
    };
  });
  if (!changed) return snapshot;
  return { ...snapshot, skills: [...snapshot.skills, ...additions], learnsets };
}
