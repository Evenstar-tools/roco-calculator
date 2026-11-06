import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CATALOG_PATH = 'public/tools/s5-nature/data/dice.json';
const SAFE_STAT_IDS = new Set([1, 2, 3, 4, 12, 13, 19, 33, 35, 37]);
const STAT_FIELDS = new Map([[29, 'physicalAttackMultiplier'], [30, 'magicalAttackMultiplier'],
  [31, 'physicalDefenseMultiplier'], [32, 'magicalDefenseMultiplier'], [6, 'speedMultiplier']]);
const TYPE_COEFFICIENTS = new Map([
  [7, { relation: 'super-effective', value: 2.5 }],
  [8, { relation: 'resistance', value: 0.4 }],
  [14, { relation: 'super-effective', value: 3.5 }],
  [15, { relation: 'resistance', value: 0.25 }],
]);
const UNSUPPORTED = new Map([
  [5, '回合结束恢复生命不是生命上限加成；尚无回合及恢复结算。'],
  [6, '回合结束回复能量需要能量与回合事件，不映射为伤害或威力倍率。'],
  [9, '效果伤害及对龙棋士的额外效果尚未接入直接命中结算。'],
  [10, '增加连击需要核对实际命中与技能类别，不直接乘最终伤害。'],
  [16, '回合结束恢复生命不是生命上限加成；尚无回合及恢复结算。'],
  [18, '能耗-3保留三份原始基础效果；尚无骰子能耗事件结算。'],
  [20, '效果伤害及对龙棋士的额外效果尚未接入直接命中结算。'],
  [21, '附加效果效率涉及增减益附加事件，不能换成通用攻防或威力倍率。'],
  [22, '附加印记层数需要具体印记、目标和事件，不能换成直接伤害倍率。'],
  [23, '回合结束回复能量需要能量与回合事件，不映射为伤害或威力倍率。'],
  [24, '增加连击需要核对实际命中与技能类别，不直接乘最终伤害。'],
  [25, '额外释放与能耗变化是不同事件；不能视为固定连击或伤害翻倍。'],
  [26, '扣除敌方当前生命是独立事件；缺当前生命状态，不当作生命上限或技能伤害倍率。'],
  [27, '随机效果须先确定本局实际结果；不随机生成或猜测其效果。'],
  [28, '技能能耗变化尚无骰子事件结算，不映射为威力倍率。'],
  [29, '连击次数变化尚无适用技能与命中事件结算，不直接乘最终伤害。'],
  [30, '效果伤害不是通用技能直接伤害；尚未接入对应事件。'],
  [31, '仅作用于克制伤害，双属性及极化组合公式未闭合，不套通用伤害倍率。'],
  [32, '下次技能额外释放涉及次数消耗与技能事件，不视为连击或通用伤害翻倍。'],
  [34, '回合结束恢复生命不是生命上限加成；尚无回合及恢复结算。'],
  [36, '原始五份速度+10是固定速度+50；现有标量只支持速度倍率，不冒充+50%。'],
  [38, '临时等级变化涉及属性与伤害系数重算，现有野怪等级链未支持。'],
  [39, '高额且不致死伤害需要事件、当前生命及保底逻辑，不伪装为固定倍率。'],
  [40, '给敌人附加强化需要解析实际目标及后续buff事件，不自动给所选一侧加成。'],
]);
const plain = value => typeof value === 'string' ? value.replace(/<[^>]*>/gu, '') : '';
const copy = value => JSON.parse(JSON.stringify(value));
const label = record => [...new Set([record.textPlain || plain(record.buff_text), plain(record.buff?.desc)].filter(Boolean))].join('；');

function scalarMapping(record) {
  if ([11, 17].includes(record.id)) {
    const amount = record.id === 11 ? 20 : 40;
    const base = record.buffBases?.[0];
    if (record.buffBases?.length !== 1 || base?.buffbase_order !== 23
      || base.buffbase_param?.[4]?.params?.[0] !== 2 || base.buffbase_param?.[5]?.params?.[0] !== amount) return null;
    return { effects: { skillPowerAdd: amount }, kinds: ['skill-power-flat'] };
  }
  if (!SAFE_STAT_IDS.has(record.id) || !Array.isArray(record.originalAttributeLinks)
    || !record.originalAttributeLinks.length || record.originalAttributeLinks.length !== record.buffBases?.length) return null;
  const effects = {};
  for (let index = 0; index < record.originalAttributeLinks.length; index++) {
    const link = record.originalAttributeLinks[index], base = record.buffBases[index];
    const field = STAT_FIELDS.get(link.attributeId);
    const [attribute, operation, amount] = link.rawParams ?? [];
    const percent = link.attributeId === 6 ? operation?.[0] === 1
      : link.is_percent_attr === 1 && operation?.[0] === 0;
    if (!field || !percent || attribute?.[0] !== link.attributeId || !Number.isInteger(amount?.[0])
      || amount[0] < 0 || amount[0] > 10000 || base?.buffbase_order !== 1
      || base.id !== link.baseId || effects[field] !== undefined
      || JSON.stringify(base.buffbase_param?.map(row => row.params)) !== JSON.stringify(link.rawParams)) return null;
    effects[field] = 1 + amount[0] / 10000;
  }
  return { effects, kinds: ['stat-multiplier'] };
}

