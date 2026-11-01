// @vitest-environment node
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { skillLearners, unpackCatalog } from "../../src/features/skill-query/catalog.js";
import { querySeasonChangeInfo, withS5AnnouncementCatalog } from "../../src/features/skill-query/s5-announcement-catalog.js";
import { applyS5SeasonAnnouncement, S5_SEASON_ANNOUNCEMENT } from "../../src/features/s5-preview/season-announcement.js";
import { withWebPreview } from "../../src/features/s5-preview/with-web-preview.js";
import { querySpiritFamilies, spiritSkills } from "../../src/features/skill-query/query-model.js";
import { applyS5Bwiki } from "../../scripts/bwiki/apply-s5-bwiki.mjs";
import { applyS5Candymo } from "../../scripts/bwiki/apply-s5-candymo.mjs";
import { buildS5BwikiRuntime } from "../../scripts/s5-bwiki-runtime.mjs";

const loadCatalog = () => unpackCatalog(JSON.parse(readFileSync("public/data/skill-query/catalog.json", "utf8")));
const snapshot = { seasonAnnouncement: { id: S5_SEASON_ANNOUNCEMENT.patch.id } };
function freeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}

test("公告投影需要本轮快照标记与正式 S4 目录，保留缓存和历史资料", () => {
  const catalog = freeze(loadCatalog());
  expect(withS5AnnouncementCatalog(catalog)).toBe(catalog);
  expect(withS5AnnouncementCatalog(catalog, { seasonAnnouncement: { id: "other-patch" } })).toBe(catalog);
  const projected = withS5AnnouncementCatalog(catalog, snapshot);
  expect(projected).not.toBe(catalog);
  expect(projected.currentSeason).toBe("S5");
  expect(catalog.currentSeason).toBe("S4");
  expect(catalog.seasons.some(({ id }) => id === "S5")).toBe(false);
  for (const original of catalog.seasons) {
    expect(projected.seasons.find(({ id }) => id === original.id)).toBe(original);
  }
  const s5 = projected.seasons.find(({ id }) => id === "S5");
  expect(s5.skills.filter(({ changeInfo }) => changeInfo?.patch?.id === snapshot.seasonAnnouncement.id)).toHaveLength(10);
  expect(s5.skills.some(({ introducedSeason }) => introducedSeason === "S5")).toBe(false);
  expect(withS5AnnouncementCatalog(projected, snapshot)).toBe(projected);
});

test("正式 S5 目录及非 S4 目录不重放前瞻公告", () => {
  const catalog = loadCatalog();
  const formal = { ...catalog, currentSeason: "S5", seasons: [...catalog.seasons, { id: "S5" }] };
  expect(withS5AnnouncementCatalog(formal, snapshot)).toBe(formal);
  expect(withS5AnnouncementCatalog({ ...catalog, currentSeason: "S3" }, snapshot).currentSeason).toBe("S3");
});

test("精灵完整公告提示只进入 S5，正式 S4 详情不受种族值和特性提示影响", () => {
  const catalog = freeze(loadCatalog());
  const s4 = catalog.seasons.find(({ id }) => id === "S4");
  const spirit = s4.spirits.find(({ fullName }) => fullName === "冰钻布鲁斯");
  const changeInfo = { patch: S5_SEASON_ANNOUNCEMENT.patch, entityName: spirit.fullName,
    items: [{ kind: "stat", label: "物攻", before: 101, after: 90 }],
  };
  const data = withS5AnnouncementCatalog(catalog, { ...snapshot, spirits: [{ id: spirit.id, changeInfo }] });
  expect(data.seasons.find(({ id }) => id === "S5").spirits.find(({ id }) => id === spirit.id).changeInfo).toBe(changeInfo);
  expect(data.seasons.find(({ id }) => id === "S4").spirits.find(({ id }) => id === spirit.id)).toBe(spirit);
  expect(spirit.changeInfo).not.toBe(changeInfo);
});

test("真实 S4 烈火守护及技能旧台账进入 S5 普通查询，旧日期不变且不计入 S5 汇总", () => {
  const catalog = freeze(loadCatalog());
  const original = freeze(JSON.parse(readFileSync("data/snapshots/current.json", "utf8")));
  const full = applyS5SeasonAnnouncement(original);
  const data = withS5AnnouncementCatalog(catalog, full);
  const s5 = data.seasons.find(({ id }) => id === "S5");
  const fire = s5.spirits.find(({ fullName }) => fullName === "烈火守护");
  const bite = s5.skills.find(({ name }) => name === "撕咬");
  expect(fire.changeInfo.items).toEqual(original.currentPatchChanges.spirits.find(({ entityId }) => entityId === fire.id).items);
  expect(fire.changeInfo.patch.date).toBe("2026.09.10");
  expect(bite.changeInfo.patch.date).toBe("2026.09.10");
  expect(bite.changeInfo.items).toContainEqual(expect.objectContaining({ before: 30, after: 20 }));
  expect(querySeasonChangeInfo(s5, fire.changeInfo)).toBeNull();
  expect(querySeasonChangeInfo(s5, bite.changeInfo)).toBeNull();
  expect(s5.skills.filter((skill) => querySeasonChangeInfo(s5, skill.changeInfo)?.items.length)).toHaveLength(10);
  expect(data.seasons.find(({ id }) => id === "S4")).toBe(catalog.seasons.find(({ id }) => id === "S4"));
  expect(catalog.seasons.find(({ id }) => id === "S4").skills.find(({ id }) => id === bite.id).changeInfo).toBeUndefined();
});

