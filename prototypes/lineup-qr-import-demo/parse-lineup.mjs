import fs from "node:fs";

import mapping from "../../public/data/lineup-code-map.json" with { type: "json" };
import snapshot from "../../data/snapshots/current.json" with { type: "json" };
import { NATURES } from "../../src/domain/natures.js";
import {
  decodeLineupCode,
  exportLineupCode,
  importLineupCode,
  LINEUP_MODES,
} from "../../src/state/lineup-code.js";

const BLOOD_NAMES = {
  normal: "普通血脉", grass: "草血脉", fire: "火血脉", water: "水血脉",
  light: "光血脉", ground: "地血脉", ice: "冰血脉", dragon: "龙血脉",
  electric: "电血脉", poison: "毒血脉", bug: "虫血脉", martial: "武血脉",
  wing: "翼血脉", moe: "萌血脉", ghost: "幽血脉", evil: "恶血脉",
  machine: "机血脉", phantom: "幻血脉", boss: "首领血脉",
};

function fail(error) {
  process.stderr.write(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

try {
  const input = fs.readFileSync(0, "utf8").trim();
  const raw = decodeLineupCode(input);
  const team = importLineupCode(input, snapshot, mapping);
  const exported = exportLineupCode(team, snapshot, mapping, team.lineup);
  const spirits = new Map(snapshot.spirits.map((spirit) => [spirit.id, spirit]));
  const skills = new Map(snapshot.skills.map((skill) => [skill.id, skill]));
  const natures = new Map(NATURES.map((nature) => [nature.id, nature]));

  const members = team.members.map((member, index) => {
    if (!member) return null;
    const spirit = spirits.get(member.spiritId);
    return {
      slot: index + 1,
      spiritId: member.spiritId,
      externalSpiritId: member.lineupSource?.spriteId ?? null,
      name: spirit?.fullName ?? spirit?.name ?? member.spiritId,
      bloodline: BLOOD_NAMES[member.bloodlineType] ?? member.bloodlineType,
      nature: natures.get(member.natureId)?.name ?? member.natureId,
      ivsPending: Boolean(member.ivsPending),
      talents: member.lineupSource?.talents ?? [],
      skills: member.skills.four.map((skillId, skillIndex) => ({
        id: skillId,
        externalId: member.lineupSource?.skills?.[skillIndex] ?? null,
        name: skillId ? (skills.get(skillId)?.name ?? skillId) : "空技能位",
      })),
    };
  });

  process.stdout.write(JSON.stringify({
    name: team.name,
    protocol: { version: 1, memberCount: raw.members.length },
    lineup: {
      count: team.lineup.count,
      modeId: team.lineup.mode,
      modeName: LINEUP_MODES[team.lineup.mode] ?? "未指定模式",
      magicId: team.lineup.magicId,
      magicName: mapping.magic[team.lineup.magicId] ?? (team.lineup.magicId ? `魔法 ${team.lineup.magicId}` : "无共鸣魔法"),
    },
    members,
    export: exported,
  }));
} catch (error) {
  fail(error);
}
