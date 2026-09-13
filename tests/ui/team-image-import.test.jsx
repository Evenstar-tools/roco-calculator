import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import shareText from "../fixtures/game-lineup-share.txt?raw";
import mapping from "../../public/data/lineup-code-map.json";
import snapshot from "../../data/snapshots/current.json";
import { TeamExchange } from "../../src/components/TeamExchange.jsx";
import { decodeLineupImage } from "../../src/state/lineup-image.js";

vi.mock("../../src/state/lineup-image.js", () => ({ decodeLineupImage: vi.fn() }));
beforeEach(() => vi.resetAllMocks());
function upload() {
  fireEvent.change(screen.getByLabelText("上传配队图"), { target: { files: [new File(["fixture"], "team.jpg", { type: "image/jpeg" })] } });
}

test("image result uses the existing preview and requires confirmation before saving", async () => {
  decodeLineupImage.mockResolvedValue({ text: shareText, kind: "阵容码候选", supported: true });
  const onImport = vi.fn(() => true);
  render(<TeamExchange mode="import" snapshot={snapshot} mapping={mapping} onImport={onImport} />);
  upload();
  expect(await screen.findByText("已解析 6 位精灵 · 24 个技能")).toBeVisible();
  expect(onImport).not.toHaveBeenCalled();
  expect(screen.getByText("保存并调整个体")).toBeDisabled();
  fireEvent.click(screen.getByRole("checkbox", { name: /已确认个体处理/ }));
  fireEvent.click(screen.getByText("保存并调整个体"));
  expect(onImport.mock.calls[0][0].members.filter(Boolean)).toHaveLength(6);
});

test("unknown QR content stays visible without creating a team", async () => {
  decodeLineupImage.mockResolvedValue({ text: "https://example.invalid/short", kind: "其他链接", supported: false });
  render(<TeamExchange mode="import" snapshot={snapshot} mapping={mapping} />);
  upload();
  expect(await screen.findByRole("alert")).toHaveTextContent("不是已支持的阵容格式");
  expect(screen.getByLabelText("二维码原始内容")).toHaveValue("https://example.invalid/short");
  expect(screen.queryByText("保存并调整个体")).not.toBeInTheDocument();
});

test("editing text discards an older image result", async () => {
  let finish;
  decodeLineupImage.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  render(<TeamExchange mode="import" snapshot={snapshot} mapping={mapping} />);
  upload();
  fireEvent.change(screen.getByLabelText("阵容码或分享链接"), { target: { value: "新输入" } });
  await act(async () => finish({ text: shareText, supported: true }));
  expect(screen.getByLabelText("阵容码或分享链接")).toHaveValue("新输入");
  expect(screen.queryByText("已解析 6 位精灵 · 24 个技能")).not.toBeInTheDocument();
});

test("decoder failure allows another upload", async () => {
  decodeLineupImage.mockRejectedValue(new Error("未识别到清晰二维码"));
  render(<TeamExchange mode="import" snapshot={snapshot} mapping={mapping} />);
  upload();
  expect(await screen.findByRole("alert")).toHaveTextContent("未识别到清晰二维码");
  expect(screen.getByRole("button", { name: "上传配队图" })).toBeEnabled();
  upload();
  expect(decodeLineupImage).toHaveBeenCalledTimes(2);
});
