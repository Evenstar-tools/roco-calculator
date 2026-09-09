import { existsSync, readFileSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { expect, test } from "vitest";
import { prepareDesktopClient, verifyDesktopSkillIcons } from "../../scripts/desktop-skill-icons.mjs";

test("每个当前技能都有可内置的 PNG 图标", () => {
  const snapshot = JSON.parse(readFileSync("data/snapshots/current.json", "utf8"));
  const missing = snapshot.skills.filter((skill) => {
    const file = skill.asset?.sourceUrl?.startsWith("/assets/skills/")
      ? path.join("public", skill.asset.sourceUrl)
      : path.join("data/desktop-skill-icons", `${skill.id}.png`);
    return !existsSync(file) || readFileSync(file).subarray(0, 8).toString("hex") !== "89504e470d0a1a0a";
  }).map(({ name }) => name);
  expect(missing, "技能图标不可依赖桌面 CSP 禁止的外链").toEqual([]);
});

test("桌面暂存将外链替换为本地文件，同时保留网页产物及已有本地图标", () => {
  const root = mkdtempSync(path.join(tmpdir(), "desktop-skill-icons-"));
  const web = path.join(root, "dist/client");
  mkdirSync(path.join(web, "data"), { recursive: true });
  mkdirSync(path.join(web, "assets/skills"), { recursive: true });
  mkdirSync(path.join(root, "data/desktop-skill-icons"), { recursive: true });
  const png = Buffer.from("89504e470d0a1a0a", "hex");
  const remoteId = "skill_0000000000000001";
  const localId = "skill_0000000000000002";
  const runtime = JSON.stringify({ skills: [
    { id: remoteId, name: "远程技能", iconUrl: "https://example.com/icon.png" },
    { id: localId, name: "临时技能", iconUrl: `/assets/skills/${localId}.png` },
  ] });
  writeFileSync(path.join(web, "data/runtime.json"), runtime);
  writeFileSync(path.join(web, `assets/skills/${localId}.png`), png);
  expect(() => verifyDesktopSkillIcons(web)).toThrow("未内置");
  expect(() => prepareDesktopClient(root)).toThrow();
  writeFileSync(path.join(root, `data/desktop-skill-icons/${remoteId}.png`), png);
  const staged = prepareDesktopClient(root);
  expect(verifyDesktopSkillIcons(staged)).toBe(2);
  expect(readFileSync(path.join(web, "data/runtime.json"), "utf8")).toBe(runtime);
  writeFileSync(path.join(staged, `assets/skills/${remoteId}.png`), "broken");
  expect(() => verifyDesktopSkillIcons(staged)).toThrow("损坏");
});
