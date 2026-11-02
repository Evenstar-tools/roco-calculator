import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { SkillIcon } from "../../src/components/SkillIcon.jsx";
import { withCalculatorExtras } from "../../src/data/snapshot-extras.js";
import { getWishPowerIconUrl } from "../../src/data/wish-power-icons.js";
import { localizeGlobalSkill } from "../../src/runtime/global-entity-localization.js";

afterEach(cleanup);
const variants = withCalculatorExtras({ skills: [] }).skills;
const globalVariants = JSON.parse(readFileSync("data/snapshots/global/s3-midseason.json", "utf8"))
  .skills.filter(skill => skill.reference?.sourceId?.startsWith("calculator_wish_power_"));
const typeNumbers = { 普通: 7700001, 草: 7700002, 火: 7700003, 水: 7700004, 光: 7700005,
  地: 7700007, 冰: 7700008, 龙: 7700009, 电: 7700010, 毒: 7700011, 虫: 7700012,
  武: 7700013, 翼: 7700014, 萌: 7700015, 幽: 7700016, 恶: 7700017, 机械: 7700018, 幻: 7700019 };

test("愿力冲击 18 属性逐一绑定原图，资源真实存在且哈希一致", () => {
  const manifest = JSON.parse(readFileSync("public/assets/skills/wish-power/manifest.json", "utf8"));
  expect(variants).toHaveLength(18);
  expect(manifest.assets).toHaveLength(18);
  for (const skill of variants) {
    const url = getWishPowerIconUrl(skill.id);
    expect(url).toBe(`/assets/skills/wish-power/${typeNumbers[skill.type]}.png`);
    const bytes = readFileSync(`public${url}`);
    expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([128, 128]);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(manifest.assets.find((a) => a.localFile === url)?.sha256);
  }
});

test.each(variants)("$type 系愿力冲击使用完整技能图片而非缩小属性兜底图标", (skill) => {
  const { container } = render(<SkillIcon skill={skill} label />);
  const img = screen.getByRole("img", { name: "愿力冲击图标" });
  expect(img).toHaveAttribute("src", getWishPowerIconUrl(skill.id));
  expect(img).toHaveAttribute("width", "28");
  expect(container.querySelector(".skill-icon--fallback")).toBeNull();
  fireEvent.error(img);
  expect(screen.getByRole("img", { name: skill.type })).toBeVisible();
});

test("未知技能与异常编号不绑定愿力原图", () => {
  for (const id of [null, "skill_abc", "calculator_wish_power_unknown", "calculator_wish_power_toString", "calculator_wish_power_../../evil"]) {
    expect(getWishPowerIconUrl(id)).toBeNull();
  }
});

test.each(["zh-CN", "en", "ja"])("国际服真实参考身份在 %s 显示下，18属性均使用对应愿力原图", (locale) => {
  const localized = globalVariants.map(skill => localizeGlobalSkill(skill, locale));
  expect(localized).toHaveLength(18);
  expect(new Set(localized.map(skill => skill.name))).toEqual(new Set([{ "zh-CN": "愿力冲击", en: "Wishpower Blast", ja: "願いの波動" }[locale]]));
  const { container } = render(<>{localized.map(skill => <SkillIcon key={skill.id} skill={skill} />)}</>);
  const icons = container.querySelectorAll("img.skill-icon");
  expect(icons).toHaveLength(18);
  icons.forEach((icon, index) => expect(icon).toHaveAttribute("src", `/assets/skills/wish-power/${typeNumbers[localized[index].type]}.png`));
});

test.each(["愿力冲击", "Wishpower Blast", "願いの波動"])("标准技能身份的正式名 %s 按真实属性覆盖通用图片", (name) => {
  const canonical = variants.map(skill => ({ ...skill, id: "skill_0123456789abcdef", name, iconUrl: "https://example.test/generic.png" }));
  const { container } = render(<>{canonical.map(skill => <SkillIcon key={skill.type} skill={skill} />)}</>);
  const icons = container.querySelectorAll("img.skill-icon");
  expect(icons).toHaveLength(18);
  icons.forEach((icon, index) => expect(icon).toHaveAttribute("src", `/assets/skills/wish-power/${typeNumbers[canonical[index].type]}.png`));
});

test("参考ID和对象属性精确识别，未知属性或相似名称不借用普通系原图", () => {
  expect(getWishPowerIconUrl({ id: "global-wish", reference: { sourceId: "calculator_wish_power_fire" }, type: "火" }))
    .toBe("/assets/skills/wish-power/7700003.png");
  expect(getWishPowerIconUrl({ id: "global-wish", sourceId: "skill_0123456789abcdef", name: "願いの波動", type: "水" }))
    .toBe("/assets/skills/wish-power/7700004.png");
  for (const skill of [
    { id: "skill_0123456789abcdef", name: "愿力冲击", type: "未知" },
    { id: "calculator_wish_power_fire", type: "未知" },
    { id: "calculator_wish_power_fire", type: ["普通"] },
    { id: "skill_0123456789abcdef", name: "愿力冲击" },
    { id: "skill_0123456789abcdef", name: "强化愿力冲击", type: "普通" },
    { id: "skill_0123456789abcdef", name: "抓挠", aliases: ["愿力冲击"], type: "普通" },
    { id: "not-a-skill", name: "愿力冲击", type: "普通" },
  ]) expect(getWishPowerIconUrl(skill)).toBeNull();
  const { container } = render(<SkillIcon skill={{ id: "skill_0123456789abcdef", name: "抓挠", type: "普通", iconUrl: "https://example.test/scratch.png" }} />);
  expect(container.querySelector("img.skill-icon")).toHaveAttribute("src", "https://example.test/scratch.png");
});
