import announcement from "../../../data/candidates/s5-season-announcement-20261027.json";
import { mergeEntityChangeInfo } from "../../data/entity-change-history.js";

export const S5_SEASON_ANNOUNCEMENT = announcement;
const STAT_LABELS = {
  hp: "生命", physicalAttack: "物攻", magicalAttack: "魔攻",
  physicalDefense: "物防", magicalDefense: "魔防", speed: "速度",
};
const UNIQUE = values => [...new Set(values)];
const markerMatches = value => value?.seasonAnnouncement?.id === announcement.patch.id;

function requireNamed(entities, name, field = "name") {
  const matches = entities.filter(entity => entity[field] === name);
  if (matches.length !== 1) throw new Error(`S5公告身份缺失或不唯一：${name}`);
  return matches[0];
}

function checkedValue(actual, before, after, label) {
  if (actual !== before && actual !== after) throw new Error(`S5公告基线不符：${label}`);
  return after;
}

function changeInfo(entity, items, previous) {
  return mergeEntityChangeInfo(previous, {
    entityId: entity.id, entityName: entity.name ?? entity.fullName, patch: announcement.patch,
    isNew: false, descriptionOnly: false, items,
  });
}

function project(snapshot, queryOnly = false) {
  if (markerMatches(snapshot)) return snapshot;
  const spiritChanges = new Map();
  const skillChanges = new Map();
  const traitChanges = new Map();
  const priorChanges = kind => new Map((snapshot.currentPatchChanges?.[kind] ?? []).map(entry =>
    [entry.entityId, { patch: snapshot.currentPatchChanges.patch, ...entry }]));
  const priorSpiritChanges = priorChanges("spirits");
  const priorSkillChanges = priorChanges("skills");
  const withPriorChanges = (entity, prior) => !entity.changeInfo && prior.has(entity.id)
    ? { ...entity, changeInfo: prior.get(entity.id) } : entity;
  const learnsets = new Map(snapshot.learnsets.map(entry => [entry.spiritId, entry]));
  const spirit = name => requireNamed(snapshot.spirits, name, "fullName");
  const skill = name => requireNamed(snapshot.skills, name);
  function updateSpirit(entity, fields, item) {
    const previous = spiritChanges.get(entity.id) ?? withPriorChanges(entity, priorSpiritChanges);
    spiritChanges.set(entity.id, {
      ...previous, ...fields,
      changeInfo: changeInfo(entity, item, previous.changeInfo),
    });
  }

  if (!queryOnly) {
    for (const entry of announcement.raceStats) {
      const entity = spirit(entry.name);
      const raceStats = { ...entity.raceStats };
      const items = Object.entries(entry.fields).map(([field, [before, after]]) => {
        raceStats[field] = checkedValue(raceStats[field], before, after, `${entry.name}.${field}`);
        return { kind: "stat", field, label: STAT_LABELS[field], before, after };
      });
      raceStats.total = Object.keys(STAT_LABELS).reduce((sum, field) => sum + raceStats[field], 0);
      updateSpirit(entity, { raceStats }, items);
    }
    for (const entry of announcement.traits) {
      const entity = requireNamed(snapshot.traits, entry.name);
      const description = checkedValue(entity.description, entry.before, entry.after, `${entry.name}.description`);
      traitChanges.set(entity.id, {
        ...entity, description,
        ...(entry.pending ? { s5PendingSkillNames: ["广播"], s5PendingReason: entry.pending } : {}),
      });
      for (const owner of snapshot.spirits.filter(candidate => candidate.traitIds?.includes(entity.id))) {
        updateSpirit(owner, {}, [{ kind: "trait", label: `特性·${entry.name}`, before: entry.before, after: entry.after, ...(entry.pending ? { note: entry.pending } : {}) }]);
      }
    }
  }

  for (const entry of announcement.skills) {
    const entity = skill(entry.name);
    const fields = {};
    const items = Object.entries(entry.fields).map(([field, [before, after]]) => {
      fields[field] = checkedValue(entity[field], before, after, `${entry.name}.${field}`);
      return {
        kind: field === "description" ? "mechanic" : "stat", field,
        label: { basePower: "基础威力", cost: "能耗", description: "技能效果" }[field], before, after,
        ...(entry.pending ? { note: entry.pending } : {}),
      };
    });
    skillChanges.set(entity.id, {
      ...entity, ...fields, changeInfo: changeInfo(entity, items, withPriorChanges(entity, priorSkillChanges).changeInfo),
      ...(entry.ruleId ? { ruleId: entry.ruleId, ruleParams: entry.ruleParams } : {}),
      ...(entry.pending ? { s5StatusEffectPending: entry.pending } : {}),
    });
  }

  for (const entry of announcement.learnsets) {
    const entity = spirit(entry.spirit);
    const learned = skill(entry.skill);
    const current = learnsets.get(entity.id);
    if (!current) throw new Error(`S5公告缺少学习面：${entry.spirit}`);
    const method = entry.method ?? "公告新增；具体学习途径待公布";
    learnsets.set(entity.id, {
      ...current, skillIds: UNIQUE([...current.skillIds, learned.id]),
      acquisitions: { ...current.acquisitions, [learned.id]: UNIQUE([...(current.acquisitions?.[learned.id] ?? []), method]) },
    });
    updateSpirit(entity, {}, [{ kind: "learnset", label: "新增可学习技能", after: entry.skill, note: method }]);
  }

  for (const entry of announcement.bloodlines) {
    const oldSkill = skill(entry.before);
    const newSkill = skill(entry.after);
    const prefix = `${entry.type}系血脉`;
    for (const name of entry.spirits) {
      const entity = spirit(name);
      const current = learnsets.get(entity.id);
      if (!current) throw new Error(`S5公告缺少学习面：${name}`);
      const oldMethods = current.acquisitions?.[oldSkill.id];
      const newMethods = current.acquisitions?.[newSkill.id] ?? [];
      const retainedMethods = oldMethods?.filter(method => !method.startsWith(prefix));
      const movedMethods = oldMethods?.filter(method => method.startsWith(prefix)) ?? [`${prefix} Lv.15`];
      const alreadyChanged = !current.skillIds.includes(oldSkill.id) && current.skillIds.includes(newSkill.id);
      if (!alreadyChanged && (!current.skillIds.includes(oldSkill.id) || (oldMethods && !movedMethods.length))) {
        throw new Error(`S5公告血脉基线不符：${name}·${entry.before}`);
      }
      const removeOld = oldMethods ? retainedMethods.length === 0 : current.bloodlineSkillIds?.includes(oldSkill.id) === true;
      const newAlreadyNonBloodline = oldMethods
        ? newMethods.some(method => !/血脉/u.test(method))
        : current.skillIds.includes(newSkill.id) && !current.bloodlineSkillIds?.includes(newSkill.id);
      const bloodlineSkillIds = UNIQUE([
        ...(current.bloodlineSkillIds ?? current.skillIds.filter(id => current.acquisitions?.[id]?.length && current.acquisitions[id].every(method => /血脉/u.test(method))))
          .filter(id => id !== oldSkill.id),
        ...(newAlreadyNonBloodline ? [] : [newSkill.id]),
      ]);
      const acquisitions = { ...current.acquisitions, [newSkill.id]: UNIQUE([...newMethods, ...movedMethods]) };
      if (oldMethods) {
        if (retainedMethods.length) acquisitions[oldSkill.id] = retainedMethods;
        else delete acquisitions[oldSkill.id];
      }
      const skillIds = UNIQUE([...current.skillIds.filter(id => !removeOld || id !== oldSkill.id), newSkill.id]);
      learnsets.set(entity.id, {
        ...current, skillIds, bloodlineSkillIds, acquisitions,
        ...(current.defaultSkillIds ? { defaultSkillIds: current.defaultSkillIds.filter(id => skillIds.includes(id)) } : {}),
      });
      updateSpirit(entity, {}, [{
        kind: "learnset", label: `${prefix}技能`, before: entry.before, after: entry.after,
        note: removeOld || alreadyChanged ? "原血脉途径已替换" : `原血脉途径已替换；${entry.before}的其他学习途径保留`,
      }]);
    }
  }

  const result = {
    ...snapshot, seasonAnnouncement: announcement.patch,
    spirits: snapshot.spirits.map(entity => spiritChanges.get(entity.id) ?? withPriorChanges(entity, priorSpiritChanges)),
    skills: snapshot.skills.map(entity => skillChanges.get(entity.id) ?? withPriorChanges(entity, priorSkillChanges)),
    ...(snapshot.traits ? { traits: snapshot.traits.map(entity => traitChanges.get(entity.id) ?? entity) } : {}),
    learnsets: snapshot.learnsets.map(entity => learnsets.get(entity.spiritId)),
  };
  if (snapshot.currentPatchChanges) {
    result.currentPatchChanges = {
      patch: announcement.patch,
      spirits: result.spirits.map(entity => entity.changeInfo).filter(Boolean),
      skills: result.skills.map(entity => entity.changeInfo).filter(Boolean),
    };
  }
  return result;
}

/** S5 is a Web-only preview projection; the formal snapshot and stored identities stay intact. */
export function applyS5SeasonAnnouncement(snapshot) {
  if ((snapshot.meta?.serverId ?? "cn") !== "cn" || snapshot.meta?.seasonId !== "S4") return snapshot;
  return project(snapshot);
}

export function createS5AnnouncementQuerySeason(s4Season) {
  const result = project(s4Season, true);
  return { ...result, id: "S5", label: "S5（公告）", preview: true, announcementNote: announcement.learnsetNote };
}
