const snapshotIndexCache = new WeakMap();

function indexById(items = []) {
  return Object.fromEntries(items.map((item) => [item.id, item]));
}

function hasSameEntries(items, cachedItems) {
  return (
    Array.isArray(items) &&
    items.length === cachedItems.length &&
    items.every((item, index) => item === cachedItems[index])
  );
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
  const learnsets = snapshot.learnsets ?? [];
  const skills = snapshot.skills ?? [];
  const spirits = snapshot.spirits ?? [];
  const traits = snapshot.traits ?? [];
  const cached = snapshotIndexCache.get(snapshot);
  if (
    cached &&
    hasSameEntries(learnsets, cached.sources.learnsets) &&
    hasSameEntries(skills, cached.sources.skills) &&
    hasSameEntries(spirits, cached.sources.spirits) &&
    hasSameEntries(traits, cached.sources.traits)
  ) {
    return cached.indexes;
  }

  const indexes = Object.freeze({
    learnsets: Object.fromEntries(
      learnsets.map((learnset) => [
        learnset.spiritId,
        learnset,
      ]),
    ),
    skills: indexById(skills),
    spirits: indexById(spirits),
    traits: indexById(traits),
  });
  snapshotIndexCache.set(snapshot, {
    indexes,
    sources: {
      learnsets: [...learnsets],
      skills: [...skills],
      spirits: [...spirits],
      traits: [...traits],
    },
  });
  return indexes;
}
