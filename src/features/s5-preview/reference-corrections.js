import { correctS5PreviewLevelInputs } from "./level-input-migration.js";
import { correctS5PreviewChargeInputs } from "./charge-input-migration.js";
import { correctS5PreviewEnergyInputs } from "./energy-input-migration.js";
import { correctS5PreviewDiceInputs } from "./dice-input-migration.js";
import { canonicalTraitControlKey } from "../../domain/trait-runtime.js";
import { normalizeTriggerControls } from "../../domain/trigger-controls.js";

const eggLegacyControls = ["attacker", "defender"].map(role => {
  const source = `${role}Trait`;
  return normalizeTriggerControls(["TeamMoenhua", "EntryDefenseActive", "EggTriggered"].map(suffix => ({
    contextKey: `${source}S5${suffix}`, type: "boolean", defaultValue: false,
  })), { source, scope: "direction" });
});
const eggKeys = control => [control.id, canonicalTraitControlKey(control), `${control.source}.${control.contextKey}`, control.contextKey];
function correctEggTrigger(record) {
  let next = record;
  for (const [team, active, trigger] of eggLegacyControls) {
    const teamKeys = eggKeys(team), activeKeys = eggKeys(active), triggerKeys = eggKeys(trigger);
    const teamKey = teamKeys.find(key => Object.hasOwn(next, key));
    const activeKey = activeKeys.find(key => Object.hasOwn(next, key));
    if (teamKey === undefined && activeKey === undefined) continue;
    const triggerKey = triggerKeys.find(key => Object.hasOwn(next, key));
    const enabled = triggerKey !== undefined ? next[triggerKey] === true
      : teamKey !== undefined && next[teamKey] === true && activeKey !== undefined && next[activeKey] === true;
    const canonical = [teamKey, activeKey].some(key => key?.startsWith("trait."));
    next = { ...next };
    for (const key of [...teamKeys, ...activeKeys]) delete next[key];
    next[triggerKey ?? (canonical ? canonicalTraitControlKey(trigger) : trigger.id)] = enabled;
  }
  return next;
}

// Exact correction for the withdrawn duplicate candidate. These are references,
// never inferred species matches, stat replacements or a general migration map.
const CORRECTED_IDS = Object.freeze({
  "spirit_preview_s5_boss-thousand-spikes": "spirit_786924cd03526ca4",
  "trait_preview_s5_boss-thousand-spikes": "trait_40aa89d1be037fd7",
});
const correctId = (id) => Object.hasOwn(CORRECTED_IDS, id) ? CORRECTED_IDS[id] : id;

export function correctS5PreviewReferences(value) {
  if (typeof value === "string") return correctId(value);
  if (Array.isArray(value)) {
    const corrected = value.map(correctS5PreviewReferences);
    return corrected.some((entry, index) => entry !== value[index]) ? corrected : value;
  }
  if (!value || typeof value !== "object") return value;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return value;
  let changed = false;
  const entries = [];
  for (const [key, entry] of Object.entries(value)) {
    const correctedKey = correctId(key);
    // A real species/trait configuration already present is authoritative.
    // Drop the obsolete duplicate instead of overwriting or merging into it.
    if (correctedKey !== key && Object.hasOwn(value, correctedKey)) {
      changed = true;
      continue;
    }
    const correctedEntry = correctS5PreviewReferences(entry);
    if (correctedKey !== key || correctedEntry !== entry) changed = true;
    entries.push([correctedKey, correctedEntry]);
  }
  return correctEggTrigger(correctS5PreviewDiceInputs(correctS5PreviewEnergyInputs(correctS5PreviewChargeInputs(correctS5PreviewLevelInputs(changed ? Object.fromEntries(entries) : value)))));
}

// Storage is corrected only on the returned read value; the original bytes are
// retained for recovery. Non-JSON settings and corrupt records remain untouched.
export function correctS5PreviewStoredJson(raw) {
  if (typeof raw !== "string" || !["preview_s5_boss-thousand-spikes", "spirit_preview_s5_minggulong", "preview_s5_gold-vein-dragon", "preview_s5_underground-silver-dragon", "S5TeamMoenhua", "S5EntryDefenseActive",
    "spirit_preview_s5_abu", "spirit_preview_s5_boss-abu", "spirit_preview_s5_super-abu", "preview_s5_diliutun"].some(id => raw.includes(id))) return raw;
  try {
    const parsed = JSON.parse(raw);
    const corrected = correctS5PreviewReferences(parsed);
    return corrected === parsed ? raw : JSON.stringify(corrected);
  } catch {
    return raw;
  }
}