function buildEffect(record) {
  const mapping = scalarMapping(record);
  const coefficient = TYPE_COEFFICIENTS.get(record.id);
  const supported = Boolean(mapping);
  const entry = {
    id: `game-dice-effect-${record.id}`,
    gameEffectId: record.id,
    recordKind: 'game-effect',
    buffId: record.buff_id,
    name: record.buff_name,
    description: label(record),
    supported,
    supportStatus: supported ? 'trial' : 'unsupported',
    effects: mapping?.effects ?? {},
    effectKinds: mapping?.kinds ?? [coefficient ? 'type-coefficient' : 'event-or-unresolved'],
    evidenceStatus: 'original-config-not-live-verified',
    formulaVerified: false,
    requiresConfirmation: true,
    sourceIds: ['game-dice-effects-20261107', 'game-buff-tables-20261107', 'game-attributes-20261107'],
    evidenceRefs: [
      { table: 'SEASON_BONUS_DICEBUFF_CONF', recordId: record.id },
      { table: 'BUFF_CONF', recordId: record.buff_id },
      ...record.buffBases.map(row => ({ table: 'BUFFBASE_CONF', recordId: row.id })),
      ...record.originalAttributeLinks.map(row => ({ table: 'ATTRIBUTE_CONF', recordId: row.attributeId })),
    ],
    availability: {
      faceConfigReferenceCount: record.faceConfigReferenceCount,
      currentlyObtainable: null,
      note: '静态引用数不是概率或当前可获得性，也不证明本局已生效。',
    },
    stacking: { rule: 'unknown', liveCount: null, note: 'add_max及重复策略为原始字段，不据此推断实际叠加公式。' },
    originalConfig: copy(record),
  };
  if (coefficient) entry.typeCoefficient = { ...coefficient };
  if (supported) {
    entry.applicationNote = '仅确认本局实际生效、面板和显示威力未重复包含后，按现有标量进行单来源试算；取整与叠加仍待实战核对。';
    if (Object.hasOwn(entry.effects, 'speedMultiplier')) entry.applicationNote += '速度仅调整面板，不自动判定先手或条件技能。';
  } else {
    entry.unsupportedReason = coefficient
      ? '保留原文系别系数；双属性、极化与钝化组合公式未闭合，不自动套全局威力或伤害倍率。'
      : UNSUPPORTED.get(record.id) ?? '原始字段尚不能安全映射到现有标量，不自动参与计算。';
  }
  return entry;
}

function legacyRecords(catalog) {
  return catalog.dice.filter(row => !Number.isInteger(row.gameEffectId)).map(row => {
    const result = copy(row);
    result.recordKind = result.id === 'none' ? 'neutral' : result.id.startsWith('resource-') ? 'legacy-resource' : 'legacy-alias';
    if (result.id === 'manual-power-plus-40') {
      result.aliasOf = 'game-dice-effect-17';
      result.legacyAlias = true;
    }
    if (result.id === 'unresolved-all-stats-plus-30') {
      result.aliasOf = 'game-dice-effect-19';
      result.legacyAlias = true;
      result.name = '全属性 +30%（旧配置，需重选）';
      result.description = '原表已恢复全能：双攻、双防和速度+30%，不含生命。旧配置保持未应用，请重新选择全能后试算。';
      result.knownParameters = [{ kind: 'stat-multiplier', multiplier: 1.3,
        stats: ['physicalAttack', 'magicalAttack', 'physicalDefense', 'magicalDefense', 'speed'] }];
      result.evidenceStatus = 'legacy-unapplied-original-scope-restored';
      result.unsupportedReason = '旧未生效配置不静默改为生效；请重新选择game-dice-effect-19（全能），确认本局生效且面板未重复包含后试算。';
      result.compatibilityNote = '保留旧未核实ID及不自动计算语义；原表全能仅双攻、双防和速度，不含生命。新选择使用game-dice-effect-19。';
    }
    result.supportStatus = result.id === 'none' ? 'neutral' : result.recordKind === 'legacy-resource'
      ? 'reference' : result.supported ? 'trial' : 'unsupported';
    return result;
  });
}

