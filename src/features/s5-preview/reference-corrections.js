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
  return changed ? Object.fromEntries(entries) : value;
}

// Storage is corrected only on the returned read value; the original bytes are
// retained for recovery. Non-JSON settings and corrupt records remain untouched.
export function correctS5PreviewStoredJson(raw) {
  if (typeof raw !== "string" || !raw.includes("preview_s5_boss-thousand-spikes")) return raw;
  try {
    const parsed = JSON.parse(raw);
    const corrected = correctS5PreviewReferences(parsed);
    return corrected === parsed ? raw : JSON.stringify(corrected);
  } catch {
    return raw;
  }
}
