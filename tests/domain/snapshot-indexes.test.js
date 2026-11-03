import { expect, test, vi } from "vitest";
import { getSnapshotIndexes } from "../../src/domain/snapshot-indexes.js";

function snapshot(id = "fixture") {
  return {
    meta: { id },
    skills: [{ id: `skill-${id}` }],
    spirits: [{ id: `spirit-${id}` }],
    traits: [{ id: `trait-${id}` }],
  };
}

test("reuses immutable entity indexes while the snapshot identity is unchanged", () => {
  const source = snapshot();
  const first = getSnapshotIndexes(source);
  const second = getSnapshotIndexes(source);

  expect(second).toBe(first);
  expect(second.skills).toBe(first.skills);
  expect(second.spirits["spirit-fixture"]).toBe(source.spirits[0]);
});

test("builds a fresh index for a replacement snapshot", () => {
  const first = getSnapshotIndexes(snapshot("first"));
  const second = getSnapshotIndexes(snapshot("second"));

  expect(second).not.toBe(first);
  expect(second.skills["skill-second"].id).toBe("skill-second");
});


test("repeated immutable runtime lookup skips full entity scans but still invalidates replaced arrays", () => {
  const source = snapshot("original");
  const scans = Object.values(source).filter(Array.isArray).map(items => {
    const every = vi.fn(Array.prototype.every);
    Object.defineProperty(items, "every", { value: every });
    Object.freeze(items);
    return every;
  });
  const first = getSnapshotIndexes(source);
  expect(getSnapshotIndexes(source)).toBe(first);
  for (const scan of scans) expect(scan).not.toHaveBeenCalled();
  source.skills = Object.freeze([{ id: "replacement" }]);
  expect(getSnapshotIndexes(source).skills.replacement.id).toBe("replacement");
  expect(getSnapshotIndexes(source)).not.toBe(first);
});

test("mutable runtime arrays still rebuild their indexes after an in-place entry replacement", () => {
  const source = snapshot("before");
  const first = getSnapshotIndexes(source);
  source.skills[0] = { id: "after" };
  const next = getSnapshotIndexes(source);
  expect(next).not.toBe(first);
  expect(next.skills.after).toEqual({ id: "after" });
});


test("freezing an array after editing it cannot reuse an index built before the edit", () => {
  const source = snapshot("before-freeze");
  const first = getSnapshotIndexes(source);
  source.skills[0] = { id: "after-freeze" };
  Object.freeze(source.skills);
  const next = getSnapshotIndexes(source);
  expect(next).not.toBe(first);
  expect(next.skills["after-freeze"]).toEqual({ id: "after-freeze" });
  expect(getSnapshotIndexes(source)).toBe(next);
});
