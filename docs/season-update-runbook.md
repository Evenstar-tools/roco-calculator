# 赛季数据更新

运行时只读取仓库内的构建快照，不会现场抓取网页。更新赛季数据前，请准备已核验的赛季 CSV 与 BWIKI 页面缓存，并通过环境变量指定路径。

```powershell
$env:ROCOM_S3_CSV='.\data\sources\rocom_world_s3_spirits.csv'
$env:ROCOM_BWIKI_CACHE='.\data\sources\bwiki_cache'
```

## 更新流程

1. 建立基线：

   ```bash
   npm ci
   npm run data:validate
   npm test
   ```

2. 构建候选快照：

   ```bash
   npm run data:build
   ```

3. 同步素材：

   ```bash
   node scripts/bwiki/sync-assets.mjs
   ```

4. 审查精灵、技能、学习集、特性规则和素材数量的变化。动态规则没有可靠依据时，应保持需要输入或未支持状态，不要猜测数值。

5. 执行发布门禁：

   ```bash
   npm run data:validate
   npm test
   npm run e2e
   npm run build
   git diff --check
   ```

## 数据要求

- 精灵形态使用稳定 ID，进化链中的不同形态不得合并。
- 技能和学习集引用必须存在。
- 素材清单中的路径、摘要、宽高必须可以重新计算。
- 快照中不得包含本机盘符、`file:///` 地址、令牌或私有缓存路径。
- 特殊技能与特性的规则修改必须附测试和可核验依据。

## 回滚

从 Git 历史建立独立分支，恢复上一份已验证的赛季快照及对应素材和规则；重新运行完整门禁后再发布。不要直接手改大型 JSON，也不要用破坏性命令覆盖工作区。
