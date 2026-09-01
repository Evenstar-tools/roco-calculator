import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";

const projectRoot = process.cwd();
const cliPath = path.join(projectRoot, "scripts", "cli", "rock-calculator.mjs");
const packageJson = JSON.parse(
  readFileSync(path.join(projectRoot, "package.json"), "utf8"),
);
const snapshot = JSON.parse(
  readFileSync(path.join(projectRoot, "data", "snapshots", "current.json"), "utf8"),
);

function runCli(args, input) {
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    cwd: projectRoot,
    encoding: "utf8",
    input: input === undefined ? undefined : JSON.stringify(input),
  });
  const parseJson = (value) => {
    try {
      return value.trim() ? JSON.parse(value) : null;
    } catch {
      return null;
    }
  };
  return {
    ...result,
    json: parseJson(result.stdout),
    errorJson: parseJson(result.stderr),
  };
}

const simpleCase = {
  schemaVersion: 1,
  mode: "single",
  level: 60,
  attacker: {
    spirit: "迪莫",
    skill: "光球",
  },
  defender: {
    spirit: "水蓝蓝",
    skill: "水炮",
  },
};

const referenceListenBridgeCase = {
  schemaVersion: 1,
  mode: "four",
  level: 60,
  attacker: {
    spirit: "女王蜂",
    nature: "开朗",
    ivs: {
      hp: 60,
      speed: 60,
      physicalAttack: 60,
      magicalAttack: 0,
      physicalDefense: 0,
      magicalDefense: 0,
    },
    skills: [
      {
        name: "虫群",
        context: { donationPowerCount: 6 },
      },
    ],
  },
  defender: {
    spirit: "恶魔狼王",
    nature: "固执",
    ivs: {
      hp: 60,
      speed: 60,
      physicalAttack: 60,
      magicalAttack: 0,
      physicalDefense: 0,
      magicalDefense: 0,
    },
    skills: ["听桥"],
  },
  forward: {
    skill: 1,
    context: {
      attackerTraitStacks: 5,
      defenderTraitStacks: 6,
    },
  },
  reverse: {
    skill: 1,
    context: {
      attackerTraitStacks: 6,
      defenderTraitStacks: 5,
    },
  },
};

