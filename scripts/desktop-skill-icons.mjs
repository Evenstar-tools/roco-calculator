import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const localIconPattern = /^\/assets\/skills\/skill_[a-f0-9]{16}\.png$/u;

function clientChannels(clientRoot) {
  const previewRoot = path.join(clientRoot, "pre");
  return existsSync(previewRoot) ? [clientRoot, previewRoot] : [clientRoot];
}

export function verifyDesktopSkillIcons(clientRoot) {
  let count = 0;
  for (const channelRoot of clientChannels(clientRoot)) {
    const runtime = JSON.parse(readFileSync(path.join(channelRoot, "data/runtime.json"), "utf8"));
    for (const skill of runtime.skills) {
      if (!localIconPattern.test(skill.iconUrl ?? "")) throw new Error(`技能图标未内置：${skill.name}`);
      const bytes = readFileSync(path.join(channelRoot, skill.iconUrl));
      if (bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") throw new Error(`技能图标损坏：${skill.name}`);
    }
    count += runtime.skills.length;
  }
  return count;
}

export function prepareDesktopClient(projectRoot) {
  const output = path.join(projectRoot, "release");
  mkdirSync(output, { recursive: true });
  // 独立暂存桌面资源，不改动用于网页发布的 dist/client。
  const clientRoot = mkdtempSync(path.join(output, "desktop-client-"));
  cpSync(path.join(projectRoot, "dist/client"), clientRoot, { recursive: true });
  for (const channelRoot of clientChannels(clientRoot)) {
    // 网页底部导航只用于网站发现；桌面副本从加载前移除，避免闪现。
    for (const relativePath of ["index.html", "dianlu/index.html"]) {
      const pagePath = path.join(channelRoot, relativePath);
      const html = readFileSync(pagePath, "utf8");
      writeFileSync(pagePath, html.replace(/<footer class="site-links">[\s\S]*?<\/footer>/u, ""), "utf8");
    }
    const runtimePath = path.join(channelRoot, "data/runtime.json");
    const runtime = JSON.parse(readFileSync(runtimePath, "utf8"));
    mkdirSync(path.join(channelRoot, "assets/skills"), { recursive: true });
    for (const skill of runtime.skills) {
      if (localIconPattern.test(skill.iconUrl ?? "")) continue;
      if (!/^skill_[a-f0-9]{16}$/u.test(skill.id)) throw new Error(`技能 ID 无效：${skill.name}`);
      const iconUrl = `/assets/skills/${skill.id}.png`;
      copyFileSync(path.join(projectRoot, "data/desktop-skill-icons", `${skill.id}.png`), path.join(channelRoot, iconUrl));
      // /pre/ 的资源前缀由其运行时投影添加，原始数据仍使用本频道根路径。
      skill.iconUrl = iconUrl;
    }
    writeFileSync(runtimePath, JSON.stringify(runtime), "utf8");
  }
  console.log(`桌面离线技能图标检查通过：${verifyDesktopSkillIcons(clientRoot)} 个`);
  return clientRoot;
}
