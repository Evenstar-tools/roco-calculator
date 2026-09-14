import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { SkillIcon } from "../../src/components/SkillIcon.jsx";
import { withCalculatorExtras } from "../../src/data/snapshot-extras.js";
import { getWishPowerIconUrl } from "../../src/data/wish-power-icons.js";

afterEach(cleanup);
const variants = withCalculatorExtras({ skills: [] }).skills;
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
