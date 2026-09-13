import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { WhatsNewDialog } from "../../src/components/WhatsNewDialog.jsx";
import { DataSourceDialog } from "../../src/components/DataSourceDialog.jsx";

test("补丁内容不能替换五项赛季功能，入口可逐项触发", () => {
  const open = vi.fn(); const history = vi.fn();
  render(<WhatsNewDialog open release={{version:"v2.0.1",whatsNew:{title:"补丁",items:[]}}} onOpenFeature={open} onOpenHistory={history} />);
  expect(screen.getAllByRole("listitem")).toHaveLength(5);
  for (const name of ["查询技能查询", "打开耐久排行", "打开速度线排行", "分析精灵能力分析", "切换S4 赛季主题"]) fireEvent.click(screen.getByRole("button", { name }));
  expect(open.mock.calls.flat()).toEqual(["skills", "durability", "speed", "ability", "theme"]);
  fireEvent.click(screen.getByRole("button", { name: "完整版本记录" }));expect(history).toHaveBeenCalledOnce();
});
test("从功能介绍可直接进入完整记录", () => {
  render(<DataSourceDialog open initialView="release" />);
  expect(screen.getByRole("heading", { name: "完整版本记录", level: 2 })).toBeInTheDocument();
});
