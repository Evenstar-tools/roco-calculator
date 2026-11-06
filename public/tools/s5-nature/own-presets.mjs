import { traitControls, traitInfo } from './own-trait.mjs';

const CN_PRESET_KEY = 'rock-calculator.servers.cn.spirit-configs.v2';
const STATS = ['hp', 'physicalAttack', 'magicalAttack', 'physicalDefense', 'magicalDefense', 'speed'];
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const skillId = value => typeof value === 'string' ? value : object(value) ? value.skillId ?? value.id : null;
const isCn = value => [value?.serverId, value?.meta?.serverId].every(id => id === undefined || id === 'cn');

// S5 清理奇遇的两套专用配置；其他精灵沿用国服计算器配置库。
const SPECIAL = {
  spirit_db5a2cb398dc0385: {
    natureId: 'rash', ivStats: ['physicalAttack', 'magicalAttack', 'speed'],
    skills: ['skill_c755850f7ec322ad', 'skill_eb0439cab3a96c58', 'skill_67d0edec3f4e467c', 'skill_808e1f607ccd30fa'],
  },
  spirit_4e7acb9d14c8f373: {
    natureId: 'adamant', ivStats: ['hp', 'physicalAttack', 'physicalDefense'],
    skills: ['skill_5de6dc05b8315c7d', 'skill_a3cda3d9a2bcb243', 'skill_1445d7b32a85126d', 'skill_210a30ff4c9d8a00'],
  },
};

/** Match the calculator's explicit CN preview defaults without claiming learnability. */
export function getOwnSkillIds(catalog, spiritId) {
  const spirit = catalog?.spirits?.find(row => row.id === spiritId);
  const defaults = spirit?.previewDefaults;
  const authorized = isCn(catalog)
    && /^s5(?:[-_:]|$)/iu.test(spirit?.previewIdentity?.catalogId ?? '')
    && spirit?.previewIdentity?.formalIdPending === true
    && defaults?.authority === 'user' && Array.isArray(defaults.skillIds);
  return [...new Set([
    ...(catalog?.learnsets?.find(row => row.spiritId === spiritId)?.skillIds ?? []),
    ...(authorized ? defaults.skillIds : []),
  ])];
}

function ownTraitState(values, spirit, traitCatalog) {
  const info = traitInfo(traitCatalog, spirit.traitName);
  const result = { stacks: 0, active: false };
  if (info.damage !== 'applied') return result;
  const controls = traitControls(info);
  const only = pattern => {
    const entries = Object.entries(values ?? {}).filter(([key]) => pattern.test(key));
    return entries.length === 1 ? entries[0][1] : undefined;
  };
  if (controls.stack) {
    const stacks = only(/^trait\.traitStacks\./);
    if (Number.isFinite(stacks)) result.stacks = Math.max(controls.stack.min ?? 0,
      Math.min(controls.stack.max ?? 999, Math.floor(stacks)));
  }
  if (controls.condition) result.active = only(/^trait\.traitActivated\./) === true;
  return result;
}

function normalizePreset(value, spirit, catalog, traitCatalog) {
  if (!object(value) || value.spiritId !== spirit.id || value.needsRepair || !isCn(value)) return null;
  const natureId = value.natureId ?? value.nature;
  if (natureId !== 'neutral' && !catalog.natures?.some(nature => nature.id === natureId)) return null;
  if (!object(value.displayIvs) || !STATS.every(key => Number.isInteger(value.displayIvs[key])
    && value.displayIvs[key] >= 0 && value.displayIvs[key] <= 60)) return null;
  if (value.traitValues !== undefined && !object(value.traitValues)) return null;
  const slots = Array.isArray(value.skills) ? value.skills : value.skills?.four;
  if (!Array.isArray(slots) || slots.length < 4 || slots.length > 32) return null;
  const skillIds = slots.map(skillId);
  const legal = new Set(getOwnSkillIds(catalog, spirit.id));
  const known = new Set(catalog.skills?.map(row => row.id) ?? []);
  if (skillIds.some(id => !legal.has(id) || !known.has(id))) return null;
  return {
    natureId,
    displayIvs: Object.fromEntries(STATS.map(key => [key, value.displayIvs[key]])),
    skillIds: skillIds.slice(0, 4),
    trait: ownTraitState(value.traitValues, spirit, traitCatalog),
  };
}

/** Read calculator configurations without migrating or changing its storage. */
export function resolveOwnPreset(spiritId, catalog, presetLibrary, traitCatalog, storage = globalThis.localStorage) {
  if (!isCn(catalog)) return null;
  const spirit = catalog?.spirits?.find(row => row.id === spiritId);
  if (!spirit) return null;
  const special = SPECIAL[spiritId];
  if (special) {
    const result = normalizePreset({ ...special, spiritId,
      displayIvs: Object.fromEntries(STATS.map(key => [key, special.ivStats.includes(key) ? 60 : 0])),
    }, spirit, catalog, traitCatalog);
    return result ? { ...result, trait: { stacks: 0, active: false }, awakening: 5 } : null;
  }
  try {
    const state = JSON.parse(storage?.getItem?.(CN_PRESET_KEY) ?? 'null');
    if (state?.schemaVersion === 2 && isCn(state) && object(state.configs)) {
      const personal = normalizePreset(state.configs[spiritId], spirit, catalog, traitCatalog);
      if (personal) return personal;
    }
  } catch {
    // A blocked or corrupt calculator store does not prevent bundled defaults.
  }
  if (!isCn(presetLibrary) || !Array.isArray(presetLibrary?.entries)) return null;
  for (const entry of presetLibrary.entries) {
    if (entry?.spiritId !== spiritId) continue;
    const bundled = normalizePreset(entry, spirit, catalog, traitCatalog);
    if (bundled) return bundled;
  }
  return null;
}
