# 配置库导出/导入开发计划

## 目标与边界

新增“配置库导出”和“配置库导入”，仅服务主界面的精灵选择与自动配置恢复，与队伍预设完全隔离。

- 每个具体精灵形态只保存一套个人配置，不支持同精灵多套方案。
- 每个用户在自己的浏览器或电脑维护独立配置，通过 JSON 文件分享，不增加账号、云同步或服务器。
- 配置库等于“手动收藏且已有配置记忆”的精灵集合；已收藏但未配置的精灵跳过，未收藏的自动记忆不导出。
- 不新增官方内置模板，不修改、不导入、不导出任何队伍数据。

## 配置库格式

文件名：`洛克计算器-收藏配置-YYYYMMDD-HHmm.json`。

```json
{
  "format": "rock-calculator.favorite-config-library",
  "schemaVersion": 1,
  "appVersion": "当前应用版本",
  "versions": { "data": "数据版本", "rules": "规则版本" },
  "exportedAt": "ISO 时间",
  "entryCount": 1,
  "entries": [
    {
      "spiritId": "包含具体形态的稳定精灵 ID",
      "natureId": "性格 ID",
      "displayIvs": {
        "hp": 0,
        "speed": 60,
        "physicalAttack": 60,
        "magicalAttack": 60,
        "physicalDefense": 0,
        "magicalDefense": 0
      },
      "skills": ["技能1ID", "技能2ID", "技能3ID", "技能4ID"],
      "traitValues": { "trait.特性字段.语义指纹": true }
    }
  ]
}
```

每项必须包含具体形态 `spiritId`、性格、六项合法个体、固定四技能槽和可复用特性设置。空技能槽使用 `null`。

明确不导出：队伍、单技能临时选择、当前 HP、能力等级、天气、印记、减伤、最终倍率、当前方向、本回合触发、技能临时威力/连击及其他战斗临时输入。

## 特性字段与个人记忆 v2

新增 `rock-calculator.spirit-configs.v2`，顶层增加 `traitValues`，作为精灵长期特性设置的唯一来源。

- 只保存由特性定义、且 `scope !== "battle"` 的触发勾选、层数、分支和自定义数值。
- 黑猫密探、迪莫家族、棋绮后进化形态等统一按特性控件定义保存，不按精灵名称硬编码。
- 将现有 `attackerTrait.*`、`defenderTrait.*` 归一化为 `trait.<标准字段名>.<语义指纹>`；加载到攻方或防方时再映射到对应角色。
- v1 迁移时从单技能和四技能上下文提取合法特性字段，保留技能自身长期记忆；成功写入 v2 后才完成迁移，损坏数据保留备份。

## 配置库导出

新增组合服务，同时读取收藏、个人记忆、当前快照与版本信息：

```js
buildFavoriteConfigLibrary({
  favorites,
  spiritConfigs,
  snapshot,
  versions,
  appVersion,
  now,
})
```

返回：

```js
{ library, exportedCount, skippedUnconfiguredCount }
```

导出时取手动收藏与个人记忆交集，四技能只输出稳定技能 ID，特性字段按当前定义过滤和归一化。导出前显示“可导出 X 只精灵、将跳过 Y 只未配置收藏”；有效数量为 0 时禁止导出。移动端优先系统文件分享，失败时回退下载；Windows 和桌面浏览器下载 JSON。

## 配置库导入

新增解析接口：

```js
parseFavoriteConfigLibrary(json, { snapshot, currentVersions })
```

返回只读条目与预览：新增、覆盖、新增收藏、缺失精灵、失效技能、未知特性、无效条目和重复条目。

导入约束：

- 文件最大 5 MB、最多 2000 条。
- 解析与校验阶段不写入；用户确认后原子写入收藏与个人配置。
- 同一 `spiritId` 导入配置覆盖现有配置；未涉及的本地配置和收藏不变。
- 导入条目自动设为手动收藏，不自动切换当前精灵，不打开队伍抽屉。
- 重复 ID 采用文件中最后一条有效配置，并在预览提示。
- 缺失精灵整条跳过；失效技能只清空槽位；非法性格、越界个体和非法结构整条跳过。
- 未知特性字段忽略并提示，数值按当前控件上下限校验。
- 数据/规则版本不同只警告，最终以当前快照校验；未知配置库 schema 阻止导入。
- 导入配置没有携带的字段回到默认值，不能继承本地旧精灵的战斗临时状态。

