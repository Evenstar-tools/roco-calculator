import { cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import DeerPage from "../../src/features/deer/DeerPage.jsx";
import { useDamageComparison } from "../../src/features/damage-comparison/useDamageComparison.js";
import { createInitialState } from "../../src/state/defaults.js";

vi.mock("../../src/runtime/load-snapshot.js", () => ({
  loadServerSnapshot: vi.fn().mockRejectedValue(new Error("private/data.json: failed to fetch")),
}));
vi.mock("../../src/domain/skill-damage-ranking.js", async (original) => ({
  ...await original(),
  createSkillDamageRanking: vi.fn().mockRejectedValue(new Error("private/ranking.js: internal failure")),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test("电鹿资料失败显示可恢复提示，不泄露内部错误或修改存档", async () => {
  localStorage.setItem("runtime-error-saved-draft", "keep-original");
  render(<DeerPage />);
  expect(await screen.findByRole("alert")).toHaveTextContent("资料加载失败，请重试。");
  expect(document.body.textContent).not.toMatch(/private\/data|failed to fetch/);
  const reload = vi.fn();
  const realWindow = window;
  vi.stubGlobal("window", new Proxy(realWindow, {
    get(target, property) {
      if (property === "location") return { reload };
      return Reflect.get(target, property, target);
    },
  }));
  fireEvent.click(screen.getByRole("button", { name: "重新加载" }));
  expect(reload).toHaveBeenCalledOnce();
  expect(localStorage.getItem("runtime-error-saved-draft")).toBe("keep-original");
});

test("承伤计算失败只返回用户提示，停止加载并保留输入", async () => {
  const stats = { hp: 100, physicalAttack: 100, magicalAttack: 100, physicalDefense: 100, magicalDefense: 100, speed: 100 };
  const snapshot = { meta: { id: "comparison-error" }, traits: [],
    spirits: ["甲", "乙"].map((name) => ({ id: name, fullName: name, types: ["火"], raceStats: stats, stage: "首领" })),
    skills: [{ id: "hit", name: "火焰", type: "火", category: "magical", basePower: 80 }],
  };
  const source = { state: createInitialState(snapshot), direction: "forward" };
  const original = JSON.stringify(source);
  const { result } = renderHook(() => useDamageComparison(snapshot, source));
  await waitFor(() => expect(result.current.error).toBe("计算失败，请重新打开"));
  expect(result.current.loading).toBe(false);
  expect(JSON.stringify(source)).toBe(original);
});
