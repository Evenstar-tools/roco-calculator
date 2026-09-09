import { NATURES, normalizeNatureId } from "../domain/natures.js";
import { inspectLineupIvs } from "./lineup-ivs.js";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const BLOODS = [null, "normal", "grass", "fire", "water", "light", "ground", "ice", "dragon", "electric", "poison", "bug", "martial", "wing", "moe", "ghost", "evil", "machine", "phantom", "boss"];
const STATS = ["hp", "physicalAttack", "magicalAttack", "physicalDefense", "magicalDefense", "speed"];
const OFFICIAL_URL = "https://rocom.qq.com/act/a20250703array/index.html";

export const LINEUP_MODES = { 1: "大世界", 2: "PVP 1v1", 3: "PVP 2v2", 4: "PVP 3v3", 5: "PVP 4v4", 6: "PVP 随机", 7: "PVE 挑战替补", 8: "PVE NPC", 9: "PVE BOSS", 10: "PVP 5v5", 11: "PVE 周挑战" };

function readNumber(field, nullable = false) {
  if (nullable && /^0+$/.test(field)) return null;
  if (!/^[A-Za-z0-9_+-/]+~*$/.test(field)) throw new Error("阵容码字段无效");
  return [...field.replace(/~/g, "").replace(/\+/g, "-").replace(/\//g, "_")]
    .reduce((value, char) => value * 64 + ALPHABET.indexOf(char), 0);
}

function writeNumber(value, width, nullable = false) {
  if (value == null && nullable) return "0".repeat(width);
  if (!Number.isSafeInteger(value) || value < 0 || value >= 64 ** width) throw new Error("阵容字段超出范围");
  let text = "";
  do { text = ALPHABET[value % 64] + text; value = Math.floor(value / 64); } while (value);
  return text.padEnd(width, "~");
}

export function decodeLineupCode(input) {
  const text = String(input ?? "").trim().replace(/\\~/g, "~");
  if (text.length > 4096) throw new Error("阵容码或分享链接过长");
  const shared = text.match(/[?&]shareData=([^&#\s]+)/);
  let code;
  let name = "导入的队伍";
  try {
    code = decodeURIComponent(shared ? shared[1] : text).replace(/\+/g, "-").replace(/\//g, "_");
    const named = text.match(/[?&]name=([^&#\s]*)/);
    if (named) name = decodeURIComponent(named[1].replace(/\+/g, " ")).slice(0, 80) || name;
  } catch { throw new Error("分享链接编码无效"); }
  if (!/^[A-Za-z0-9_~-]{8,512}$/.test(code)) throw new Error("请粘贴完整的游戏／千岛阵容码或官方分享链接");
  if (readNumber(code.slice(0, 2)) !== 1) throw new Error("暂不支持该版本的阵容码");
  const count = readNumber(code[2]);
  if (count < 1 || count > 6 || code.length !== 8 + 39 * count) throw new Error("阵容码不完整：人数或长度不符");
  let offset = 3;
  const read = (width, nullable = false) => {
    const value = readNumber(code.slice(offset, offset + width), nullable);
    offset += width;
    return value;
  };
  const members = Array.from({ length: count }, () => ({
    spriteId: read(5, true), bloodlineId: read(2, true), natureId: read(2, true),
    talents: Array.from({ length: 3 }, () => read(2, true)),
    skills: Array.from({ length: 4 }, () => read(5, true)),
  }));
  const magicId = read(4, true);
  const mode = code[offset] === "0" ? (offset++, null) : read(1);
  for (const member of members) member.overrides = [read(2), read(2)];
  return { name, members, magicId, mode };
}

export function encodeLineupCode(lineup) {
  if (lineup.members.length < 1 || lineup.members.length > 6) throw new Error("阵容需要 1 至 6 个位置");
  const num = writeNumber;
  return num(1, 2) + num(lineup.members.length, 1) + lineup.members.map((member) =>
    num(member.spriteId, 5, true) + num(member.bloodlineId, 2, true) + num(member.natureId, 2, true) +
    member.talents.map((id) => num(id, 2, true)).join("") + member.skills.map((id) => num(id, 5, true)).join(""),
  ).join("") + num(lineup.magicId, 4, true) + (lineup.mode == null ? "0" : num(lineup.mode, 1)) +
    lineup.members.map((member) => member.overrides.map((id) => num(id, 2)).join("")).join("");
}

function effectiveNature(raw) {
  const nature = raw.natureId == null ? NATURES[0] : NATURES[raw.natureId];
  if (!nature) throw new Error(`未支持的性格 ${raw.natureId}`);
  if (raw.overrides.every((value) => value === 0)) return nature.id;
  const [up, down] = raw.overrides;
  if (up > 6 || down > 6) throw new Error("未支持的性格改写");
  const matched = NATURES.find((entry) => entry.upStat === (up ? STATS[up - 1] : nature.upStat) && entry.downStat === (down ? STATS[down - 1] : nature.downStat));
  if (!matched) throw new Error("此性格改写无法用于当前计算器");
  return matched.id;
}

export function importLineupCode(input, snapshot, mapping) {
  const lineup = decodeLineupCode(input);
  const spiritIds = new Set(snapshot.spirits.map((entry) => entry.id));
  const skillIds = new Set(snapshot.skills.map((entry) => entry.id));
  const members = lineup.members.map((raw, index) => {
    if (raw.spriteId == null) return null;
    const spiritId = mapping.spirits[raw.spriteId];
    if (!spiritIds.has(spiritId)) throw new Error(`第 ${index + 1} 位精灵尚未支持（${raw.spriteId}），未导入队伍`);
    if (raw.bloodlineId != null && !BLOODS[raw.bloodlineId]) throw new Error(`第 ${index + 1} 位血脉尚未支持（${raw.bloodlineId}）`);
    const four = raw.skills.map((id) => {
      if (id == null) return null;
      const skillId = mapping.skills[id];
      if (!skillIds.has(skillId)) throw new Error(`第 ${index + 1} 位技能尚未支持（${id}），未导入队伍`);
      return skillId;
    });
    return {
      spiritId, natureId: effectiveNature(raw), bloodlineType: BLOODS[raw.bloodlineId] ?? "normal",
      displayIvs: inspectLineupIvs(raw.talents).values,
      ...(inspectLineupIvs(raw.talents).status !== "selected" ? { ivsPending: true } : {}),
      skills: { four, single: four.find(Boolean) ?? null },
      lineupSource: raw,
    };
  });
  if (!members.some(Boolean)) throw new Error("阵容中没有精灵");
  return {
    name: lineup.name,
    members: Array.from({ length: 6 }, (_, index) => members[index] ?? null),
    lineup: { magicId: lineup.magicId, mode: lineup.mode, count: lineup.members.length },
  };
}

function externalId(table, localId, original, label) {
  if (!localId) return null;
  if (original != null && table[original] === localId) return original;
  const candidates = Object.keys(table).filter((id) => table[id] === localId);
  if (candidates.length !== 1) throw new Error(`${label}${candidates.length ? "有多个游戏形态，无法确定导出 ID" : "尚无游戏 ID 映射"}`);
  return Number(candidates[0]);
}

function skillId(value) { return typeof value === "string" ? value : value?.skillId ?? value?.id ?? null; }

export function exportLineupCode(team, snapshot, mapping, options = team.lineup ?? {}) {
  if (!team.members.some(Boolean)) throw new Error("请先添加队伍成员");
  const spirits = new Map(snapshot.spirits.map((entry) => [entry.id, entry]));
  const skills = new Map(snapshot.skills.map((entry) => [entry.id, entry]));
  const members = team.members.map((member, index) => {
    if (!member) return { spriteId: null, bloodlineId: null, natureId: null, talents: [null, null, null], skills: [null, null, null, null], overrides: [0, 0] };
    const spirit = spirits.get(member.spiritId);
    if (!spirit) throw new Error(`第 ${index + 1} 位精灵数据不存在`);
    if (member.skills.four.slice(4).some(skillId)) throw new Error(`${spirit.fullName}超过四个技能，请先保留四个技能再导出`);
    const source = member.lineupSource;
    const natureId = normalizeNatureId(member.natureId);
    const unchangedNature = source && effectiveNature(source) === natureId;
    const bloodlineType = member.bloodlineType ?? (spirit.stage === "首领" ? "boss" : "normal");
    const bloodlineId = BLOODS.indexOf(bloodlineType);
    if (bloodlineId < 1) throw new Error(`${spirit.fullName}的血脉无法导出`);
    const originalTalents = source?.spriteId && mapping.spirits[source.spriteId] === member.spiritId ? source.talents : [null, null, null];
    const originalValues = inspectLineupIvs(originalTalents).values;
    const unchangedIvs = STATS.every(stat => Number(member.displayIvs?.[stat] ?? 0) === originalValues[stat]);
    const selected = STATS.flatMap((stat, index) => Number(member.displayIvs?.[stat] ?? 0) > 0 ? [index + 1] : []);
    if (!unchangedIvs && selected.length > 3) throw new Error(`${spirit.fullName}超过三项个体选择，无法导出`);
    return {
      spriteId: externalId(mapping.spirits, member.spiritId, source?.spriteId, spirit.fullName),
      bloodlineId: source && (BLOODS[source.bloodlineId] ?? "normal") === bloodlineType ? source.bloodlineId : bloodlineId,
      natureId: unchangedNature ? source.natureId : (NATURES.findIndex((nature) => nature.id === natureId) || null),
      overrides: unchangedNature ? source.overrides : [0, 0],
      // 未编辑时原样保留未知字段；编辑后仅导出所选属性，不编码具体数值。
      talents: unchangedIvs ? originalTalents : Array.from({ length: 3 }, (_, index) => selected[index] ?? null),
      skills: Array.from({ length: 4 }, (_, slot) => {
        const id = skillId(member.skills.four[slot]);
        if (id && !skills.has(id)) throw new Error(`${spirit.fullName}的技能数据不存在`);
        return externalId(mapping.skills, id, source?.skills[slot], skills.get(id)?.name ?? "技能");
      }),
    };
  });
  const last = team.members.findLastIndex(Boolean) + 1;
  const count = Math.max(last, Math.min(6, team.lineup?.count ?? 6));
  const code = encodeLineupCode({ members: members.slice(0, count), magicId: options.magicId ?? null, mode: options.mode ?? null });
  return { code, url: `${OFFICIAL_URL}?shareData=${encodeURIComponent(code)}&name=${encodeURIComponent(team.name)}` };
}
