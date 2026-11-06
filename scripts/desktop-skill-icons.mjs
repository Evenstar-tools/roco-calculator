import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getWishPowerIconUrl } from "../src/data/wish-power-icons.js";

const localIconPattern = /^\/assets\/skills\/(?:skill_[a-zA-Z0-9_-]+|wish-power\/\d+)\.png$/u;

function clientChannels(clientRoot) {
  const channels = [{ root: clientRoot, runtime: "data/runtime.json" }];
  const previewRoot = path.join(clientRoot, "pre");
  if (existsSync(previewRoot)) channels.push({ root: previewRoot, runtime: "data/runtime.json" });
  const globalRoot = path.join(clientRoot, "global-assets");
  if (existsSync(globalRoot)) channels.push({
    root: globalRoot, runtime: "data/global-runtime.json", catalog: "data/global/skill-query/catalog.json",
  });
  return channels;
}

function catalogSkills(catalog) {
  return [...(catalog.sharedSkills ?? []), ...(catalog.seasons ?? []).flatMap((season) => season.skills ?? [])]
    .filter((skill) => skill && typeof skill === "object");
}

function verifySkillIcons(channelRoot, skills) {
  for (const skill of skills) {
    if (!localIconPattern.test(skill.iconUrl ?? "")) throw new Error(`技能图标未内置：${skill.name}`);
    const bytes = readFileSync(path.join(channelRoot, skill.iconUrl));
    if (bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") throw new Error(`技能图标损坏：${skill.name}`);
  }
}

export function verifyDesktopSkillIcons(clientRoot) {
  let count = 0;
  for (const channel of clientChannels(clientRoot)) {
    const runtime = JSON.parse(readFileSync(path.join(channel.root, channel.runtime), "utf8"));
    verifySkillIcons(channel.root, runtime.skills);
    count += runtime.skills.length;
    if (channel.catalog) {
      const catalog = JSON.parse(readFileSync(path.join(channel.root, channel.catalog), "utf8"));
      verifySkillIcons(channel.root, catalogSkills(catalog));
    }
  }
  return count;
}

function prepareSkillIcons(projectRoot, channelRoot, skills) {
  mkdirSync(path.join(channelRoot, "assets/skills"), { recursive: true });
  for (const skill of skills) {
    // 国际服保留地区 ID，仅按显式来源 ID 复用相同技能的离线图片。
    const sourceId = skill.id?.startsWith("cn-placeholder:")
      ? skill.reference?.sourceId ?? skill.id.slice("cn-placeholder:".length)
      : skill.id;
    const wishPowerIconUrl = getWishPowerIconUrl(sourceId);
    if (wishPowerIconUrl) skill.iconUrl = wishPowerIconUrl;
    if (localIconPattern.test(skill.iconUrl ?? "")) continue;
    if (!/^skill_[a-f0-9]{16}$/u.test(sourceId)) throw new Error(`技能 ID 无效：${skill.name}`);
    const iconUrl = `/assets/skills/${sourceId}.png`;
    copyFileSync(path.join(projectRoot, "data/desktop-skill-icons", `${sourceId}.png`), path.join(channelRoot, iconUrl));
    // /pre/、/global-assets/ 前缀由对应运行时投影添加，原始数据保留频道根路径。
    skill.iconUrl = iconUrl;
  }
}

export function prepareDesktopClient(projectRoot) {
  const output = path.join(projectRoot, "release");
  mkdirSync(output, { recursive: true });
  // 独立暂存桌面资源，不改动用于网页发布的 dist/client。
  const clientRoot = mkdtempSync(path.join(output, "desktop-client-"));
  const webRoot = path.resolve(projectRoot, "dist/client");
  // The CN introduction remains behind the same one-use Easter egg gate offline.
  cpSync(webRoot, clientRoot, { recursive: true });
  for (const channel of clientChannels(clientRoot)) {
    // 网页底部导航只用于网站发现；桌面副本从加载前移除，避免闪现。
    for (const relativePath of channel.catalog ? [] : ["index.html", "dianlu/index.html"]) {
      const pagePath = path.join(channel.root, relativePath);
      const html = readFileSync(pagePath, "utf8");
      writeFileSync(pagePath, html.replace(/<footer class="site-links">[\s\S]*?<\/footer>/u, ""), "utf8");
    }
    const runtimePath = path.join(channel.root, channel.runtime);
    const runtime = JSON.parse(readFileSync(runtimePath, "utf8"));
    prepareSkillIcons(projectRoot, channel.root, runtime.skills);
    if (runtime.meta?.counts) {
      for (const field of ["spirits", "skills", "learnsets", "traits"]) {
        if (Array.isArray(runtime[field])) runtime.meta.counts[field] = runtime[field].length;
      }
    }
    writeFileSync(runtimePath, JSON.stringify(runtime), "utf8");
    if (channel.catalog) {
      const catalogPath = path.join(channel.root, channel.catalog);
      const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
      prepareSkillIcons(projectRoot, channel.root, catalogSkills(catalog));
      writeFileSync(catalogPath, JSON.stringify(catalog), "utf8");
    }
  }
  console.log(`桌面离线技能图标检查通过：${verifyDesktopSkillIcons(clientRoot)} 个`);
  return clientRoot;
}
