import { copyFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const localIconPattern = /^\/assets\/skills\/skill_[a-f0-9]{16}\.png$/u;

export function verifyDesktopSkillIcons(clientRoot) {
  const runtime = JSON.parse(readFileSync(path.join(clientRoot, "data/runtime.json"), "utf8"));
  for (const skill of runtime.skills) {
    if (!localIconPattern.test(skill.iconUrl ?? "")) throw new Error(`技能图标未内置：${skill.name}`);
    const bytes = readFileSync(path.join(clientRoot, skill.iconUrl));
    if (bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") throw new Error(`技能图标损坏：${skill.name}`);
  }
  return runtime.skills.length;
}

export function prepareDesktopClient(projectRoot) {
  const output = path.join(projectRoot, "release");
  mkdirSync(output, { recursive: true });
  // 独立暂存桌面资源，不改动用于网页发布的 dist/client。
  const clientRoot = mkdtempSync(path.join(output, "desktop-client-"));
  cpSync(path.join(projectRoot, "dist/client"), clientRoot, { recursive: true });
  const runtimePath = path.join(clientRoot, "data/runtime.json");
  const runtime = JSON.parse(readFileSync(runtimePath, "utf8"));
  mkdirSync(path.join(clientRoot, "assets/skills"), { recursive: true });
  for (const skill of runtime.skills) {
    if (localIconPattern.test(skill.iconUrl ?? "")) continue;
    if (!/^skill_[a-f0-9]{16}$/u.test(skill.id)) throw new Error(`技能 ID 无效：${skill.name}`);
    const iconUrl = `/assets/skills/${skill.id}.png`;
    copyFileSync(path.join(projectRoot, "data/desktop-skill-icons", `${skill.id}.png`), path.join(clientRoot, iconUrl));
    skill.iconUrl = iconUrl;
  }
  writeFileSync(runtimePath, JSON.stringify(runtime), "utf8");
  console.log(`桌面离线技能图标检查通过：${verifyDesktopSkillIcons(clientRoot)} 个`);
  return clientRoot;
}
