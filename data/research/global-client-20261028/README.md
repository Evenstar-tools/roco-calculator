# 国际客户端正式中英日译名对应表

提取日期：2026-10-28。来源为用户本地 `C:\RoCoKingdom`，实际游戏程序 `Win64/NRC/Binaries/Win64/NRC-Win64-Shipping.exe` 文件版本 **1.61.0.91**，UE 4.26.2。

**本轮已成功读取客户端英日文本，并与现有正式中文库对应。** 上轮标准 Pak 工具遇到的加密阻塞已解决；本次使用 Roco 专用 bitflip AES 变体，全程只读客户端。

## 交付

| 文件 | 已匹配范围 |
|---|---|
| `精灵中英日对照.csv` | 618 只精灵；另含 146 组正式形态译名 |
| `技能中英日对照.csv` | 553 个技能 |
| `特性中英日对照.csv` | 231 个原始游戏 ID，对应 228 个项目特性 |
| `official-name-map.json` | 上述 1402 条匹配记录，保留四语言原文、形态、描述、文本索引及项目 ID |
| `当前包未匹配中文条目.csv` / `unmatched-cn.json` | 44 条中文记录：4 精灵、26 技能、14 特性 |
| `client-only-name-records.json` | 包内另外 1652 条名称记录，未强配到现有中文库，开放状态未确认 |
| `client-placeholder-names.json` | 包内 EN 名称仍含中文的 63 条记录：37 精灵、26 技能；没有混入上述正式对应表 |

CSV 使用 UTF-8 BOM，可用 Excel 打开。名字和形态分列，不自行拼造官方显示名。JSON 保留 `<nobr>` 等源标签，另提供去标签的 `namePlain` / `formPlain`；源文案没有改写。

## 对应和验证

链路：现有中文 `game_id` → 客户端实体 `id` → 本表本地化字符串索引 → 客户端 `en` / `ja` / `zh_Hans` / `dev_CN`。

- 所有匹配项同时校验中文名称，精灵允许项目保留的明确形态括注。未使用拼音、模糊匹配或机器翻译补齐。
- `PETBASE_CONF` 是精灵基础表；`SKILL_CONF` 同时包含技能和战斗特性。`type=1/2` 与现有技能/特性分类逐项一致；未把野外天赋表当作战斗特性。
- 腾挪、保卫、好象坏象各有两个来源游戏 ID 对应一个项目特性，保留全部来源关系。
- 44 个缺失 ID 在本次对应表不存在；复核同名中文也未找到替代 ID。未认定它们永远不会进入国际服。
- 中文库两条 `legacy-unconfirmed` 技能“降雨”“午夜爆音”没有可核原始游戏 ID，未强配。
- 读取全部 35 个 Pak 索引，按补丁优先级解析目标路径；目标 14 个文件均来自 `pakchunk4-WindowsNoEditor.pak`，解出大小与目录元数据一致。
- 当前包 `BinDataCompressed_ROW` 的两张目标表与基础表逐字节相同。1136 个 PETBASE 行、1918 个 SKILL 行均完整解码、ID 唯一、无缺失语言引用，各语言非文本字段一致。
- 三份 CSV 全列读回通过；独立复核全部匹配记录、146 组形态和多对一特性关系。详见 `decode-qa.json`、`mapping-qa.json`、`independent-map-qa.json`。

这 3054 个包内表行包含测试、内部与占位项，**不代表当前测试可用的精灵或技能数量**。本批只完成文字来源与实体对应，没有启用国际服计算或确认数值规则。

已发现实际客户端文本差异：特性 `200312` 的中英文描述为威力 +30，日文为 +20。四语言原文保持原样，差异记录在 `mapping-qa.json`，未据此修改计算规则。

## 样例

| 游戏 ID | 中文 | English | 日本語 |
|---|---|---|---|
| 3001 | 喵喵 | Meevy | ニャーブ |
| 3004 | 迪莫 | Dimo | ディーモ |
| 3168 | 阿布 | Abriel | アブー |
| 7020360 | 抓挠 | Scratch | ひっかく |
| 7060130 | 折射 | Refraction | リフレクトレイ |
| 200076 | 氧循环 | Oxygen Cycle | 酸素循環 |

形态例：`3012` 鸭吉吉的正式名字为 `Duckiji` / `ダッキージ`，另有形态 `Fluffy Variant` / `ぽよぽよフォルム`，按不同 ID 保留，未按同名去重。

## 可复用入口和公开工具来源

本地过程目录：`_work/global-client-20261028/`。

1. `extract-terms.mjs`：只读列出 Pak，按优先级提取目标 schema、基础表和四语言文本；校验大小及实际文件头。
2. `schema-research/decode_local_tables.py`：使用客户端当前 schema 解码，保留本地化字符串索引和各语言原文。
3. `build-name-map.py`：对齐中文游戏 ID、核验中文名及类别，生成 JSON、CSV 和差异清单。

```powershell
node --experimental-transform-types _work/global-client-20261028/extract-terms.mjs
py -3 -X utf8 _work/global-client-20261028/schema-research/decode_local_tables.py
py -3 -X utf8 _work/global-client-20261028/build-name-map.py
```

- 实际使用的只读 Pak 解析器：[CHA1007/Umodel-MCP](https://github.com/CHA1007/Umodel-MCP/blob/main/src/pak.ts)，MIT 许可。
- 游戏专用算法交叉核对：[CUE4Parse Roco AES](https://github.com/FabianFG/CUE4Parse/blob/master/CUE4Parse/GameTypes/Tencent/RocoKingdomWorld/Encryption/Algorithms/FConfigurableCryptoAlgorithmAES.cs)。
- 解码器来源：[giraffe995/Roco-Kingdom-World-Data 的 decode_bin.py](https://github.com/giraffe995/Roco-Kingdom-World-Data/blob/main/Bin/decode_bin.py)。只复用代码，schema 与语言内容全部来自本机这版客户端。
- 新版解包适配参考：[rocom-go unpack-2026-09](https://github.com/zxsos/rocom-go/blob/master/docs/unpack-2026-09.md)。

未修改客户端、S5、小程序、计算规则或运行时界面；未提交、推送或更新线上。

## 界面术语补充

能力值、18种属性、抗性与弱点方向、性格、状态、天气及常用操作的提取与项目对应，见 [界面术语交付入口](ui/README.md)。该批独立保存已确认三语、上下文变体及待补中文源的英日标签，未写入运行时界面。

## 精灵种族值版本核查

后续只读核查结果见 [种族值对照与完整差异](stats/README.md)：592 条历史共有精灵的六维全部吻合项目 S3 季中基线；与现行 S4 比较，528 条相同、90 条不同、4 个 ID 缺失。占位特征、额外记录与完整六维分开保存，不据此启用国际服计算。
