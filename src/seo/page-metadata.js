export const HOME_PAGE_METADATA = Object.freeze({
  title: "洛克计算器｜洛克王国：世界 PVP 伤害计算与配队",
  description: "洛克计算器 RocoCalc（Roco Calculator）是免费的洛克王国：世界 PVP 伤害计算工具，采用国服 S4 数据，支持队伍搭配、技能检索、属性查询、速度耐久排行与电鹿斩杀线。提供网页版和 Windows 版。",
  canonical: "https://rococalc.top/",
});

export const DEER_PAGE_METADATA = Object.freeze({
  title: "电鹿斩杀线计算器 | 洛克计算器 RocoCalc",
  description: "洛克计算器 RocoCalc 的电鹿斩杀线工具，采用洛克王国：世界国服 S4 数据，按特性层数、防御配置和战斗条件比较技能伤害、击倒所需层数与先发补刀结果。",
  canonical: "https://rococalc.top/dianlu/",
});

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
}
