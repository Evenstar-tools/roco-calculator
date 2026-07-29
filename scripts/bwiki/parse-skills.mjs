import { load } from "cheerio";
import {
  absoluteBwikiUrl,
  cleanText,
  originalPatchwikiUrl,
  sourceRef,
  stableId,
  toInteger,
} from "./normalize.mjs";

const CATEGORY_MAP = new Map([
  ["物攻", "physical"],
  ["魔攻", "magical"],
  ["双攻", "dual"],
  ["防御", "defense"],
  ["状态", "status"],
]);

function parseSkillRow($, row, source) {
  const cells = $(row).children("td").toArray();
  if (cells.length < 7) return null;
  const nameLink = $(cells[1]).find("a[title]").first();
  const name = cleanText(nameLink.attr("title") ?? nameLink.text() ?? $(cells[1]).text());
  if (!name) return null;

  const categoryName = cleanText($(row).attr("data-param1") ?? $(cells[3]).text());
  const type = cleanText(
    $(row).attr("data-param2") ??
      $(cells[2]).find(".dex-type > span").last().text() ??
      $(cells[2]).text(),
  );
  const icon = $(cells[0]).find("img[src]").first();
  const detailUrl = absoluteBwikiUrl(nameLink.attr("href"));
  const ref = sourceRef(source);

  return {
    id: stableId("skill", name, detailUrl),
    name,
    type,
    category: CATEGORY_MAP.get(categoryName) ?? "status",
    cost: toInteger($(cells[4]).attr("data-sort-value") ?? $(cells[4]).text()) ?? 0,
    basePower: toInteger($(cells[5]).attr("data-sort-value") ?? $(cells[5]).text()),
    description: cleanText($(cells[6]).text()),
    ruleId: null,
    ruleParams: null,
    detailUrl,
    asset: {
      sourceUrl: originalPatchwikiUrl(icon.attr("src")),
      width: toInteger(icon.attr("data-file-width") ?? icon.attr("width")),
      height: toInteger(icon.attr("data-file-height") ?? icon.attr("height")),
    },
    source: ref,
    provenance: {
      identity: ref,
      type: ref,
      category: ref,
      cost: ref,
      basePower: ref,
      description: ref,
      asset: ref,
    },
  };
}

export function parseSkillRows(html, source = {}) {
  const $ = load(html);
  const unique = new Map();
  for (const row of $("tr.divsort").toArray()) {
    const skill = parseSkillRow($, row, source);
    if (skill && !unique.has(skill.id)) unique.set(skill.id, skill);
  }
  return [...unique.values()];
}
