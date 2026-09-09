# 两处技能名称修正

按用户本次确认的原始截图实施，仅包含以下修正，不把未更新的 BWIKI 当成已确认来源。

- 引力旋转改为引力偏转，沿用 `skill_f7eea4de117d30ed`，不新建重复技能。
- 摇铃魔偶原绑定午夜爆音，改为引用已有午夜噪音 `skill_15fb272dc50faf16`；同时更新当前默认槽及内置热门预设。原占位实体保留，避免破坏历史配置引用。
- 午夜噪音已有技能参数为幽系魔攻、耗能 4、威力 20。摇铃魔偶学习关系依据截图及用户确认，明确记录 `bwikiLearnsetConfirmed: false`。
- 不纳入麦芒、冰锋横扫威力、完整 S4 学习池或其他工作区改动。这些内容仍是独立的本地改动。

重放命令：`node scripts/bwiki/apply-s4-name-corrections.mjs`，随后执行 `npm run data:runtime` 和 `node scripts/miniapp/build-bundled-runtime.mjs`。前瞻 CLI 也会在生成后应用两处名称修正。

提交采用 HEAD 的独立临时副本生成数据后精确暂存，避免把混在同一 JSON 中的待核数据一并提交；不覆盖当前工作区候选内容。回退可单独 revert 本次提交，未执行推送或打包。