export function buildDiceCatalog(source, previous) {
  if (!Array.isArray(source.records) || source.records.length !== 40
    || new Set(source.records.map(row => row.id)).size !== 40
    || source.records.some(row => !Number.isInteger(row.id) || row.id < 1 || row.id > 40
      || !Array.isArray(row.buffBases) || !Array.isArray(row.originalAttributeLinks))
    || !Array.isArray(source.diceItems) || source.diceItems.length !== 4
    || new Set(source.diceItems.map(row => row.dice_type)).size !== 4) {
    throw new Error('Dice source requires all 40 unique effect records and four original gameplay types.');
  }
  const priorSources = [
    { id: 'local-dice-extraction-20261105', kind: 'local-static-extraction', title: '历史骰子外观资源提取', table: 'season NPC dice blueprint resources', status: 'resource-appearance-only', readDate: '2026-11-06' },
    { id: 'local-dice-resource-evidence-20261105', kind: 'local-static-extraction', title: '历史骰子模型与配置范围', table: 'season NPC dice blueprint resources', readDate: '2026-11-06' },
    { id: 'comment-image-6', kind: 'user-supplied-comment', title: 'Vodka_Cranberry：锤头鹳打十星迪莫', sourceDocument: 'S5奇遇机制视频评论区.docx', note: '历史评论记录威力+40；原图与实战链不随此公开目录发布。' },
    { id: 'comment-image-14', kind: 'user-supplied-comment', title: '尹仙子：伊兰亚龙打十星罗隐', sourceDocument: 'S5奇遇机制视频评论区.docx', note: '保留旧全属性+30%未核实入口；原表已补充五项作用范围，不等同该局实战验证。' },
  ];
  const originalSources = [
    { id: 'game-dice-effects-20261107', kind: 'original-game-config', tables: ['SEASON_BONUS_DICE_CONF', 'SEASON_BONUS_DICEBUFF_CONF', 'SEASON_DICE_CONF'], pak: 'pakchunk4-WindowsNoEditor_4_P.pak', reviewDate: '2026-11-07', sourceSnapshotDate: source.sourceSnapshotDate, note: '回读已有解码资料，按挂载点合并基础包及0至12号增量包；40个配置效果不等于40个当前可获得效果。' },
    { id: 'game-buff-tables-20261107', kind: 'original-game-config', tables: ['BUFF_CONF', 'BUFFBASE_CONF'], pak: 'pakchunk4-WindowsNoEditor_12_P.pak', note: '保留原始buff、基础效果顺序和重复ID；消费公式、触发流程及取整未恢复。' },
    { id: 'game-attributes-20261107', kind: 'original-game-config', tables: ['ATTRIBUTE_CONF'], pak: 'pakchunk4-WindowsNoEditor_3_P.pak', note: '按原始属性ID识别双攻、双防与速度；全能不含生命。' },
  ];
  return {
    meta: {
      ...copy(previous.meta), schemaVersion: 2, version: '2026-11-07', status: 'original-config-partial-trial',
      gameplayTypeCount: 4, gameEffectCount: 40,
      sourceBoundary: '四种龙龙骰玩法和40个效果来自原始配置；不等于实战验证、全部可获得或本局已生效。与精灵特性投骰分离。',
      selectionPolicy: '双方各自确认实际生效来源；一次仅试算单一效果，不按骰子面数随机生成，不替另一侧自动附加。',
      stackingPolicy: '未恢复多个同时生效来源的叠加公式；原始add_max不作为可叠证明，重复BUFFBASE项不得去重。',
      supportMeaning: 'supported=true仅指可按现有标量安全试算；supportStatus=trial，不代表服务器公式或实战已验证。',
      hpPolicy: '本目录没有通用生命上限骰子；回合恢复、扣当前生命及护盾不得映射为hpMultiplier。',
    },
    sources: [...priorSources, ...originalSources],
    diceTypes: source.diceItems.map(item => ({
      id: `game-dice-type-${item.id}`, gameDiceId: item.id, diceType: item.dice_type,
      name: item.dice_name, description: item.dice_desc,
      recordKind: 'gameplay-type', supportStatus: 'reference',
      evidenceStatus: 'original-config-not-live-verified', sourceIds: ['game-dice-effects-20261107'],
      availability: { currentlyObtainable: null, note: '静态玩法记录不证明当前账号或场景可获得。' },
      originalConfig: copy(item),
    })),
    dice: [...legacyRecords(previous), ...source.records.map(buildEffect)],
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const inputIndex = args.indexOf('--input');
  if (inputIndex < 0 || !args[inputIndex + 1]) throw new Error('Usage: node scripts/pve/build-dice-catalog.mjs --input <original-records.json>');
  const target = path.join(ROOT, CATALOG_PATH);
  const currentText = readFileSync(target, 'utf8');
  const catalog = buildDiceCatalog(JSON.parse(readFileSync(path.resolve(args[inputIndex + 1]), 'utf8')), JSON.parse(currentText));
  const newline = currentText.includes('\r\n') ? '\r\n' : '\n';
  writeFileSync(target, `${JSON.stringify(catalog, null, 2)}\n`.replace(/\n/gu, newline), 'utf8');
  process.stdout.write(`Prepared ${catalog.diceTypes.length} gameplay types and ${catalog.meta.gameEffectCount} original effects; no live verification claimed.\n`);
}
