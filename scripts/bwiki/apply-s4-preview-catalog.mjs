#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { NATURES } from "../../src/domain/natures.js";
import { sha256Hex, sourceRef, stableId } from "./normalize.mjs";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DEFAULT_CANDIDATE_PATH = path.join(
  PROJECT_ROOT,
  "data/candidates/s4-preview-new-spirits.json",
);
const DEFAULT_SNAPSHOT_PATH = path.join(
  PROJECT_ROOT,
  "data/snapshots/current.json",
);
const RACE_STAT_KEYS = Object.freeze([
  "hp",
  "speed",
  "physicalAttack",
  "magicalAttack",
  "physicalDefense",
  "magicalDefense",
]);
const ALLOWED_TYPES = new Set([
  "普通",
  "草",
  "火",
  "水",
  "光",
  "地",
  "冰",
  "龙",
  "电",
  "毒",
  "虫",
  "武",
  "翼",
  "萌",
  "幽",
  "恶",
  "机械",
  "幻",
]);
const ALLOWED_CATEGORIES = new Set(["physical", "magical", "status", "defense"]);
const STAGE_LABELS = Object.freeze({ 1: "一阶", 2: "二阶", 3: "三阶" });
const NATURE_IDS = new Set(NATURES.map(({ id }) => id));

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function uniqueCount(values) {
  return new Set(values).size;
}

function compactDescription(value) {
  return String(value ?? "").replace(/\s+/gu, "");
}

function computedCounts(catalog) {
  const families = catalog.families ?? [];
  const bosses = catalog.bossPlaceholders ?? [];
  const forms = families.flatMap((family) => family.forms ?? []);
  const skills = families.flatMap((family) => family.skills ?? []);
  const placeholders = skills.filter(({ status }) => status === "placeholder");
  return {
    families: families.length,
    finalForms: forms.filter(({ isFinal }) => isFinal === true).length,
    forms: forms.length,
    placeholderForms: forms.filter(({ isFinal }) => isFinal !== true).length,
    bossPlaceholders: bosses.length,
    bossTraits: bosses.filter(({ trait }) => trait).length,
    skillSlots: skills.length,
    traits: families.filter(({ trait }) => trait).length,
    uniqueSkillNames: uniqueCount(skills.map(({ name }) => name)),
    existingSkillReferences: skills.filter(
      ({ status }) => status === "existing-reference",
    ).length,
    newSkillPlaceholders: uniqueCount(placeholders.map(({ name }) => name)),
  };
}

