import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import SharePreviewSheet from "../src/components/SharePreviewSheet.jsx";
import SharedResultPage from "../src/components/SharedResultPage.jsx";
import { createCalculatorStore } from "../src/state/calculator-store.js";

function snapshotFixture() {
  const raceStats = {
    hp: 100,
    magicalAttack: 100,
    magicalDefense: 100,
    physicalAttack: 100,
    physicalDefense: 100,
    speed: 100,
  };
  return {
    learnsets: [],
    meta: { id: "test-data", rulesVersion: "test-rules" },
    skills: [],
    spirits: [
      { fullName: "狼灵", id: "wolf", raceStats, types: ["普通"] },
      { fullName: "月兽", id: "moon", raceStats, types: ["普通"] },
    ],
    traits: [],
    typeChart: { matrix: [[1]], types: ["普通"] },
  };
}

const WARNING = "配置未完整携带，请核对配点、技能及条件";

describe("share completeness warning", () => {
  test("仅新参数分享提示好友使用最新版", () => {
    const { rerender } = render(<SharePreviewSheet open requiresLatestClient summary={{ conditions: [] }} view={{}} />);
    expect(screen.getByText("含新参数，好友需使用最新版。")).toBeInTheDocument();
    rerender(<SharePreviewSheet open requiresLatestClient={false} summary={{ conditions: [] }} view={{}} />);
    expect(screen.queryByText("含新参数，好友需使用最新版。")).not.toBeInTheDocument();
  });
  test.each(["reduced", "minimal"])(
    "warns before sending a %s payload without claiming a complete readback",
    (completeness) => {
      render(
        <SharePreviewSheet
          completeness={completeness}
          open
          summary={{ conditions: [] }}
          view={{}}
        />,
      );

      expect(screen.getByText(WARNING)).toBeInTheDocument();
      expect(screen.queryByText("将发送完整配置")).not.toBeInTheDocument();
    },
  );

  test.each([
    ["full", "完整配置", false],
    ["reduced", "核心配置", true],
    ["minimal", "基础配置", true],
  ])(
    "labels an opened %s payload and warns only when it is incomplete",
    (completeness, label, warningExpected) => {
      const snapshot = snapshotFixture();
      render(
        <SharedResultPage
          completeness={completeness}
          snapshot={snapshot}
          state={createCalculatorStore(snapshot).getState()}
          view={{ rows: [] }}
        />,
      );

      expect(screen.getByText(label)).toBeInTheDocument();
      expect(Boolean(screen.queryByText(WARNING))).toBe(warningExpected);
    },
  );

  test("does not warn for a full payload", () => {
    render(
      <SharePreviewSheet
        completeness="full"
        open
        summary={{ conditions: [] }}
        view={{}}
      />,
    );

    expect(screen.queryByText(WARNING)).not.toBeInTheDocument();
    expect(screen.getByText("将发送完整配置")).toBeInTheDocument();
  });
});
