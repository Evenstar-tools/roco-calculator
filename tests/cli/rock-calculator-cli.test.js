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
const moonMemoryOwner = snapshot.spirits.find(
  ({ traitName }) => traitName === "铭记于月亮",
);
const oldToyTrait = snapshot.traits.find(({ name }) => name === "旧玩具");
const coldLightTrait = snapshot.traits.find(({ name }) => name === "冷光源");
const moonMemoryCandidateTraitIds = snapshot.traits
  .filter(({ name }) => name !== "铭记于月亮")
  .slice(0, 6)
  .map(({ id }) => id);
const oldToyStacksKey = "trait.traitStacks.2d041ca6";
const moonMemorySkill = {
  name: "愿力冲击",
  type: "光",
  category: "dual",
};

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
    });
    expect(result.json.results).toContainEqual(
      expect.objectContaining({
        id: "spirit_db5a2cb398dc0385",
        name: "迪莫",
        types: ["光"],
        baseName: expect.anything(),
        stage: expect.anything(),
        traitName: expect.anything(),
        variantName: null,
      }),
    );
    expect(result.json.results[0].id).toBe("spirit_db5a2cb398dc0385");
  });

  test("search 标记种族值待确认的前瞻占位精灵", () => {
    const placeholder = snapshot.spirits.find(
      ({ calculationStatus }) => calculationStatus === "pending-race-stats",
    );
    const result = runCli(["search", "spirit", placeholder.fullName]);

    expect(result.status).toBe(0);
    expect(result.json.results).toContainEqual(
      expect.objectContaining({
        calculationStatus: "pending-race-stats",
        id: placeholder.id,
        name: placeholder.fullName,
      }),
    );
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
        fields: {
          side: {
            acquiredTraitIds: expect.stringContaining("最多5个"),
            acquiredTraitValues: expect.any(String),
          },
        },
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

  test("铭记于月亮持有者可携带已知特性，重复 ID 去重且参数按 canonical key 生效", () => {
    const acquiredSide = {
      spirit: moonMemoryOwner.id,
      skill: moonMemorySkill,
      acquiredTraitIds: [oldToyTrait.id, oldToyTrait.id],
      acquiredTraitValues: {
        [oldToyTrait.id]: { [oldToyStacksKey]: 3 },
      },
    };
    const duplicated = runCli(["calculate", "--input", "-"], {
      ...simpleCase,
      attacker: acquiredSide,
    });
    const deduplicated = runCli(["calculate", "--input", "-"], {
      ...simpleCase,
      attacker: {
        ...acquiredSide,
        acquiredTraitIds: [oldToyTrait.id],
      },
    });

    expect(duplicated.status).toBe(0);
    expect(duplicated.json.results.forward.selected.displayPower).toBe(104);
    expect(duplicated.json.inputDigest).toBe(deduplicated.json.inputDigest);
  });

  test("铭记于月亮持有者拒绝吞噬超过五个不同特性", () => {
    const result = runCli(["calculate", "--input", "-"], {
      ...simpleCase,
      attacker: {
        spirit: moonMemoryOwner.id,
        skill: moonMemorySkill,
        acquiredTraitIds: moonMemoryCandidateTraitIds,
      },
    });

    expect(result.status).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.errorJson).toMatchObject({
      ok: false,
      error: {
        code: "INPUT_VALIDATION_FAILED",
        field: "attacker.acquiredTraitIds",
        message: expect.stringContaining("最多5个"),
      },
    });
  });

  test("铭记于月亮持有者可吞噬五个不同特性", () => {
    const result = runCli(["calculate", "--input", "-"], {
      ...simpleCase,
      attacker: {
        spirit: moonMemoryOwner.id,
        skill: moonMemorySkill,
        acquiredTraitIds: moonMemoryCandidateTraitIds.slice(0, 5),
      },
    });

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.json).toMatchObject({
      ok: true,
      command: "calculate",
    });
  });

  test("铭记于月亮吞噬数量先按特性 ID 去重再判断上限", () => {
    const fiveDistinct = moonMemoryCandidateTraitIds.slice(0, 5);
    const duplicated = runCli(["calculate", "--input", "-"], {
      ...simpleCase,
      attacker: {
        spirit: moonMemoryOwner.id,
        skill: moonMemorySkill,
        acquiredTraitIds: [fiveDistinct[0], ...fiveDistinct],
      },
    });
    const deduplicated = runCli(["calculate", "--input", "-"], {
      ...simpleCase,
      attacker: {
        spirit: moonMemoryOwner.id,
        skill: moonMemorySkill,
        acquiredTraitIds: fiveDistinct,
      },
    });

    expect(duplicated.status).toBe(0);
    expect(duplicated.json.inputDigest).toBe(deduplicated.json.inputDigest);
  });

  test("普通精灵拒绝注入 acquired trait 与参数", () => {
    const result = runCli(["calculate", "--input", "-"], {
      ...simpleCase,
      attacker: {
        ...simpleCase.attacker,
        acquiredTraitIds: [oldToyTrait.id],
        acquiredTraitValues: {
          [oldToyTrait.id]: { [oldToyStacksKey]: 3 },
        },
      },
    });

    expect(result.status).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.errorJson).toMatchObject({
      ok: false,
      error: {
        code: "INPUT_VALIDATION_FAILED",
        field: "attacker.acquiredTraitIds",
      },
    });
  });

  test("铭记于月亮持有者拒绝不存在的 acquired trait ID", () => {
    const result = runCli(["calculate", "--input", "-"], {
      ...simpleCase,
      attacker: {
        spirit: moonMemoryOwner.id,
        skill: moonMemorySkill,
        acquiredTraitIds: ["trait_missing"],
      },
    });

    expect(result.status).toBe(2);
    expect(result.errorJson).toMatchObject({
      ok: false,
      error: {
        code: "INPUT_VALIDATION_FAILED",
        field: "attacker.acquiredTraitIds[0]",
        traitId: "trait_missing",
      },
    });
  });

  test("acquiredTraitValues 只能归属于已选 acquired trait", () => {
    const result = runCli(["calculate", "--input", "-"], {
      ...simpleCase,
      attacker: {
        spirit: moonMemoryOwner.id,
        skill: moonMemorySkill,
        acquiredTraitIds: [oldToyTrait.id],
        acquiredTraitValues: {
          [coldLightTrait.id]: {
            "trait.previousTurnWingSkillUsed.972a1024": true,
          },
        },
      },
    });

    expect(result.status).toBe(2);
    expect(result.errorJson).toMatchObject({
      ok: false,
      error: {
        code: "INPUT_VALIDATION_FAILED",
        field: `attacker.acquiredTraitValues.${coldLightTrait.id}`,
      },
    });
  });

  test("acquiredTraitValues 拒绝非 canonical trait key", () => {
    const result = runCli(["calculate", "--input", "-"], {
      ...simpleCase,
      attacker: {
        spirit: moonMemoryOwner.id,
        skill: moonMemorySkill,
        acquiredTraitIds: [oldToyTrait.id],
        acquiredTraitValues: {
          [oldToyTrait.id]: { attackerTraitStacks: 3 },
        },
      },
    });

    expect(result.status).toBe(2);
    expect(result.errorJson).toMatchObject({
      ok: false,
      error: {
        code: "INPUT_VALIDATION_FAILED",
        field:
          `attacker.acquiredTraitValues.${oldToyTrait.id}.attackerTraitStacks`,
        key: "attackerTraitStacks",
      },
    });
  });

  test("acquiredTraitValues 只接受安全标量", () => {
    const result = runCli(["calculate", "--input", "-"], {
      ...simpleCase,
      attacker: {
        spirit: moonMemoryOwner.id,
        skill: moonMemorySkill,
        acquiredTraitIds: [oldToyTrait.id],
        acquiredTraitValues: {
          [oldToyTrait.id]: { [oldToyStacksKey]: [3] },
        },
      },
    });

    expect(result.status).toBe(2);
    expect(result.errorJson).toMatchObject({
      ok: false,
      error: {
        code: "INPUT_VALIDATION_FAILED",
        field:
          `attacker.acquiredTraitValues.${oldToyTrait.id}.${oldToyStacksKey}`,
        key: oldToyStacksKey,
      },
    });
  });

  test("calculate 剥离内部覆盖字段，不能绕过快照实体", () => {
    const clean = runCli(["calculate", "--input", "-"], simpleCase);
    const injected = runCli(["calculate", "--input", "-"], {
      ...simpleCase,
      attacker: {
        spirit: {
          id: "spirit_db5a2cb398dc0385",
          raceStats: { hp: 9999, magicalAttack: 9999 },
          traitIds: [oldToyTrait.id],
          types: ["水"],
        },
        skill: "光球",
        fourSkills: ["skill_missing"],
        natureMultipliers: { magicalAttack: 99 },
        panelStats: {
          hp: 9999,
          speed: 9999,
          physicalAttack: 9999,
          magicalAttack: 9999,
          physicalDefense: 9999,
          magicalDefense: 9999,
        },
        raceStats: { hp: 9999, magicalAttack: 9999 },
        singleSkill: { category: "magical", basePower: 9999 },
        skillTypes: ["水"],
        totalSkillCost: 9999,
        traitIds: [oldToyTrait.id],
        traits: [{
          ...oldToyTrait,
          runtimeInputValues: { [oldToyStacksKey]: 18 },
        }],
        types: ["水"],
      },
    });

    expect(injected.status).toBe(0);
    expect(injected.json.inputDigest).toBe(clean.json.inputDigest);
    expect(injected.json.results.forward.selected).toEqual(
      clean.json.results.forward.selected,
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

  test("雷暴使用未取整公式威力计算并复现实战117伤害", () => {
    const result = runCli(
      ["explain", "--input", "-", "--direction", "forward", "--skill", "1"],
      {
        schemaVersion: 1,
        mode: "four",
        level: 60,
        attacker: {
          spirit: "spirit_56f8f0077302b8b4",
          skills: [{
            name: "雷暴",
            context: {
              burstTriggered: true,
              burstSourceBioelectric: true,
              burstSourceCurrentStimulus: true,
              burstSourceDoublePulse: true,
            },
          }],
        },
        defender: {
          spirit: "spirit_e0332c3637a510c6",
          ivs: {
            hp: 60,
            physicalAttack: 60,
            magicalAttack: 60,
            speed: 60,
            physicalDefense: 60,
            magicalDefense: 0,
          },
          skills: ["雷暴"],
        },
        forward: {
          skill: 1,
          context: {
            burstTriggered: true,
            burstSourceBioelectric: true,
            burstSourceCurrentStimulus: true,
            burstSourceDoublePulse: true,
          },
        },
      },
    );

    expect(result.status).toBe(0);
    expect(result.json.result).toMatchObject({
      combatPanel: {
        attacker: { magicalAttack: 210 },
        defender: { magicalDefense: 167 },
      },
      displayPower: 103,
      totalDamage: 117,
    });
    expect(result.json.result.formulaSteps).toContainEqual(
      expect.objectContaining({
        after: 117,
        input: expect.objectContaining({
          calculationPower: 103.125,
          displayedPower: 103,
          roundedNumerator: 19543,
        }),
        label: "等级系数与攻防比",
      }),
    );
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

  test("calculate 对前瞻占位精灵提前返回稳定不可用错误", () => {
    const placeholder = snapshot.spirits.find(
      ({ calculationStatus }) => calculationStatus === "pending-race-stats",
    );
    const result = runCli(["calculate", "--input", "-"], {
      ...simpleCase,
      attacker: { ...simpleCase.attacker, spirit: placeholder.fullName },
    });

    expect(result.status).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.errorJson).toMatchObject({
      ok: false,
      error: {
        calculationStatus: "pending-race-stats",
        code: "SPIRIT_DATA_UNAVAILABLE",
        field: "attacker.spirit",
        spiritId: placeholder.id,
        spiritName: placeholder.fullName,
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
