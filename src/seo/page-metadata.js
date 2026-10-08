export const PAGE_SCHEMA_ID = "rococalc-page-schema";
export const SITE_NAME = "洛克计算器";
export const SITE_IMAGE = "https://rococalc.top/app-icon-512.png";

export const HOME_PAGE_METADATA = Object.freeze({
  name: SITE_NAME,
  title: "洛克王国：世界伤害计算器 | 洛克计算器",
  description: "免费的洛克王国：世界 PVP 伤害计算器，支持 S4 月涌狂想数据、伤害计算、电鹿斩杀线、队伍搭配、技能检索、属性查询与速度耐久排行。可在浏览器使用，也提供 Windows 桌面版。",
  canonical: "https://rococalc.top/",
});

export const DEER_PAGE_METADATA = Object.freeze({
  name: "电鹿斩杀线计算器",
  title: "电鹿斩杀线计算器 | 洛克王国：世界",
  description: "洛克王国：世界电鹿斩杀线工具，支持 S4 月涌狂想数据，按特性层数、防御配置和战斗条件查看技能伤害、击倒所需层数与先发补刀结果，辅助 PVP 对局配置。",
  canonical: "https://rococalc.top/dianlu/",
});

export function createPageStructuredData(metadata) {
  return {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: metadata.name,
    url: metadata.canonical,
    description: metadata.description,
    applicationCategory: "UtilitiesApplication",
    operatingSystem: "Web",
    inLanguage: "zh-CN",
  };
}

export function isWebDocument(targetDocument = globalThis.document) {
  return /^https?:$/.test(targetDocument?.location?.protocol ?? "");
}

function uniqueHeadElement(targetDocument, selector, tagName) {
  const [existing, ...duplicates] = targetDocument.head.querySelectorAll(selector);
  duplicates.forEach((element) => element.remove());
  if (existing) return existing;
  const element = targetDocument.createElement(tagName);
  targetDocument.head.append(element);
  return element;
}

function setMeta(targetDocument, attribute, name, content) {
  const element = uniqueHeadElement(targetDocument, `meta[${attribute}="${name}"]`, "meta");
  element.setAttribute(attribute, name);
  element.setAttribute("content", content);
}

export function applyPageMetadata(metadata, targetDocument = globalThis.document) {
  // Desktop app: URLs retain the desktop title behavior and never gain web canonicals.
  if (!isWebDocument(targetDocument)) return;
  uniqueHeadElement(targetDocument, "title", "title").textContent = metadata.title;
  setMeta(targetDocument, "name", "description", metadata.description);
  const canonical = uniqueHeadElement(targetDocument, 'link[rel="canonical"]', "link");
  canonical.setAttribute("rel", "canonical");
  canonical.setAttribute("href", metadata.canonical);
  for (const [name, content] of Object.entries({
    "og:type": "website",
    "og:locale": "zh_CN",
    "og:site_name": SITE_NAME,
    "og:title": metadata.title,
    "og:description": metadata.description,
    "og:url": metadata.canonical,
    "og:image": SITE_IMAGE,
  })) setMeta(targetDocument, "property", name, content);
  for (const [name, content] of Object.entries({
    "twitter:card": "summary",
    "twitter:title": metadata.title,
    "twitter:description": metadata.description,
    "twitter:image": SITE_IMAGE,
  })) setMeta(targetDocument, "name", name, content);
  const schema = uniqueHeadElement(targetDocument, `script[id="${PAGE_SCHEMA_ID}"]`, "script");
  schema.id = PAGE_SCHEMA_ID;
  schema.type = "application/ld+json";
  schema.textContent = JSON.stringify(createPageStructuredData(metadata));
}