test("S5 查询使用同一份运行时新精灵、专属技能及完整学习面，历史目录保持原样", () => {
  const catalog = freeze(loadCatalog());
  const full = freeze(withWebPreview(JSON.parse(readFileSync("public/data/runtime.json", "utf8"))));
  const data = withS5AnnouncementCatalog(catalog, full);
  const s5 = data.seasons.find(({ id }) => id === "S5");
  const previewSpirits = full.spirits.filter(spirit => spirit.previewIdentity);
  const previewSkills = full.skills.filter(skill => skill.previewIdentity);
  expect(previewSpirits.some(spirit => spirit.fullName === "地绡银龙")).toBe(true);
  expect(previewSkills.some(skill => skill.name === "矿物置换")).toBe(true);
  for (const spirit of previewSpirits) {
    expect(s5.spirits.find(({ id }) => id === spirit.id), spirit.fullName).toMatchObject(spirit);
  }
  for (const skill of previewSkills) {
    expect(s5.skills.find(({ id }) => id === skill.id), skill.name).toMatchObject({ ...skill, introducedSeason: "S5" });
  }
  const availableSkills = new Set(s5.skills.map(skill => skill.id));
  for (const pool of full.learnsets) {
    expect(s5.learnsets.find(({ spiritId }) => spiritId === pool.spiritId)?.skillIds, pool.spiritId)
      .toEqual(pool.skillIds.filter(id => availableSkills.has(id)));
  }
  expect(s5.skills.some(skill => skill.id.startsWith("calculator_wish_power_"))).toBe(false);
  expect(s5.skills.filter(skill => skill.introducedSeason === "S5").map(skill => skill.id).sort())
    .toEqual(expect.arrayContaining(previewSkills.map(skill => skill.id)));
  for (const id of ["skill_21fab1d8d76bbbfa", "skill_1652bda550a6b2dc"]) {
    expect(s5.skills.some(skill => skill.id === id && skill.introducedSeason === "S5")).toBe(false);
  }
  for (const season of catalog.seasons) expect(data.seasons.find(({ id }) => id === season.id)).toBe(season);
  expect(withS5AnnouncementCatalog(data, full)).toBe(data);
});

test("新家族按明确进化链收拢，精灵查技能及技能反查读取相同的当前关系", () => {
  const catalog = loadCatalog();
  const full = withWebPreview(JSON.parse(readFileSync("public/data/runtime.json", "utf8")));
  const s5 = withS5AnnouncementCatalog(catalog, full).seasons.find(({ id }) => id === "S5");
  const silver = s5.spirits.find(spirit => spirit.fullName === "地绡银龙");
  const exchange = s5.skills.find(skill => skill.name === "矿物置换");
  expect(spiritSkills(s5, silver.id).map(skill => skill.id)).toContain(exchange.id);
  const families = querySpiritFamilies(s5, { query: "地银链", skillIds: [exchange.id] });
  expect(families).toHaveLength(1);
  expect(families[0].members.map(spirit => spirit.fullName)).toContain("地绡银龙");
  expect(new Set(s5.spirits.filter(spirit => ["地银链", "地底银鳞", "地绡银龙"].includes(spirit.fullName))
    .map(spirit => spirit.familyId)).size).toBe(1);
});

