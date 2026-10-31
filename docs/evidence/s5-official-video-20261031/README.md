# S5 官方视频复现档案 · 2026-10-31

来源：[官号《S5赛季新技能与首领化展示》](https://www.bilibili.com/video/BV1SNxq6REfb/)，约3分32秒。归档于2026-11-01，正文见[全片伤害复现](../../maintenance/s5-official-video-damage-replay-20261031.md)及[参数补录](../../maintenance/s5-official-video-20261031.md)。

## 内容与版本

- [统一索引](complete-replay-index.json)收录19次技能攻击：1次默认配置吻合、2次应用可见条件后吻合、16次只能给出未证实的配置候选。数值命中不确认视频实际性格、个体或携带技能。
- 分段事实、逐步结果与对应请求输入一起保留，结果包含默认配置、完整状态、公式步骤及当时版本；[寄生与回复](segment070-status-result.json)独立于技能直接伤害。
- [技能实帧参数](skills-frame-evidence.json)保留参数转录；已录入产品的数据以[S5固定源码 reviewed JSON](https://github.com/Evenstar-tools/roco-calculator/blob/f554e39e80a38589dd9f766df5e78e585da028d4/data/reviewed/s5-official-video-20261031.json)为准。
- 发布来源：S5固定源码 `f554e39e80a38589dd9f766df5e78e585da028d4`；主线发布 `e57a2bd7a88134231170abc65e6a0cfb206892f0`；[CI 41208331883](https://github.com/Evenstar-tools/roco-calculator/actions/runs/41208331883)成功。线上入口为 [S5抢先版](https://rococalc.top/pre/)。
- 归档保留各次生成时的输入与数值，不用最新配置回写旧结果。琉璃君主当前采用用户确认的生命种族值141，其余沿用原形态；龙之利爪旧回放中的生命面板449属于生成时的基线，不能当作当前配置面板。视频约162秒满血533及“沉默、个体60可算出”是该基线调整的依据记录，不是官方完整首领种族值公布。

## 原始帧的保存范围

原始帧、视频、网页缓存、失败诊断、完整快照复制及构建日志只保存在本地工作目录，不在本档案中。JSON 中 `local-only:` 是本地原证据或生成文件标记，不是仓库文件链接；`<source-checkout>` 代表当时源码目录，不包含个人机器路径。

[全片采样索引](dense/index.json)、[灵扰加密索引](dense/fine-spirit-index.json)、[龙之爪牙加密索引](dense/fine-claw-index.json)保留采样时间和排除提示。可按官号视频 URL、时间戳及动作描述重新核对；不能把没有入库的帧名当作已公开图片。frame-0000、0015、0090、0286为跳转残帧，不用于伤害判定。

## 请求重放入口

`replay-s5-web.mjs` 通过真实 S5 Web 适配和项目 CLI 共用核心重放请求，使用与原位置相同的相对模块路径。需要在包含 S5 源码的分支根目录安装依赖；仅有普通主线发布记录的检出不具备这套 S5 模块。

在源码仓库根目录执行，例如：

```powershell
node docs/evidence/s5-official-video-20261031/replay-s5-web.mjs docs/evidence/s5-official-video-20261031/boss-ice-hail-input.json docs/evidence/s5-official-video-20261031/cli-project/recheck-result.json
```

迁移后已实际执行上面的冰雹请求：默认314伤害、可见生命条件后仍314，两个60级步骤的 CLI 与 Web 结果一致。未覆盖归档原文件。

入口会在被忽略的 `cli-project/` 下生成隔离 S5 快照、CLI 输入及指定输出。默认仅看脚本输出也可省略最后一个参数。重放结果取决于所检出代码与数据版本，当前重放不能覆盖归档的历史结果；候选输入中的 `localSkills` 只用于已知基础伤害，未实现机制仍按归档边界处理，不改变产品数据。

普通60级结果可与同核心 CLI 核对；S5非60级由 Web 等级投影完成，不能宣称普通 CLI 独立支持该等级。两个入口共用计算核心，不作为独立公式验证。
