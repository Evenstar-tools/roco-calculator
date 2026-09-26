import mapping from "../../public/data/lineup-code-map.json";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import snapshot from "../../data/snapshots/current.json";
import fixture from "../fixtures/qiandao-lineup.json";
import { TeamExchange } from "../../src/components/TeamExchange.jsx";
import { importLineupCode, decodeLineupCode, encodeLineupCode } from "../../src/state/lineup-code.js";

test("自动共鸣随首领血脉增删切换，手动选择优先且切换队伍不串值", () => {
  const team = importLineupCode(fixture.code, snapshot, mapping);
  delete team.lineup;
  team.id = "auto-team";
  team.members[0].bloodlineType = "electric";
  const props = { mapping, mode: "export", team, snapshot };
  const { rerender } = render(<TeamExchange {...props} />);
  const magic = () => screen.getByLabelText("共鸣魔法");
  const codeMagic = () => decodeLineupCode(screen.getByLabelText("阵容代码").value).magicId;
  expect(magic()).toHaveValue("104002");
  expect(codeMagic()).toBe(104002);
  const bossTeam = { ...team, members: team.members.map((member, index) => index === 0 ? { ...member, bloodlineType: "boss" } : member) };
  rerender(<TeamExchange {...props} team={bossTeam} />);
  expect(magic()).toHaveValue("104007");
  expect(codeMagic()).toBe(104007);
  rerender(<TeamExchange {...props} />);
  expect(magic()).toHaveValue("104002");
  fireEvent.change(magic(), { target: { value: "104001" } });
  rerender(<TeamExchange {...props} team={bossTeam} />);
  expect(magic()).toHaveValue("104001");
  expect(codeMagic()).toBe(104001);
  rerender(<TeamExchange {...props} team={{ ...bossTeam, id: "other-team" }} />);
  expect(magic()).toHaveValue("104007");
});

test("已保存自动选择会重新计算，手动无共鸣和原导入值保持不变", () => {
  const team = importLineupCode(fixture.code, snapshot, mapping);
  team.id = "auto";
  team.lineup = { ...team.lineup, magicId: 104002, magicSelection: "auto" };
  const props = { mapping, mode: "export", team, snapshot };
  const { rerender } = render(<TeamExchange {...props} />);
  expect(screen.getByLabelText("共鸣魔法")).toHaveValue("104007");
  rerender(<TeamExchange {...props} team={{ ...team, id: "manual", lineup: { magicId: null, magicSelection: "manual", mode: 5 } }} />);
  expect(screen.getByLabelText("共鸣魔法")).toHaveValue("");
  rerender(<TeamExchange {...props} team={{ ...team, id: "imported", lineup: { magicId: 104002, mode: 5 } }} />);
  expect(screen.getByLabelText("共鸣魔法")).toHaveValue("104002");
});

test("new team defaults to one PVP option and actually copies a lineup containing duplicate-name skills", async () => {
  const team = importLineupCode(fixture.code, snapshot, mapping);
  delete team.lineup;
  delete team.members[0].lineupSource;
  team.members[0].skills.four[0] = mapping.skills[7020860];
  team.id = "test";
  const update = vi.fn(() => true);
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  render(<TeamExchange mapping={mapping} mode="export" team={team} snapshot={snapshot} onUpdateLineup={update} />);
  const mode = screen.getByLabelText("编队模式");
  expect(mode).toHaveValue("5");
  expect(within(mode).getAllByRole("option").map(option => option.textContent)).toEqual(["PVP"]);
  const code = screen.getByLabelText("阵容代码").value;
  expect(decodeLineupCode(code).members[0].skills[0]).toBe(7020860);
  fireEvent.click(screen.getByText("复制阵容码"));
  expect(await screen.findByRole("status")).toHaveTextContent("阵容码已复制");
  expect(writeText).toHaveBeenCalledWith(code);
  expect(update).toHaveBeenCalledWith("test", { magicId: 104007, magicSelection: "auto", mode: 5 });
});

test.each([1, 2, null, 42])("preserves imported mode %s and allows explicit conversion to PVP", (mode) => {
  const raw = decodeLineupCode(fixture.code);
  raw.mode = mode;
  const code = encodeLineupCode(raw);
  const team = importLineupCode(code, snapshot, mapping);
  render(<TeamExchange mapping={mapping} mode="export" team={team} snapshot={snapshot} />);
  expect(screen.getByLabelText("阵容代码")).toHaveValue(code);
  const select = screen.getByLabelText("编队模式");
  expect(within(select).getAllByRole("option")).toHaveLength(2);
  expect(select.selectedOptions[0].textContent).toContain("原阵容");
  fireEvent.change(select, { target: { value: "5" } });
  expect(decodeLineupCode(screen.getByLabelText("阵容代码").value).mode).toBe(5);
});

