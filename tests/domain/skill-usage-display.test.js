import { expect, test } from "vitest";
import { skillUsageDisplay } from "../../src/domain/skill-presentation.js";

test("未使用只展示下次效果，不生成零状态摘要", () => {
  const display = skillUsageDisplay({ count: 0, powerGain: 0, hitCountGain: 0 }, "本次可得：普·威力+10");
  expect(display.status).toBe("");
  expect(display.next).toBe("本次可得：普·威力+10");
});

test("使用记录和实际加成合成一行，不重复累计威力", () => {
  const display = skillUsageDisplay({ count: 2, powerGain: 20, hitCountGain: 2,
    currentEffects: ["静态威力 +20", "魔攻 +6 层", "速度 +40"] });
  expect(display.status).toBe("累计状态：已使用×2　增益：威力+20 · 连击+2　当前：魔攻 +6 层 · 速度 +40");
});

test("手动值优先，历史次数保留，覆盖说明不重复", () => {
  const display = skillUsageDisplay({ count: 2, powerGain: 20, manualPower: true,
    currentEffects: ["静态威力 80（手动）", "魔攻 +5 层"] });
  expect(display.status).toBe("累计状态：已使用×2　当前：静态威力 80（手动） · 魔攻 +5 层");
  expect(display.status).not.toContain("威力+20");
});
