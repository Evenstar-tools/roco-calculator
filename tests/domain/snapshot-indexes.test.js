import { expect, test } from "vitest";
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
