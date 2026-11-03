const snapshotIndexCache = new WeakMap();

function indexById(items = []) {
  return Object.fromEntries(items.map((item) => [item.id, item]));
}

function hasSameEntries(items, cachedItems, original) {
  if (items === original && Object.isFrozen(items)) return true;
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
    hasSameEntries(learnsets, cached.sources.learnsets, cached.originals.learnsets) &&
    hasSameEntries(skills, cached.sources.skills, cached.originals.skills) &&
    hasSameEntries(spirits, cached.sources.spirits, cached.originals.spirits) &&
    hasSameEntries(traits, cached.sources.traits, cached.originals.traits)
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
    originals: {
      learnsets: Object.isFrozen(learnsets) ? learnsets : null,
      skills: Object.isFrozen(skills) ? skills : null,
      spirits: Object.isFrozen(spirits) ? spirits : null,
      traits: Object.isFrozen(traits) ? traits : null,
    },
    sources: {
      learnsets: [...learnsets],
      skills: [...skills],
      spirits: [...spirits],
      traits: [...traits],
    },
  });
  return indexes;
}