export function validateS4PreviewCatalog(catalog) {
  requireCondition(catalog?.meta?.status === "candidate", "S4 前瞻目录状态必须为 candidate");
  requireCondition(
    catalog?.meta?.raceStatMapping?.精力 === "hp",
    "S4 前瞻目录必须显式记录“精力→hp”映射",
  );
  requireCondition(Array.isArray(catalog?.families), "S4 前瞻目录缺少 families");

  const familyKeys = [];
  const rowKeys = [];
  const formNames = [];
  const traitNames = [];
  const bossKeys = [];
  const bossNames = [];
  const bossTraitNames = [];
  const skillByName = new Map();
  for (const family of catalog.families) {
    familyKeys.push(family.candidateFamilyKey);
    requireCondition(
      typeof family.candidateFamilyKey === "string" && family.candidateFamilyKey.length > 0,
      "S4 前瞻家族缺少 candidateFamilyKey",
    );
    requireCondition(Array.isArray(family.forms) && family.forms.length > 0, `${family.candidateFamilyKey} 缺少形态`);
    const finalForms = family.forms.filter(({ isFinal }) => isFinal === true);
    requireCondition(finalForms.length === 1, `${family.candidateFamilyKey} 必须且只能有一个最终形态`);
    requireCondition(family.trait?.name && family.trait?.description, `${family.candidateFamilyKey} 缺少特性资料`);
    traitNames.push(family.trait.name);

    for (const form of family.forms) {
      rowKeys.push(form.candidateRowKey);
      formNames.push(form.name);
      requireCondition(form.candidateRowKey && form.name, `${family.candidateFamilyKey} 存在无标识形态`);
      requireCondition(
        Number.isInteger(form.stageIndex) && form.stageIndex > 0,
        `${form.name} 缺少有效进化阶段序号`,
      );
      requireCondition(
        Array.isArray(form.types) &&
          form.types.length >= 1 &&
          form.types.length <= 2 &&
          form.types.every((type) => ALLOWED_TYPES.has(type)),
        `${form.name} 属性无效`,
      );
      if (form.isFinal === true) {
        const values = RACE_STAT_KEYS.map((key) => form.raceStats?.[key]);
        requireCondition(
          values.every((value) => Number.isInteger(value) && value > 0) &&
            Number.isInteger(form.raceStats?.total),
          `${form.name} 最终形态六维必须是完整正整数`,
        );
        const total = values.reduce((sum, value) => sum + value, 0);
        requireCondition(total === form.raceStats.total, `${form.name} 总种族值 ${form.raceStats.total} != ${total}`);
        const previewIvs = form.previewDefaults?.displayIvs;
        requireCondition(
          NATURE_IDS.has(form.previewDefaults?.natureId),
          `${form.name} 缺少有效的前瞻默认性格`,
        );
        requireCondition(
          previewIvs &&
            Object.keys(previewIvs).length === RACE_STAT_KEYS.length &&
            RACE_STAT_KEYS.every((key) => previewIvs[key] === 0 || previewIvs[key] === 60) &&
            RACE_STAT_KEYS.filter((key) => previewIvs[key] === 60).length === 3,
          `${form.name} 前瞻默认个体必须且只能有三项 60`,
        );
      } else {
        requireCondition(form.raceStats === null, `${form.name} 非最终形态种族值必须保持 null 占位`);
        requireCondition(form.previewDefaults === undefined, `${form.name} 非最终形态不能设置前瞻默认配置`);
      }
    }

    requireCondition(
      Array.isArray(family.skills) && family.skills.length >= 4,
      `${family.candidateFamilyKey} 至少需要四条技能记录`,
    );
    for (const skill of family.skills) {
      requireCondition(skill.name && skill.description, `${family.candidateFamilyKey} 存在不完整技能记录`);
      requireCondition(
        skill.status === "placeholder" || skill.status === "existing-reference",
        `${skill.name} 候选状态无效`,
      );
      if (skill.status === "placeholder") {
        const hasType = skill.type !== undefined && skill.type !== null;
        const hasCategory = skill.category !== undefined && skill.category !== null;
        requireCondition(
          hasType === hasCategory,
          `${skill.name} 的属性与类别必须同时提供或同时留空`,
        );
        requireCondition(!hasType || ALLOWED_TYPES.has(skill.type), `${skill.name} 技能属性无效`);
        requireCondition(
          !hasCategory || ALLOWED_CATEGORIES.has(skill.category),
          `${skill.name} 技能类别无效`,
        );
        requireCondition(
          skill.cost === undefined ||
            (Number.isInteger(skill.cost) && skill.cost >= 0),
          `${skill.name} 技能能耗无效`,
        );
        requireCondition(
          skill.basePower === undefined ||
            (Number.isInteger(skill.basePower) && skill.basePower >= 0),
          `${skill.name} 技能基础威力无效`,
        );
      }
      const previous = skillByName.get(skill.name);
      if (previous) {
        requireCondition(previous.status === skill.status, `${skill.name} 在不同家族的候选状态不一致`);
        requireCondition(
          compactDescription(previous.description) === compactDescription(skill.description),
          `${skill.name} 在不同家族的描述不一致`,
        );
      } else {
        skillByName.set(skill.name, skill);
      }
    }
  }

  requireCondition(
    Array.isArray(catalog?.bossPlaceholders),
    "S4 前瞻目录缺少 bossPlaceholders",
  );
  for (const boss of catalog.bossPlaceholders) {
    bossKeys.push(boss.candidateRowKey);
    bossNames.push(boss.name);
    bossTraitNames.push(boss.trait?.name);
    requireCondition(
      typeof boss.candidateRowKey === "string" &&
        boss.candidateRowKey.length > 0 &&
        typeof boss.name === "string" &&
        boss.name.length > 0,
      "S4 首领占位缺少候选标识或名称",
    );
    requireCondition(
      typeof boss.baseSpiritId === "string" &&
        boss.baseSpiritId.length > 0 &&
        typeof boss.baseSpiritFullName === "string" &&
        boss.baseSpiritFullName.length > 0,
      `${boss.name} 缺少明确的继承基底`,
    );
    requireCondition(
      boss.stage === "首领" && boss.sourceCategory === "首领形态",
      `${boss.name} 首领身份字段无效`,
    );
    requireCondition(
      boss.dexNoStrategy === "copy-base-exact" &&
        boss.raceStatsStrategy === "copy-base-exact" &&
        boss.learnsetStrategy === "copy-base-exact" &&
        ["copy-base-placeholder", "official-video-frame-temporary"].includes(
          boss.assetStrategy,
        ),
      `${boss.name} 继承策略无效`,
    );
    if (boss.assetStrategy === "official-video-frame-temporary") {
      requireCondition(
        typeof boss.assetEvidenceTimestamp === "string" &&
          boss.assetEvidenceTimestamp.length > 0 &&
          typeof boss.assetSourceFile === "string" &&
          boss.assetSourceFile.length > 0,
        `${boss.name} 临时视频帧缺少时间戳或源文件`,
      );
    }
    requireCondition(
      boss.trait?.name &&
        boss.trait?.description &&
        ["description-only", "reviewed-rule"].includes(
          boss.trait?.adaptationStatus,
        ),
      `${boss.name} 缺少可追踪的新特性状态`,
    );
  }

  requireCondition(uniqueCount(familyKeys) === familyKeys.length, "S4 前瞻目录存在重复家族标识");
  requireCondition(
    uniqueCount([...rowKeys, ...bossKeys]) === rowKeys.length + bossKeys.length,
    "S4 前瞻目录存在重复候选行标识",
  );
  requireCondition(
    uniqueCount([...formNames, ...bossNames]) === formNames.length + bossNames.length,
    "S4 前瞻目录存在重复形态名",
  );
  requireCondition(
    uniqueCount([...traitNames, ...bossTraitNames]) ===
      traitNames.length + bossTraitNames.length,
    "S4 前瞻目录存在重复特性名",
  );

  const counts = computedCounts(catalog);
  for (const [key, actual] of Object.entries(counts)) {
    requireCondition(
      catalog.meta.counts?.[key] === actual,
      `S4 前瞻目录计数 ${key}=${catalog.meta.counts?.[key]}，实际 ${actual}`,
    );
  }
  return counts;
}