test("当前技能参数和学习面覆盖旧公告，缺失途径保留已知文本，明确新途径优先", () => {
  const catalog = loadCatalog();
  const full = withWebPreview(JSON.parse(readFileSync("public/data/runtime.json", "utf8")));
  const spirit = full.spirits.find(spirit => spirit.fullName === "地绡银龙");
  const skill = full.skills.find(skill => skill.name === "矿物置换");
  const pool = full.learnsets.find(pool => pool.spiritId === spirit.id);
  skill.basePower = null;
  skill.cost = 9;
  skill.description = "本轮已核验技能正文";
  pool.skillIds = [skill.id];
  pool.acquisitions = { [skill.id]: ["技能石"] };
  const s5 = withS5AnnouncementCatalog(catalog, full).seasons.find(({ id }) => id === "S5");
  expect(s5.skills.find(({ id }) => id === skill.id)).toMatchObject({ basePower: null, cost: 9, description: "本轮已核验技能正文" });
  expect(spiritSkills(s5, spirit.id)).toEqual([expect.objectContaining({ id: skill.id, methods: ["技能石"] })]);
  pool.acquisitions = {};
  const unknownMethods = withS5AnnouncementCatalog(catalog, full).seasons.find(({ id }) => id === "S5");
  expect(spiritSkills(unknownMethods, spirit.id)).toEqual([expect.objectContaining({ id: skill.id, methods: [] })]);
  const originalPool = catalog.seasons.find(({ id }) => id === "S4").learnsets.find(entry => entry.skillIds.length);
  const currentPool = s5.learnsets.find(({ spiritId }) => spiritId === originalPool.spiritId);
  for (const id of currentPool.skillIds.filter(id => originalPool.skillIds.includes(id))) {
    expect(currentPool.acquisitions[id]).toEqual(originalPool.acquisitions[id]);
  }
});

test("国服查询不接受国际服快照中的新实体", () => {
  const catalog = loadCatalog();
  expect(withS5AnnouncementCatalog(catalog, { ...snapshot, meta: { serverId: "global" } })).toBe(catalog);
});

test("本季汇总接收 BWIKI 新补丁并保留 S5 各组原日期，排除 S4 历史", () => {
  const old = { patch: { id: "s4-older", seasonId: "S4", date: "2026.09.10" },
    items: [{ kind: "stat", label: "威力", before: 120, after: 110 }] };
  const announcement = { patch: S5_SEASON_ANNOUNCEMENT.patch,
    items: [{ kind: "stat", label: "威力", before: 110, after: 95 }] };
  const incoming = { patch: { id: "s5-2026-10-31", seasonId: "S5", date: "2026.10.31" },
    items: [{ kind: "stat", label: "威力", before: 95, after: 100 }], history: [announcement, old] };
  const original = structuredClone(incoming);
  const season = { id: "S5", seasonAnnouncement: snapshot.seasonAnnouncement };
  expect(querySeasonChangeInfo(season, incoming)).toEqual({ ...incoming, history: [announcement] });
  expect(querySeasonChangeInfo(season, old)).toBeNull();
  expect(incoming).toEqual(original);
});

test("真实 BWIKI runtime 途径差量还原完整 S5 学习面，不回填撤销的旧途径", async () => {
  const base = JSON.parse(readFileSync("data/snapshots/current.json", "utf8"));
  const evidence = JSON.parse(readFileSync("data/reviewed/nrc-s5-20261101.json", "utf8"));
  const full = applyS5Candymo(withWebPreview(applyS5Bwiki(withWebPreview(base), evidence)),
    JSON.parse(readFileSync("data/reviewed/candymo-s5-20261101.json", "utf8")));
  const runtime = await buildS5BwikiRuntime({ previewLoader: {
    ssrLoadModule: async () => ({ withWebPreview, applyS5Bwiki, applyS5Candymo }),
  } });
  expect(runtime.learnsets.some(pool => pool.acquisitionsPartial)).toBe(true);
  const season = withS5AnnouncementCatalog(loadCatalog(), runtime).seasons.find(({ id }) => id === "S5");
  expect(season.label).toBe("S5");
  const newSkills = season.skills.filter(skill => skill.introducedSeason === "S5");
  expect(newSkills).toHaveLength(29);
  const slash = newSkills.find(skill => skill.name === "圣龙狂斩");
  expect(skillLearners(season, slash.id).map(spirit => spirit.fullName).sort()).toEqual(["阿布", "超能阿布"].sort());
  for (const skill of newSkills) {
    const learners = skillLearners(season, skill.id);
    expect(learners.length, skill.name).toBeGreaterThan(0);
    const families = querySpiritFamilies(season, { skillIds: [skill.id] });
    expect(families.flatMap(family => family.members.map(member => member.id)).sort(), skill.name)
      .toEqual(learners.map(learner => learner.id).sort());
    for (const learner of learners) {
      expect(learner.methods.length, `${skill.name} / ${learner.fullName}`).toBeGreaterThan(0);
      expect(spiritSkills(season, learner.id), `${skill.name} / ${learner.fullName}`)
        .toContainEqual(expect.objectContaining({ id: skill.id, methods: learner.methods }));
    }
  }
  for (const pool of full.learnsets) {
    const current = season.learnsets.find(({ spiritId }) => spiritId === pool.spiritId);
    for (const id of current.skillIds) {
      expect(current.acquisitions[id], `${pool.spiritId} ${id}`).toEqual(pool.acquisitions?.[id] ?? []);
    }
  }
});
