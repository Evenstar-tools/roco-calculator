import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { sha256Hex } from "./normalize.mjs";

const GRAVITY_ID = "skill_f7eea4de117d30ed";
const DOLL_ID = "spirit_d8e175477972f74d";
const OLD_MIDNIGHT_ID = "skill_1652bda550a6b2dc";
const MIDNIGHT_ID = "skill_15fb272dc50faf16";
const source = (index, sha256) => ({
  title: `洛克手册截图 ${index}：用户确认技能名称修正`,
  url: `urn:rock-calculator:source:s4-manual-2026-09-09:image:${index}`,
  revision: "user-confirmed-2026-09-09", fetchedAt: "2026-09-09T00:00:00+08:00", sha256,
});

export function applyS4NameCorrections(snapshot) {
  if (snapshot.meta.nrcSync?.authoritativeLearnsets) return structuredClone(snapshot);
  const next = structuredClone(snapshot);
  const gravity = next.skills.find(({ id }) => id === GRAVITY_ID);
  const midnight = next.skills.find(({ id }) => id === MIDNIGHT_ID);
  const doll = next.spirits.find(({ id }) => id === DOLL_ID);
  const learned = next.learnsets.find(({ spiritId }) => spiritId === DOLL_ID);
  if (!gravity || !["引力旋转", "引力偏转"].includes(gravity.name) ||
    next.skills.some(({ id, name }) => id !== GRAVITY_ID && name === "引力偏转") ||
    midnight?.name !== "午夜噪音" || midnight.category !== "magical" || midnight.type !== "幽" ||
    midnight.cost !== 4 || midnight.basePower !== 20 || doll?.fullName !== "摇铃魔偶" || !learned) {
    throw new Error("两处技能名称修正的身份或参数发生漂移");
  }
  const gravitySource = source(18, "9d97c61143f754f6a82ed936fa0c3af4f7d5f9d207450732592020a33e66ac0e");
  const midnightSource = source(27, "f73a8e9031a1a76f06c7c7865a97296ee25fe52bd58505eadf778553feb7a173");
  gravity.name = "引力偏转";
  gravity.provenance = { ...gravity.provenance, name: gravitySource };
  const migrate = (ids) => [...new Set(ids.map((id) => id === OLD_MIDNIGHT_ID ? MIDNIGHT_ID : id))];
  learned.skillIds = migrate(learned.skillIds);
  if (learned.defaultSkillIds) learned.defaultSkillIds = migrate(learned.defaultSkillIds);
  if (learned.acquisitions?.[OLD_MIDNIGHT_ID]) {
    learned.acquisitions[MIDNIGHT_ID] = [...new Set([
      ...(learned.acquisitions[MIDNIGHT_ID] ?? []), ...learned.acquisitions[OLD_MIDNIGHT_ID],
    ])];
    delete learned.acquisitions[OLD_MIDNIGHT_ID];
  }
  learned.provenance = { ...learned.provenance, midnightNameCorrection: {
    source: midnightSource, previousSkillId: OLD_MIDNIGHT_ID, skillId: MIDNIGHT_ID,
    status: "user-confirmed-screenshot", bwikiLearnsetConfirmed: false,
  } };
  next.meta.s4NameCorrections = { gravitySource, midnightSource, status: "user-confirmed-screenshot",
    note: "按用户确认的截图更正；不代表 BWIKI 已确认 S4 名称或摇铃魔偶学习关系。保留历史占位实体，不扩大到其他待核字段。" };
  next.meta.contentSha256 = null;
  next.meta.contentSha256 = sha256Hex(JSON.stringify(next));
  return next;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = path.resolve(process.argv[2] ?? ".");
  const target = path.join(root, "data/snapshots/current.json");
  const original = await readFile(target, "utf8");
  const updated = applyS4NameCorrections(JSON.parse(original));
  const newline = original.includes("\r\n") ? "\r\n" : "\n";
  await writeFile(target, (JSON.stringify(updated, null, 2) + "\n").replace(/\n/g, newline), "utf8");
  const presetsPath = path.join(root, "public/data/presets/pvp-popular-configs.json");
  const presetsText = await readFile(presetsPath, "utf8");
  const presets = JSON.parse(presetsText);
  const preset = presets.entries.find(({ spiritId }) => spiritId === DOLL_ID);
  if (preset?.skills.includes(OLD_MIDNIGHT_ID)) {
    preset.skills = preset.skills.map((id) => id === OLD_MIDNIGHT_ID ? MIDNIGHT_ID : id);
    await writeFile(presetsPath, (JSON.stringify(presets, null, 2) + "\n").replace(/\n/g, presetsText.includes("\r\n") ? "\r\n" : "\n"), "utf8");
  }
  console.log(`两处修正已应用：${updated.meta.contentSha256}`);
}
