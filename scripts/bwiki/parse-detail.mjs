import { load } from "cheerio";
import {
  cleanText,
  originalPatchwikiUrl,
  sourceRef,
  toInteger,
} from "./normalize.mjs";

function splitList(value) {
  const text = cleanText(value);
  if (!text || text === "无") return [];
  return text
    .split(/[、,，]/u)
    .map(cleanText)
    .filter(Boolean);
}

function parseRelationTitle(title, type) {
  const groups = {};
  for (const line of String(title ?? "").split(/\r?\n|&#10;/u)) {
    const match = cleanText(line).match(/^([^：:]+)[：:](.*)$/u);
    if (match) groups[match[1]] = splitList(match[2]);
  }
  if (!type || Object.keys(groups).length === 0) return null;
  return {
    type,
    strongAgainst: groups["克制"] ?? [],
    weakTo: groups["被克制"] ?? [],
    resists: groups["抵抗"] ?? [],
    resistedBy: groups["被抵抗"] ?? [],
  };
}

export function parseDetailPage(html, source = {}) {
  const $ = load(html);
  const ref = sourceRef(source);
  const traitName = cleanText($(".sprite-trait-name").first().text());
  const traitDescription = cleanText($(".sprite-trait-desc").first().text());
  const skills = new Map();
  $(".sprite-skill-list .skill-single").each((_, element) => {
    const row = $(element);
    const name = cleanText(row.find(".skill-name").first().text());
    if (!name) return;
    const acquisition = cleanText(row.find(".skill-source").first().text());
    const current = skills.get(name) ?? {
      name,
      acquisition: [],
      sourceCategory: cleanText(row.attr("data-param1")),
      provenance: ref,
    };
    if (acquisition && !current.acquisition.includes(acquisition)) {
      current.acquisition.push(acquisition);
    }
    skills.set(name, current);
  });

  const relationNode = $(".sprite_type[title*='克制']").first();
  const type = cleanText(relationNode.clone().children().remove().end().text());
  const typeRelations = parseRelationTitle(relationNode.attr("title"), type);
  const portraitCandidates = $(
    ".imgAll-sprite-img[src], .d-tab-contents .tab-content > img[src]",
  ).toArray();
  portraitCandidates.sort((left, right) => {
    const area = (element) =>
      (toInteger($(element).attr("data-file-width")) ?? 0) *
      (toInteger($(element).attr("data-file-height")) ?? 0);
    return area(right) - area(left);
  });
  const portrait = $(portraitCandidates[0]);
  const portraitAsset = portrait.length
    ? {
        sourceUrl: originalPatchwikiUrl(portrait.attr("src")),
        width: toInteger(portrait.attr("data-file-width") ?? portrait.attr("width")),
        height: toInteger(portrait.attr("data-file-height") ?? portrait.attr("height")),
      }
    : null;
  const evolutionNames = [
    ...new Set(
      $(".sprite-evolve-main [data-link]")
        .map((_, element) => cleanText($(element).attr("data-link")))
        .get()
        .filter(Boolean),
    ),
  ];

  return {
    evolutionNames,
    trait: traitName
      ? { name: traitName, description: traitDescription, provenance: ref }
      : null,
    skills: [...skills.values()],
    typeRelations,
    portraitAsset,
    source: ref,
  };
}

export function extractRevisionFromHtml(html) {
  const configMatch = html.match(/"wgRevisionId"\s*:\s*(\d+)/u);
  if (configMatch) return Number.parseInt(configMatch[1], 10);
  const oldIdMatch = html.match(/[?&]oldid=(\d+)/u);
  return oldIdMatch ? Number.parseInt(oldIdMatch[1], 10) : null;
}
