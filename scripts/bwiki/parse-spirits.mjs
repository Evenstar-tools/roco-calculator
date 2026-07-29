import { load } from "cheerio";
import {
  absoluteBwikiUrl,
  cleanText,
  originalPatchwikiUrl,
  sourceRef,
  splitFullName,
  stableId,
  toInteger,
} from "./normalize.mjs";

function textFromCell($, cell) {
  return cleanText($(cell).attr("data-sort-value") ?? $(cell).text());
}

function parseTypes($, row, cells) {
  const fromMarkup = $(cells[3])
    .find(".dex-type > span")
    .map((_, element) => cleanText($(element).text()))
    .get()
    .filter(Boolean);
  if (fromMarkup.length > 0) return [...new Set(fromMarkup)];
  return [$(row).attr("data-param2"), $(row).attr("data-param3")]
    .map(cleanText)
    .filter(Boolean);
}

function parseSpiritRow($, row, source) {
  const cells = $(row).children("td").toArray();
  if (cells.length < 12) return null;
  const nameLink = $(cells[2]).find("a[title]").first();
  const fullName = cleanText(nameLink.attr("title") ?? nameLink.text() ?? $(cells[2]).text());
  if (!fullName) return null;

  const { baseName, variantName } = splitFullName(fullName);
  const stats = cells.slice(5, 12).map((cell) => toInteger(textFromCell($, cell)));
  const [hp, speed, physicalAttack, magicalAttack, physicalDefense, magicalDefense, total] = stats;
  const portrait = $(cells[1]).find("img[src]").first();
  const ref = sourceRef(source);
  const detailUrl = absoluteBwikiUrl(nameLink.attr("href"));
  const traitName = cleanText($(cells[4]).find(".dex-pet-feature span").last().text() || $(cells[4]).text());

  return {
    id: stableId("spirit", textFromCell($, cells[0]), fullName, detailUrl),
    dexNo: textFromCell($, cells[0]).padStart(3, "0"),
    baseName,
    variantName,
    fullName,
    stage: cleanText($(row).attr("data-param1")),
    sourceCategory: cleanText($(row).attr("data-param4")),
    types: parseTypes($, row, cells),
    raceStats: {
      hp,
      speed,
      physicalAttack,
      magicalAttack,
      physicalDefense,
      magicalDefense,
      total,
    },
    traitIds: traitName ? [stableId("trait", traitName)] : [],
    traitName,
    detailUrl,
    asset: {
      sourceUrl: originalPatchwikiUrl(portrait.attr("src")),
      width: toInteger(portrait.attr("data-file-width") ?? portrait.attr("width")),
      height: toInteger(portrait.attr("data-file-height") ?? portrait.attr("height")),
    },
    source: ref,
    provenance: {
      identity: ref,
      types: ref,
      raceStats: ref,
      traitIds: ref,
      asset: ref,
    },
  };
}

export function parseSpiritRows(html, source = {}) {
  const $ = load(html);
  return $("table.wikitable tr.divsort")
    .toArray()
    .map((row) => parseSpiritRow($, row, source))
    .filter(Boolean);
}
