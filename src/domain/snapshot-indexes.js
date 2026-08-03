const snapshotIndexCache = new WeakMap();

function indexById(items = []) {
  return Object.fromEntries(items.map((item) => [item.id, item]));
}

export function getSnapshotIndexes(snapshot) {
  if (!snapshot || typeof snapshot !== "object") {
    return {
      learnsets: {},
      skills: {},
      spirits: {},
      traits: {},
    };
  }
  const cached = snapshotIndexCache.get(snapshot);
  if (cached) return cached;

  const indexes = Object.freeze({
    learnsets: Object.fromEntries(
      (snapshot.learnsets ?? []).map((learnset) => [
        learnset.spiritId,
        learnset,
      ]),
    ),
    skills: indexById(snapshot.skills ?? []),
    spirits: indexById(snapshot.spirits ?? []),
    traits: indexById(snapshot.traits ?? []),
  });
  snapshotIndexCache.set(snapshot, indexes);
  return indexes;
}