function provisionalSpiritId(catalogId, fullName) {
  return stableId("spirit", catalogId, fullName);
}

function provisionalSkillId(catalogId, name) {
  return stableId("skill", catalogId, name);
}

function traitId(trait) {
  return stableId("trait", trait.name, trait.description);
}

function replaceOrAppend(collection, entry) {
  const index = collection.findIndex(({ id }) => id === entry.id);
  if (index === -1) collection.push(entry);
  else collection[index] = entry;
}

function replaceSourceByUrl(sources, source) {
  const next = [...(sources ?? [])];
  const index = next.findIndex(({ url }) => url === source.url);
  if (index === -1) next.push(source);
  else next[index] = source;
  return next;
}

function requireExistingSkill(skillByName, candidateSkill) {
  const matches = skillByName.get(candidateSkill.name) ?? [];
  if (matches.length !== 1) {
    throw new Error(`候选清单引用的既有技能不存在：${candidateSkill.name}`);
  }
  const [skill] = matches;
  if (
    compactDescription(skill.description) !==
    compactDescription(candidateSkill.description)
  ) {
    throw new Error(`候选清单引用的既有技能描述漂移：${candidateSkill.name}`);
  }
  return skill;
}

function requireBossBase(snapshot, boss) {
  const baseSpirit = snapshot.spirits.find(
    ({ id }) => id === boss.baseSpiritId,
  );
  requireCondition(
    baseSpirit?.fullName === boss.baseSpiritFullName,
    `${boss.name} 继承基底不存在或名称漂移：${boss.baseSpiritFullName}`,
  );
  requireCondition(
    baseSpirit.raceStats &&
      RACE_STAT_KEYS.every((key) => Number.isInteger(baseSpirit.raceStats[key])) &&
      Number.isInteger(baseSpirit.raceStats.total),
    `${boss.name} 继承基底缺少完整种族值`,
  );
  requireCondition(
    Array.isArray(baseSpirit.types) && baseSpirit.types.length > 0,
    `${boss.name} 继承基底缺少属性`,
  );
  requireCondition(
    typeof baseSpirit.asset?.sourceUrl === "string" &&
      /^https:\/\//u.test(baseSpirit.asset.sourceUrl),
    `${boss.name} 继承基底缺少可用头像`,
  );
  const baseLearnset = snapshot.learnsets.find(
    ({ spiritId }) => spiritId === baseSpirit.id,
  );
  requireCondition(
    baseLearnset && Array.isArray(baseLearnset.skillIds),
    `${boss.name} 继承基底缺少学习面`,
  );
  return { baseLearnset, baseSpirit };
}

