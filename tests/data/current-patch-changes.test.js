import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { apply2026SeptemberSeasonAnnouncement } from "../../scripts/bwiki/apply-2026-09-season-announcement.mjs";
import { applyS4PreviewCatalog } from "../../scripts/bwiki/apply-s4-preview-catalog.mjs";
import { buildRuntimeSnapshot } from "../../scripts/runtime-snapshot.mjs";

const snapshot = JSON.parse(readFileSync("data/snapshots/current.json", "utf8"));
const catalog = JSON.parse(
  readFileSync("data/candidates/s4-preview-new-spirits.json", "utf8"),
);

function spiritChange(changes, name) {
  const spirit = snapshot.spirits.find((candidate) => candidate.fullName === name);
  return changes.spirits.find((candidate) => candidate.entityId === spirit?.id);
}

function skillChange(changes, name) {
  const skill = snapshot.skills.find((candidate) => candidate.name === name);
  return changes.skills.find((candidate) => candidate.entityId === skill?.id);
}

describe("当前赛季实体改动记录", () => {
  test("为精灵聚合种族值、特性和学习面改动", () => {
    const patched = apply2026SeptemberSeasonAnnouncement(snapshot);
    const changes = patched.currentPatchChanges;

    expect(changes.patch).toMatchObject({
      id: "s4-preview-2026-09-10",
      date: "2026.09.10",
      status: "preview",
    });
    expect(spiritChange(changes, "加油蟹")?.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "physicalAttack", before: 108, after: 92 }),
        expect.objectContaining({ field: "magicalAttack", before: 108, after: 92 }),
        expect.objectContaining({ field: "speed", before: 95, after: 100 }),
      ]),
    );
    expect(spiritChange(changes, "卡拉波斯")?.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "learnset", label: "新增可学习技能", after: "血气" }),
      ]),
    );

    const highAlkaloid = patched.traits.find(({ name }) => name === "高浓生物碱");
    const owners = patched.spirits.filter(({ traitIds }) =>
      traitIds?.includes(highAlkaloid.id),
    );
    expect(owners.length).toBeGreaterThan(1);
    for (const owner of owners) {
      expect(
        changes.spirits.find(({ entityId }) => entityId === owner.id)?.items,
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ kind: "trait", label: "特性·高浓生物碱" }),
        ]),
      );
    }
  });

  test("技能记录区分数值或机制调整与仅文案调整", () => {
    const changes = apply2026SeptemberSeasonAnnouncement(snapshot)
      .currentPatchChanges;

    expect(skillChange(changes, "远程访问")?.items).toEqual([
      expect.objectContaining({ field: "cost", before: 2, after: 1 }),
    ]);
    expect(skillChange(changes, "截拳")).toMatchObject({
      descriptionOnly: true,
      items: [expect.objectContaining({ kind: "wording" })],
    });
  });

  test("运行时只给有当前改动的实体附加 changeInfo", () => {
    const patched = apply2026SeptemberSeasonAnnouncement(snapshot);
    const runtime = buildRuntimeSnapshot(patched);
    const changedSpirit = runtime.spirits.find(({ fullName }) => fullName === "加油蟹");
    const unchangedSpirit = runtime.spirits.find(({ fullName }) => fullName === "迪莫");
    const changedSkill = runtime.skills.find(({ name }) => name === "远程访问");

    expect(changedSpirit.changeInfo.patch.id).toBe("s4-preview-2026-09-10");
    expect(changedSkill.changeInfo.items[0]).toMatchObject({ field: "cost" });
    expect(unchangedSpirit.changeInfo).toBeUndefined();
    expect(runtime.currentPatchChanges).toBeUndefined();
  });

  test("S4 前瞻目录中的新精灵自动获得新增标记", () => {
    const announced = apply2026SeptemberSeasonAnnouncement(snapshot);
    const patched = applyS4PreviewCatalog(announced, catalog);
    const runtime = buildRuntimeSnapshot(patched);
    const spirit = runtime.spirits.find(({ fullName }) => fullName === "测风蝉");

    expect(spirit.changeInfo).toMatchObject({
      isNew: true,
      items: [expect.objectContaining({ kind: "new", label: "新增精灵" })],
    });
  });
});
