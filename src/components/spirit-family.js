// Discovery only: this must not broaden the legal paths used by battle-form.js.
export function buildSpiritFamilyIndex(spirits) {
  const edges = new Map(spirits.map(spirit => [spirit.id, new Set()]));
  const names = new Map();
  function link(left, right) {
    if (!edges.has(left) || !edges.has(right)) return;
    edges.get(left).add(right);
    edges.get(right).add(left);
  }
  for (const spirit of spirits) {
    for (const id of spirit.evolutionChainIds ?? []) link(spirit.id, id);
    // Exact base names join regional variants, not fuzzy names or shared traits.
    if (spirit.baseName && spirit.dexNo) {
      const key = `${spirit.dexNo}:${spirit.baseName}`;
      const first = names.get(key);
      if (first) link(spirit.id, first);
      else names.set(key, spirit.id);
    }
  }
  const index = new Map();
  for (const spirit of spirits) {
    if (index.has(spirit.id)) continue;
    const ids = new Set([spirit.id]);
    for (const id of ids) for (const next of edges.get(id)) ids.add(next);
    const family = spirits.filter(entry => ids.has(entry.id));
    for (const id of ids) index.set(id, family);
  }
  return index;
}
