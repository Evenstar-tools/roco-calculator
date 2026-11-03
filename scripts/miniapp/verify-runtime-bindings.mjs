import { existsSync } from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { expandBundledRuntime } from "../../miniapp/src/data/expand-bundled-runtime.js";

const STAT_KEYS = ["hp", "speed", "physicalAttack", "magicalAttack", "physicalDefense", "magicalDefense"];
const IDENTITY_KEYS = ["fullName", "types", "traitIds", "previewIdentity", "previewDefaults", "calculationStatus",
  "formRole", "formRoleEvidence", "evolutionFamilyId", "catalogAvailable"];
const publicUrl = value => value?.startsWith("/assets/") ? `https://rococalc.top${value}` : value;

/** Validate against the exact miniapp release runtime, never the old root snapshot. */
export function getMiniappRuntimeBindingErrors({ runtime, payload, sourceRevision, sourceRoot }) {
  const bundled = expandBundledRuntime(payload);
  const errors = [];
  const same = (actual, expected, label) => {
    const serialized = expected === undefined ? undefined : JSON.parse(JSON.stringify(expected));
    if (!isDeepStrictEqual(actual, serialized)) errors.push(`小程序 ${label} 与发布 pin 不一致`);
  };
  same(bundled.meta?.miniappSourceRevision, sourceRevision, "源码版本");
  same(bundled.meta?.seasonId, runtime.meta?.seasonId, "赛季");
  for (const collection of ["spirits", "skills", "traits"]) {
    same(bundled[collection].map(entry => entry.id), runtime[collection].map(entry => entry.id), `${collection} 身份集合`);
  }
  const byId = new Map(bundled.spirits.map(spirit => [spirit.id, spirit]));
  for (const spirit of runtime.spirits) {
    const actual = byId.get(spirit.id);
    for (const key of IDENTITY_KEYS) same(actual?.[key], spirit[key], `${spirit.fullName} ${key}`);
    if (spirit.changeInfo) {
      const { history: _history, ...visible } = spirit.changeInfo;
      same(actual?.changeInfo, visible, `${spirit.fullName} 本期改动`);
    }
    same(actual?.raceStats && STAT_KEYS.map(key => actual.raceStats[key]),
      spirit.raceStats && STAT_KEYS.map(key => spirit.raceStats[key]), `${spirit.fullName} 种族值`);
    const image = spirit.asset?.localUrl;
    const expectedImage = image?.endsWith(".svg") ? undefined : publicUrl(image);
    same(actual?.imageUrl, expectedImage, `${spirit.fullName} 头像`);
    if (!expectedImage && !(spirit.previewIdentity && spirit.calculationStatus?.startsWith("pending-"))) {
      errors.push(`小程序 ${spirit.fullName} 缺少已确认头像`);
    }
    if (sourceRoot && image?.startsWith("/assets/") &&
        !existsSync(path.join(sourceRoot, "public", image))) errors.push(`小程序 ${spirit.fullName} 头像源文件缺失`);
  }
  const skillById = new Map(bundled.skills.map(skill => [skill.id, skill]));
  for (const skill of runtime.skills) {
    const { history: _history, ...visible } = skill.changeInfo ?? {};
    same(skillById.get(skill.id), { ...skill,
      ...(skill.changeInfo ? { changeInfo: visible } : {}),
      ...(skill.iconUrl ? { iconUrl: publicUrl(skill.iconUrl) } : {}),
      searchText: String(skill.searchText ?? "").split("|").slice(-2).join("|"),
    }, `${skill.name} 技能资料`);
    if (sourceRoot && skill.iconUrl?.startsWith("/assets/") &&
        !existsSync(path.join(sourceRoot, "public", skill.iconUrl))) errors.push(`小程序 ${skill.name} 图标源文件缺失`);
  }
  same(bundled.traits, runtime.traits, "特性资料");
  const learnsets = new Map(bundled.learnsets.map(entry => [entry.spiritId, entry]));
  for (const learnset of runtime.learnsets) same(learnsets.get(learnset.spiritId), learnset, `${learnset.spiritId} 技能关系`);
  return errors;
}
