import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { expect, test, vi } from "vitest";
import mapping from "../../public/data/lineup-code-map.json";
import snapshot from "../../data/snapshots/current.json";
import fixture from "../fixtures/qiandao-lineup.json";
import { TeamDrawer } from "../../src/components/TeamDrawer.jsx";
import { decodeLineupCode, encodeLineupCode } from "../../src/state/lineup-code.js";
import { teamPresetsRepository } from "../../src/state/team-presets.js";

function Harness() {
  const [store] = useState(() => {
    const data = new Map();
    let id = 0;
    return teamPresetsRepository({ storage: { getItem: key => data.get(key), setItem: (key, value) => data.set(key, value) }, idFactory: () => `lineup-${++id}` });
  });
  const [teamsState, setTeamsState] = useState(() => store.create(store.load(snapshot), "保留的队伍"));
  return <TeamDrawer open snapshot={snapshot} teamsState={teamsState}
    onClose={() => {}} onRenameTeam={() => {}}
    onImportTeam={team => { setTeamsState(store.importTeam(teamsState, team)); return true; }}
    onMemberChange={(id, index, member) => setTeamsState(store.updateMember(teamsState, id, index, member))} />;
}

test("import opens the first occupied slot, focuses IVs, and keeps other pending members", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => mapping }));
  try {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "编辑空位 6" }));
    fireEvent.click(screen.getByRole("button", { name: "导入阵容" }));
    const raw = decodeLineupCode(fixture.code);
    raw.members[0].spriteId = null;
    raw.members[0].skills = [null, null, null, null];
    fireEvent.change(await screen.findByLabelText("阵容码或分享链接"), { target: { value: encodeLineupCode(raw) } });
    fireEvent.click(screen.getByRole("button", { name: "解析阵容" }));
    expect(screen.getByText("已解析 5 位精灵 · 20 个技能")).toBeVisible();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "保存并调整个体" }));
    const editor = await screen.findByRole("region", { name: "成员 2 配置" });
    await waitFor(() => expect(within(editor).getByLabelText("物攻个体")).toHaveFocus());
    expect(within(editor).getByText("个体待设置")).toBeVisible();
    expect(screen.getByRole("option", { name: "保留的队伍" })).toBeInTheDocument();
    fireEvent.change(within(editor).getByLabelText("HP个体"), { target: { value: "60" } });
    expect(within(editor).queryByText("个体待设置")).not.toBeInTheDocument();
    expect(screen.getAllByText("个体待设置")).toHaveLength(4);
    expect(within(editor).getByLabelText("HP个体")).toHaveValue(60);
  } finally {
    vi.unstubAllGlobals();
  }
});