原子导入接口：

```js
applyFavoriteConfigLibraryImport({
  preview,
  favoritesRepository,
  spiritConfigsRepository,
})
```

写入前生成两份完整新状态并验证；任一步失败恢复导入前收藏和配置。`teamPresetsRepository` 不参与，测试需证明队伍存储字节级不变。

## 旧版兼容

支持旧版原始收藏数组：

- 仅有 `{ kind: "spirit", spiritId }` 时恢复收藏，不创建空配置。
- 携带完整 `state.sides.attacker/defender` 时提取双方有效精灵配置。
- 同一精灵多次出现时采用文件最后一条有效配置；不能转换的记录进入预览统计。
- 旧版导入永不创建队伍。

继续读取旧收藏和旧个人配置本地键，迁移到 `rock-calculator.*`；旧名称只用于隐藏兼容读取，不在 UI、导出文件和安装资源出现。

## UI

现有系统菜单增加“配置库导出”“配置库导入”，不增加常驻页面。

- 导出弹窗显示有效数、跳过数和“仅包含收藏精灵的性格、个体、四技能和特性配置”。
- 导入弹窗完成文件选择、预览、覆盖警告、确认与取消。
- 完成提示使用“已导入 X 只精灵，覆盖 Y 只，跳过 Z 只”。
- 导入后刷新收藏亮标和完整配置状态；下次选择精灵恢复新配置。

## 旧名称全包清理

安装包及运行资源统一使用中文“洛克计算器”和英文 `rock-calculator`：桌面元数据、缓存、数据 URN、运行 JSON、导出格式、本地新键、安装程序、快捷方式、卸载项、UI、日志和离线资源均清理。

- `urn:lovepvp:*` 改为 `urn:rock-calculator:*`，重新生成运行数据和校验值，但精灵数、技能数、种族值、规则与伤害结果不得变化。
- 旧品牌明文只允许存在于仓库 `README`、`THIRD_PARTY_NOTICES` 的来源致谢；旧键兼容逻辑不得保留明文。
- 桌面打包扫描解包后的 `app.asar` 和 `extraResources`，旧名称不区分大小写零命中，否则打包失败。

## 实施顺序

1. 为新格式、旧格式和特性字段编写失败测试。
2. 升级个人配置 schema 并完成 v1 到 v2 迁移。
3. 实现特性字段角色归一化、验证和恢复。
4. 实现配置库构建、解析、预览和原子导入。
5. 接入收藏/个人记忆 Hook 和 UI 文件交互。
6. 补齐旧收藏数组和旧完整状态转换。
7. 清理安装包旧名称并增加打包门禁。
8. 同步共享核心至小程序；本轮不新增小程序文件选择 UI。
9. 完成全量 Web、小程序、E2E、离线与桌面打包验收。

## 测试与完成标准

单元测试覆盖交集、跳过、具体形态、三项 60、空技能槽、特性布尔/层数/分支/数值、攻防角色映射、battle 字段排除、v1 迁移、新旧格式、重复/损坏/超限文件、版本警告、回滚和队伍不变。

UI/E2E 覆盖菜单、统计、文件名、预览、取消、确认、星标刷新、精灵恢复、窄窗口、移动端、深色模式和键盘操作。

最终执行：

```text
npm run data:validate
npm test
npm run miniapp:sync-core
npm run test:core-drift
npm run miniapp:test
npm run miniapp:build
npm run acceptance:verify
npm run e2e
npm run build
npm run desktop:pack
git diff --check
```

完成必须满足：有效收藏配置全部导出；未配置收藏跳过；未收藏记忆不导出；队伍完全不变；具体形态、性格、个体、四技能和稳定特性完整往返；战斗临时状态不进入文件；旧版安全迁移；不同用户可交换文件；失败不破坏本地数据；安装资源旧品牌零命中；全量测试和离线打包通过。