test("preview requires explicit IV assumption acknowledgement and never imports stale input", () => {
  const onImport = vi.fn(() => true);
  const viewSnapshot = { ...snapshot, spirits: snapshot.spirits.map(spirit => ({ ...spirit, asset: { localUrl: `./assets/spirits/${spirit.id}.png` } })) };
  render(<TeamExchange mapping={mapping} mode="import" snapshot={viewSnapshot} onImport={onImport} />);
  const input = screen.getByLabelText("阵容码或分享链接");
  fireEvent.change(input, { target: { value: fixture.code } });
  fireEvent.click(screen.getByText("解析阵容"));
  expect(screen.getByText("加油蟹（单只海葵的样子）")).toBeVisible();
  expect(screen.queryByLabelText("阵容码或分享链接")).not.toBeInTheDocument();
  expect(screen.getByText("已解析 6 位精灵 · 24 个技能")).toBeVisible();
  expect(screen.getAllByText("原码个体待确认")).toHaveLength(6);
  expect(screen.getAllByRole("img")).toHaveLength(6);
  expect(screen.getByText("保存并调整个体")).toBeDisabled();
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.change(screen.getByLabelText("新队伍名称"), { target: { value: "S4电鹿轮转" } });
  fireEvent.click(screen.getByText("保存并调整个体"));
  expect(onImport).toHaveBeenCalledWith(expect.objectContaining({ name: "S4电鹿轮转" }));
  fireEvent.click(screen.getByText("修改代码"));
  expect(screen.getByLabelText("阵容码或分享链接")).toHaveValue(fixture.code);
  expect(screen.getByLabelText("阵容码或分享链接")).toHaveFocus();
  fireEvent.change(screen.getByLabelText("阵容码或分享链接"), { target: { value: "bad" } });
  expect(screen.queryByText("保存并调整个体")).not.toBeInTheDocument();
  fireEvent.click(screen.getByText("解析阵容"));
  expect(screen.getByRole("alert")).toBeVisible();
  expect(onImport).toHaveBeenCalledTimes(1);
});

test("recommendations are opt-in, reversible, and never replace known or unknown source selections", () => {
  const raw = decodeLineupCode(fixture.code);
  raw.members[0].talents = [null, null, null];
  raw.members[1].talents = [1, 4, 5];
  const onImport = vi.fn(() => true);
  render(<TeamExchange mapping={mapping} presets={[]} mode="import" snapshot={snapshot} onImport={onImport} />);
  fireEvent.change(screen.getByLabelText("阵容码或分享链接"), { target: { value: encodeLineupCode(raw) } });
  fireEvent.click(screen.getByText("解析阵容"));
  const recommendation = screen.getByRole("checkbox", { name: /使用推荐/ });
  expect(recommendation).not.toBeChecked();
  expect(screen.getAllByText("原码个体待确认")).toHaveLength(4);
  expect(screen.getByText("原码选择 · 按 60 恢复")).toBeVisible();
  fireEvent.click(screen.getByText("缺失项全部推荐"));
  expect(recommendation).toBeChecked();
  fireEvent.click(recommendation);
  expect(recommendation).not.toBeChecked();
  fireEvent.click(recommendation);
  fireEvent.click(screen.getByRole("checkbox", { name: /已确认个体处理/ }));
  fireEvent.click(screen.getByText("保存并调整个体"));
  const members = onImport.mock.calls[0][0].members;
  expect(members[0].ivsPending).toBe(false);
  expect(Object.values(members[0].displayIvs).filter(value => value === 60)).toHaveLength(3);
  expect(members[1].displayIvs).toMatchObject({ hp: 60, physicalDefense: 60, magicalDefense: 60 });
  expect(members[2].ivsPending).toBe(true);
  expect(members[2].lineupSource.talents).toEqual([80, 80, 80]);
});

test("export exposes the exact code and provides a manual fallback when clipboard fails", async () => {
  const writeText = vi.fn().mockRejectedValue(new Error("denied"));
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  const update = vi.fn(() => true);
  render(<TeamExchange mapping={mapping} mode="export" team={{ ...importLineupCode(fixture.code, snapshot, mapping), id: "test" }} snapshot={snapshot} onUpdateLineup={update} />);
  expect(screen.getByLabelText("阵容代码")).toHaveValue(fixture.code);
  expect(screen.getAllByRole("textbox")).toHaveLength(1);
  expect(screen.queryByLabelText("官方分享链接")).not.toBeInTheDocument();
  fireEvent.click(screen.getByText("复制分享链接"));
  expect(await screen.findByLabelText("官方分享链接")).toHaveFocus();
  expect(screen.getByLabelText("官方分享链接").value).toContain("shareData=" + fixture.code);
  expect(screen.getAllByRole("textbox")).toHaveLength(1);
  fireEvent.click(screen.getByText("复制阵容码"));
  expect(await screen.findByRole("alert")).toHaveTextContent("手动复制");
  expect(await screen.findByLabelText("阵容代码")).toHaveValue(fixture.code);
  expect(writeText).toHaveBeenCalledWith(fixture.code);
  expect(update).toHaveBeenCalledWith("test", { magicId: 104007, magicSelection: "manual", mode: 5 });
});

test("successful copying keeps one code preview and announces the copied kind", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  render(<TeamExchange mapping={mapping} mode="export" team={{ ...importLineupCode(fixture.code, snapshot, mapping), id: "test" }} snapshot={snapshot} onUpdateLineup={() => true} />);
  fireEvent.click(screen.getByText("复制分享链接"));
  expect(await screen.findByRole("status")).toHaveTextContent("分享链接已复制");
  expect(screen.getAllByRole("textbox")).toHaveLength(1);
  expect(screen.getByLabelText("阵容代码")).toHaveValue(fixture.code);
});