export function applyS4PreviewCatalog(snapshot, catalog) {
  const counts = validateS4PreviewCatalog(catalog);
  const next = structuredClone(snapshot);
  const catalogId = catalog.meta.id;
  const source = sourceRef(catalog.meta.source);
  const skillParameterSource = sourceRef(catalog.meta.skillParameterSource);
  const bossEntries = catalog.bossPlaceholders ?? [];
  const formEntries = catalog.families.flatMap((family) =>
    family.forms.map((form) => ({ family, form })),
  );
  const previewIds = new Set(
    [
      ...formEntries.map(({ form }) =>
        provisionalSpiritId(catalogId, form.name),
      ),
      ...bossEntries.map(({ name }) => provisionalSpiritId(catalogId, name)),
    ],
  );
  const previewNames = new Set(
    [
      ...formEntries.map(({ form }) => form.name),
      ...bossEntries.map(({ name }) => name),
    ],
  );
  const previewTraitIds = new Set(
    [
      ...catalog.families.map(({ trait }) => traitId(trait)),
      ...bossEntries.map(({ trait }) => traitId(trait)),
    ],
  );
  const previewTraitNames = new Set(
    [
      ...catalog.families.map(({ trait }) => trait.name),
      ...bossEntries.map(({ trait }) => trait.name),
    ],
  );
  const placeholderSkills = [
    ...new Map(
      catalog.families
        .flatMap(({ skills }) => skills)
        .filter(({ status }) => status === "placeholder")
        .map((skill) => [skill.name, skill]),
    ).values(),
  ];
  const previewSkillIds = new Set(
    placeholderSkills.map(({ name }) => provisionalSkillId(catalogId, name)),
  );
  const previewSkillNames = new Set(
    placeholderSkills.map(({ name }) => name),
  );
  const conflictingSpirit = next.spirits.find(
    ({ id, fullName }) => previewNames.has(fullName) && !previewIds.has(id),
  );
  requireCondition(
    !conflictingSpirit,
    `S4 前瞻精灵名称已被其他实体占用：${conflictingSpirit?.fullName}`,
  );
  const conflictingTrait = next.traits.find(
    ({ id, name }) => previewTraitNames.has(name) && !previewTraitIds.has(id),
  );
  requireCondition(
    !conflictingTrait,
    `S4 前瞻特性名称已被其他实体占用：${conflictingTrait?.name}`,
  );
  const conflictingSkill = next.skills.find(
    ({ id, name }) => previewSkillNames.has(name) && !previewSkillIds.has(id),
  );
  requireCondition(
    !conflictingSkill,
    `S4 前瞻技能名称已被其他实体占用：${conflictingSkill?.name}`,
  );
  const bossBaseByName = new Map(
    bossEntries.map((boss) => [boss.name, requireBossBase(next, boss)]),
  );

  const priorPreviewCount = next.spirits.filter(({ id }) => previewIds.has(id)).length;
  const priorPreviewSkillCount = next.skills.filter(({ id }) =>
    previewSkillIds.has(id)
  ).length;
  next.spirits = next.spirits.filter(({ id }) => !previewIds.has(id));
  next.learnsets = next.learnsets.filter(({ spiritId }) => !previewIds.has(spiritId));
  next.traits = next.traits.filter(({ id }) => !previewTraitIds.has(id));
  next.skills = next.skills.filter(({ id }) => !previewSkillIds.has(id));

  for (const skill of placeholderSkills) {
    const skillId = provisionalSkillId(catalogId, skill.name);
    const hasCompleteIdentity = Boolean(skill.type && skill.category);
    const hasCompleteDamageData =
      ["status", "defense"].includes(skill.category) ||
      Number.isFinite(Number(skill.basePower));
    const hasCompleteParameters =
      hasCompleteIdentity &&
      hasCompleteDamageData &&
      Number.isFinite(Number(skill.cost));
    replaceOrAppend(next.skills, {
      id: skillId,
      name: skill.name,
      type: skill.type ?? null,
      category: skill.category ?? null,
      cost: skill.cost ?? null,
      basePower: skill.basePower ?? null,
      description: skill.description,
      ruleId: null,
      ruleParams: null,
      asset: {
        sourceUrl: `/assets/skills/${skillId}.png`,
        status: "temporary-preview",
        replacementPending: true,
      },
      ...(hasCompleteParameters
        ? {}
        : { calculationStatus: "pending-skill-data" }),
      source,
      provenance: {
        identity: source,
        description: source,
        ...(skill.type && skill.category
          ? {
              type: skillParameterSource,
              category: skillParameterSource,
            }
          : {}),
        ...(skill.cost !== undefined ? { cost: skillParameterSource } : {}),
        ...(skill.basePower !== undefined
          ? { basePower: skillParameterSource }
          : {}),
        previewStatus: {
          catalogId,
          formalDataPending: true,
        },
      },
    });
  }

  const skillByName = new Map();
  for (const skill of next.skills) {
    const matches = skillByName.get(skill.name) ?? [];
    matches.push(skill);
    skillByName.set(skill.name, matches);
  }

  for (const family of catalog.families) {
    const familyTraitId = traitId(family.trait);
    replaceOrAppend(next.traits, {
      id: familyTraitId,
      name: family.trait.name,
      description: family.trait.description,
      provenance: {
        identity: source,
        description: source,
        previewStatus: {
          catalogId,
          adaptationStatus: family.trait.adaptationStatus,
        },
      },
    });

    const familySkillIds = family.skills.map((candidateSkill) =>
      candidateSkill.status === "existing-reference"
        ? requireExistingSkill(skillByName, candidateSkill).id
        : provisionalSkillId(catalogId, candidateSkill.name)
    );

    for (const form of family.forms) {
      const isFinal = form.isFinal === true;
      const spiritId = provisionalSpiritId(catalogId, form.name);
      const skillIds = isFinal ? familySkillIds : [];
      next.spirits.push({
        id: spiritId,
        dexNo: null,
        baseName: form.name,
        variantName: null,
        fullName: form.name,
        stage: STAGE_LABELS[form.stageIndex] ?? `${form.stageIndex}阶`,
        sourceCategory: "S4前瞻",
        types: [...form.types],
        raceStats: isFinal ? { ...form.raceStats } : null,
        ...(isFinal ? {} : { calculationStatus: "pending-race-stats" }),
        ...(isFinal
          ? {
              previewDefaults: {
                natureId: form.previewDefaults.natureId,
                displayIvs: { ...form.previewDefaults.displayIvs },
              },
            }
          : {}),
        traitIds: isFinal ? [familyTraitId] : [],
        traitName: isFinal ? family.trait.name : null,
        evolutionChainNames: family.forms.map(({ name }) => name),
        source,
        provenance: {
          identity: source,
          stage: source,
          sourceCategory: source,
          types: source,
          raceStats: source,
          traitIds: source,
          evolutionChainNames: source,
          previewIdentity: {
            candidateRowKey: form.candidateRowKey,
            catalogId,
            formalIdPending: true,
            isFinal,
            stageStatus: form.stageStatus,
          },
        },
      });

      next.learnsets.push({
        spiritId,
        skillIds,
        defaultSkillIds: [...skillIds],
        acquisitions: Object.fromEntries(
          skillIds.map((skillId) => [skillId, ["解锁：S4前瞻截图列出，等级待确认"]]),
        ),
        sources: [source],
        provenance: {
          skillIds: source,
          acquisitions: source,
        },
      });
    }
  }

  for (const boss of bossEntries) {
    const spiritId = provisionalSpiritId(catalogId, boss.name);
    const bossTraitId = traitId(boss.trait);
    const { baseLearnset, baseSpirit } = bossBaseByName.get(boss.name);
    const inheritedSource = baseSpirit.source ?? source;
    const inheritedProvenance = baseSpirit.provenance ?? {};
    const usesTemporaryVideoFrame =
      boss.assetStrategy === "official-video-frame-temporary";
    const bossAsset = usesTemporaryVideoFrame
      ? {
          sourceUrl: `/assets/spirits/${spiritId}.png`,
          width: 128,
          height: 128,
          status: "temporary-preview",
          replacementPending: true,
        }
      : {
          ...baseSpirit.asset,
          status: "inherited-placeholder",
          replacementPending: true,
        };
    const bossAssetProvenance = usesTemporaryVideoFrame
      ? {
          ...skillParameterSource,
          evidenceTimestamp: boss.assetEvidenceTimestamp,
          sourceFile: boss.assetSourceFile,
          usage: "temporary-video-frame",
        }
      : inheritedProvenance.asset ?? inheritedSource;
    const evolutionChainNames = [
      ...new Set([
        ...(baseSpirit.evolutionChainNames ?? [baseSpirit.fullName]),
        boss.name,
      ]),
    ];
    const evolutionChainNameSet = new Set(evolutionChainNames);
    next.spirits = next.spirits.map((spirit) =>
      evolutionChainNameSet.has(spirit.fullName)
        ? {
            ...spirit,
            evolutionChainNames: [
              ...new Set([
                ...(spirit.evolutionChainNames ?? [spirit.fullName]),
                ...evolutionChainNames,
              ]),
            ],
          }
        : spirit,
    );

    replaceOrAppend(next.traits, {
      id: bossTraitId,
      name: boss.trait.name,
      description: boss.trait.description,
      provenance: {
        identity: skillParameterSource,
        description: skillParameterSource,
        previewStatus: {
          catalogId,
          adaptationStatus: boss.trait.adaptationStatus,
          evidenceTimestamp: boss.evidenceTimestamp,
        },
      },
    });

    next.spirits.push({
      id: spiritId,
      dexNo: baseSpirit.dexNo,
      baseName: boss.name,
      variantName: null,
      fullName: boss.name,
      stage: boss.stage,
      sourceCategory: boss.sourceCategory,
      types: [...baseSpirit.types],
      raceStats: { ...baseSpirit.raceStats },
      traitIds: [bossTraitId],
      traitName: boss.trait.name,
      evolutionChainNames,
      asset: bossAsset,
      source: skillParameterSource,
      provenance: {
        identity: skillParameterSource,
        stage: skillParameterSource,
        sourceCategory: skillParameterSource,
        types: inheritedProvenance.types ?? inheritedSource,
        raceStats: inheritedProvenance.raceStats ?? inheritedSource,
        traitIds: skillParameterSource,
        evolutionChainNames: skillParameterSource,
        asset: bossAssetProvenance,
        previewIdentity: {
          candidateRowKey: boss.candidateRowKey,
          catalogId,
          baseSpiritId: baseSpirit.id,
          formalDataPending: true,
          inheritedFields: [
            "dexNo",
            "types",
            "raceStats",
            "learnset",
            ...(usesTemporaryVideoFrame ? [] : ["asset"]),
          ],
          evidenceTimestamp: boss.evidenceTimestamp,
          ...(boss.baseMatchEvidence
            ? { baseMatchEvidence: boss.baseMatchEvidence }
            : {}),
        },
      },
    });

    next.learnsets.push({
      ...structuredClone(baseLearnset),
      spiritId,
      skillIds: [...baseLearnset.skillIds],
      ...(Array.isArray(baseLearnset.defaultSkillIds)
        ? { defaultSkillIds: [...baseLearnset.defaultSkillIds] }
        : {}),
      acquisitions: structuredClone(baseLearnset.acquisitions ?? {}),
      sources: replaceSourceByUrl(baseLearnset.sources, skillParameterSource),
      provenance: {
        ...(baseLearnset.provenance ?? {}),
        previewStatus: {
          catalogId,
          baseSpiritId: baseSpirit.id,
          inheritance: "copy-base-exact",
        },
      },
    });
  }

  if (next.currentPatchChanges) {
    const entries = new Map(
      next.currentPatchChanges.spirits.map((entry) => [entry.entityId, entry]),
    );
    for (const { family, form } of formEntries) {
      const entityId = provisionalSpiritId(catalogId, form.name);
      const isFinal = form.isFinal === true;
      entries.set(entityId, {
        entityId,
        entityName: form.name,
        isNew: true,
        items: [
          {
            kind: "new",
            label: isFinal ? "新增精灵" : "占位形态",
            after: isFinal
              ? `特性·${family.trait.name}`
              : "种族值待确认",
          },
        ],
      });
    }
    for (const boss of bossEntries) {
      const entityId = provisionalSpiritId(catalogId, boss.name);
      entries.set(entityId, {
        entityId,
        entityName: boss.name,
        isNew: true,
        items: [
          {
            kind: "new",
            label: "新增首领占位",
            after: `继承${boss.baseSpiritFullName}种族值；特性·${boss.trait.name}`,
          },
        ],
      });
    }
    next.currentPatchChanges.spirits = [...entries.values()];
  }

  const previousSpiritsAdded = Math.max(
    0,
    Number(next.meta?.diff?.spiritsAdded) || 0,
  );
  const previousSkillsAdded = Math.max(
    0,
    Number(next.meta?.diff?.skillsAdded) || 0,
  );
  next.meta = {
    ...next.meta,
    id: "s4-preview-2026-09-02",
    rulesVersion: "s4-preview-2026-09-02",
    seasonId: "S4前瞻",
    counts: {
      ...(next.meta?.counts ?? {}),
      spirits: next.spirits.length,
      skills: next.skills.length,
      learnsets: next.learnsets.length,
      traits: next.traits.length,
    },
    diff: {
      ...(next.meta?.diff ?? {}),
      spiritsAdded:
        Math.max(0, previousSpiritsAdded - priorPreviewCount) +
        counts.forms +
        counts.bossPlaceholders,
      skillsAdded:
        Math.max(0, previousSkillsAdded - priorPreviewSkillCount) +
        counts.newSkillPlaceholders,
    },
    s4PreviewCatalog: {
      status: "candidate",
      source,
      counts: { ...counts },
      idStrategy: "以候选目录ID和完整名称生成临时ID；2026-09-10核实图鉴号后生成正式ID并提供迁移映射",
      pending: [
        "12个非最终形态的种族值、特性、学习面与正式阶数",
        "23个形态图鉴号、正式阶数、形态来源和正式身份",
        "受遮挡资料中的特性名“活体标本”需以正式文本复核",
        "23个形态的正式BWIKI头像绑定（当前使用本地前瞻原色图）",
        "2个首领的正式透明头像（当前均使用官方视频帧临时抠图）",
        "降雨、午夜爆音的属性、类别、能耗和基础威力",
        "24个视频确认新技能及首领特性“月相”的计算规则适配",
        "BWIKI正式数据逐字段核实",
      ],
    },
    sources: replaceSourceByUrl(
      replaceSourceByUrl(next.meta?.sources, source),
      skillParameterSource,
    ),
    contentSha256: null,
  };
  next.meta.contentSha256 = sha256Hex(JSON.stringify(next));
  return next;
}

async function main() {
  const [snapshotText, candidateText] = await Promise.all([
    readFile(DEFAULT_SNAPSHOT_PATH, "utf8"),
    readFile(DEFAULT_CANDIDATE_PATH, "utf8"),
  ]);
  const patched = applyS4PreviewCatalog(
    JSON.parse(snapshotText),
    JSON.parse(candidateText),
  );
  await writeFile(
    DEFAULT_SNAPSHOT_PATH,
    `${JSON.stringify(patched, null, 2)}\n`,
    "utf8",
  );
  process.stdout.write(
    `S4 前瞻目录已写入：spirits=${patched.meta.s4PreviewCatalog.counts.forms} bossPlaceholders=${patched.meta.s4PreviewCatalog.counts.bossPlaceholders} placeholderForms=${patched.meta.s4PreviewCatalog.counts.placeholderForms} traits=${patched.meta.s4PreviewCatalog.counts.traits + patched.meta.s4PreviewCatalog.counts.bossTraits} newSkillPlaceholders=${patched.meta.s4PreviewCatalog.counts.newSkillPlaceholders}\n`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