describe("rock-calculator CLI", () => {
  test("meta 返回当前引擎和数据版本，不加载源码说明", () => {
    const result = runCli(["meta"]);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.json).toMatchObject({
      ok: true,
      command: "meta",
      engine: {
        productVersion: packageJson.version,
        dataVersion: snapshot.meta.id,
        rulesVersion: snapshot.meta.rulesVersion,
      },
      counts: {
        spirits: snapshot.meta.counts.spirits,
        skills: snapshot.meta.counts.skills,
      },
    });
  });

  test("search 用中文名称返回可直接复用的稳定 ID", () => {
    const result = runCli(["search", "spirit", "迪莫", "--limit", "2"]);

    expect(result.status).toBe(0);
    expect(result.json).toMatchObject({
      ok: true,
      command: "search",
      kind: "spirit",
      query: "迪莫",
      results: expect.arrayContaining([
        {
          id: "spirit_db5a2cb398dc0385",
          name: "迪莫",
          types: ["光"],
          baseName: expect.anything(),
          stage: expect.anything(),
          traitName: expect.anything(),
          variantName: null,
        },
      ]),
    });
    expect(result.json.results[0].id).toBe("spirit_db5a2cb398dc0385");
  });

  test("schema 返回紧凑输入契约，供 AI 自发现而不是读取源码", () => {
    const result = runCli(["schema"]);

    expect(result.status).toBe(0);
    expect(result.json).toMatchObject({
      ok: true,
      command: "schema",
      inputSchemaVersion: 1,
      commands: {
        calculate: expect.any(Object),
        explain: expect.any(Object),
        search: expect.any(Object),
      },
      compactInput: {
        required: ["attacker", "defender"],
        example: simpleCase,
      },
    });
  });

  test("calculate 从 stdin 接收紧凑中文配置并返回双向精简结果", () => {
    const result = runCli(["calculate", "--input", "-"], simpleCase);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.json).toMatchObject({
      ok: true,
      command: "calculate",
      inputDigest:
        "sha256:2ed1766bd5b45f23d8ad13698eaf0aad6d88138252e8c8e754a117e23458d9c8",
      resolved: {
        attacker: {
          spiritId: "spirit_db5a2cb398dc0385",
          spiritName: "迪莫",
        },
        defender: {
          spiritId: "spirit_77c2085d2f6e8e87",
          spiritName: "水蓝蓝",
        },
      },
      results: {
        forward: {
          attacker: "迪莫",
          defender: "水蓝蓝",
          selected: {
            displayPower: 100,
            skillName: "光球",
            status: "exact",
            totalDamage: 90,
            lethal: false,
          },
        },
        reverse: {
          attacker: "水蓝蓝",
          defender: "迪莫",
          selected: {
            skillName: "水炮",
            status: "exact",
            totalDamage: 105,
            lethal: false,
          },
        },
      },
    });
    expect(result.json.results.forward.selected).not.toHaveProperty(
      "formulaSteps",
    );
  });

  test("explain 只展开指定方向的公式链", () => {
    const result = runCli(
      ["explain", "--input", "-", "--direction", "forward"],
      simpleCase,
    );

    expect(result.status).toBe(0);
    expect(result.json).toMatchObject({
      ok: true,
      command: "explain",
      direction: "forward",
      attacker: "迪莫",
      defender: "水蓝蓝",
      result: {
        skillName: "光球",
        totalDamage: 90,
        formulaSteps: expect.arrayContaining([
          expect.objectContaining({ label: "基础威力", after: 80 }),
          expect.objectContaining({ label: "等级系数与攻防比", after: 90 }),
        ]),
      },
    });
    expect(result.json).not.toHaveProperty("results");
  });

  test("实战女王蜂虫群与恶魔狼王听桥配置复现显示威力和543伤害", () => {
    const result = runCli(
      ["calculate", "--input", "-"],
      referenceListenBridgeCase,
    );

    expect(result.status).toBe(0);
    expect(result.json).toMatchObject({
      inputDigest:
        "sha256:d31cf227f70f475ec0aebf0ec151c9e4e9e96930d174278a0447ccdb8e0f5273",
      results: {
        forward: {
          selected: {
            displayPower: 613,
            skillName: "虫群",
            totalDamage: 511,
          },
        },
        reverse: {
          selected: {
            displayPower: 245,
            hitCount: 1,
            skillName: "听桥",
            totalDamage: 543,
          },
        },
      },
    });
  });

  test("参考站女王蜂五层虫群突袭的速度加成向下取整为115", () => {
    const result = runCli(
      [
        "explain",
        "--input",
        "-",
        "--direction",
        "forward",
        "--skill",
        "1",
      ],
      referenceListenBridgeCase,
    );

    expect(result.status).toBe(0);
    expect(result.json.result.combatPanel.attacker.speed).toBe(269);
  });

  test("calculate 支持 UTF-8 JSON 文件，避免 shell 转义自然语言参数", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "rock-cli-"));
    const inputPath = path.join(directory, "case.json");
    try {
      writeFileSync(inputPath, JSON.stringify(simpleCase), "utf8");
      const result = runCli(["calculate", "--input", inputPath]);

      expect(result.status).toBe(0);
      expect(result.json.results.forward.selected).toMatchObject({
        skillName: "光球",
        totalDamage: 90,
      });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  test("未知实体使用稳定错误码并以退出码 2 结束", () => {
    const result = runCli(["calculate", "--input", "-"], {
      ...simpleCase,
      attacker: { ...simpleCase.attacker, spirit: "不存在的精灵" },
    });

    expect(result.status).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.errorJson).toMatchObject({
      ok: false,
      error: {
        code: "ENTITY_NOT_FOUND",
        field: "attacker.spirit",
      },
    });
  });

  test("未知性格不会静默退回普通性格", () => {
    const result = runCli(["calculate", "--input", "-"], {
      ...simpleCase,
      attacker: { ...simpleCase.attacker, nature: "固执执" },
    });

    expect(result.status).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.errorJson).toMatchObject({
      ok: false,
      error: {
        code: "INVALID_NATURE",
        field: "attacker.nature",
      },
    });
  });

  test("个体字段拼写错误不会被默认值掩盖", () => {
    const result = runCli(["calculate", "--input", "-"], {
      ...simpleCase,
      attacker: {
        ...simpleCase.attacker,
        ivs: { physicalAtk: 0 },
      },
    });

    expect(result.status).toBe(2);
    expect(result.errorJson).toMatchObject({
      ok: false,
      error: {
        code: "INPUT_VALIDATION_FAILED",
        field: "attacker.ivs.physicalAtk",
      },
    });
  });
});
