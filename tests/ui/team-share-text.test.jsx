import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import shareText from "../fixtures/game-lineup-share.txt?raw";
import mapping from "../../public/data/lineup-code-map.json";
import snapshot from "../../data/snapshots/current.json";
import { TeamExchange } from "../../src/components/TeamExchange.jsx";
import { exportLineupCode } from "../../src/state/lineup-code.js";

test("pastes the entire game share into the existing import flow and saves all six members", () => {
  const onImport = vi.fn(() => true);
  render(<TeamExchange mode="import" snapshot={snapshot} mapping={mapping} onImport={onImport} />);
  fireEvent.change(screen.getByLabelText("阵容码或分享链接"), { target: { value: shareText } });
  fireEvent.click(screen.getByText("解析阵容"));
  expect(screen.getByText("已解析 6 位精灵 · 24 个技能")).toBeVisible();
  expect(screen.getByText("银月狼王")).toBeVisible();
  expect(screen.getByText("布灵布灵")).toBeVisible();
  expect(onImport).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("checkbox", { name: /已确认个体处理/ }));
  fireEvent.click(screen.getByText("保存并调整个体"));
  expect(onImport).toHaveBeenCalledTimes(1);
  const saved = onImport.mock.calls[0][0];
  expect(saved.members.filter(Boolean)).toHaveLength(6);
  expect(exportLineupCode(saved, snapshot, mapping).code).toContain("B~Gxf~~~H~C~");
});
