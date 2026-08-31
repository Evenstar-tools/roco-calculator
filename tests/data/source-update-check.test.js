import { describe, expect, test } from "vitest";

import { buildSourceUpdateReport } from "../../scripts/bwiki/check-source-updates.mjs";

describe("赛季资料更新检查", () => {
  test("BWIKI 修订未变化时保持等待且不允许构建", () => {
    const report = buildSourceUpdateReport({
      baseline: {
        snapshotId: "s3-2026-08-13-midseason",
        spiritFilter: 41360,
        skillFilter: 40653,
      },
      current: {
        spiritFilter: 41360,
        skillFilter: 40653,
      },
      inputs: { csv: false, detailCache: false },
      checkedAt: "2026-09-10T01:00:00.000Z",
    });

    expect(report).toMatchObject({
      status: "unchanged",
      updateDetected: false,
      buildReady: false,
      checkedAt: "2026-09-10T01:00:00.000Z",
    });
  });

  test("任一筛选页修订变化时报告具体来源和新旧修订号", () => {
    const report = buildSourceUpdateReport({
      baseline: {
        snapshotId: "s3-2026-08-13-midseason",
        spiritFilter: 41360,
        skillFilter: 40653,
      },
      current: {
        spiritFilter: 50001,
        skillFilter: 40653,
      },
      inputs: { csv: false, detailCache: false },
    });

    expect(report).toMatchObject({
      status: "changed",
      updateDetected: true,
      buildReady: false,
      changes: [
        {
          source: "spiritFilter",
          previousRevision: 41360,
          currentRevision: 50001,
        },
      ],
    });
  });

  test("资料变化且赛季 CSV 与详情缓存齐备时允许进入候选构建", () => {
    const report = buildSourceUpdateReport({
      baseline: {
        snapshotId: "s3-2026-08-13-midseason",
        spiritFilter: 41360,
        skillFilter: 40653,
      },
      current: {
        spiritFilter: 50001,
        skillFilter: 50002,
      },
      inputs: { csv: true, detailCache: true },
    });

    expect(report.buildReady).toBe(true);
  });
});
