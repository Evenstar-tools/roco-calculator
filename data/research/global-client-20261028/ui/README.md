# 国际客户端界面术语中英日对照

来源：用户本地 `C:\RoCoKingdom`，游戏客户端 **1.61.0.91**；提取日期 **2026-10-28**。本目录整理界面术语和对应来源，不改产品界面、数值、客户端或线上。

## 从哪里开始看

| 文件 | 用途 |
|---|---|
| [界面核心术语中英日.csv](界面核心术语中英日.csv) | 能力、属性、性格、技能、伤害修正、状态、印记、天气、血脉、操作等常用词；保留语境及原文差异 |
| [十八属性全称简称.csv](十八属性全称简称.csv) | 18种正式属性，短名、全名、游戏ID分列 |
| [当前项目文案对照.csv](当前项目文案对照.csv) | 对应当前计算器的229个重点概念，保留项目旧译、正式译文、源码位置和对应方式 |
| [未对应及多义词.csv](未对应及多义词.csv) | 未找到正式对应或需要区分使用场景的项目词；官方译文留空，旧译不冒充官方来源 |
| [原生界面完整中英日.csv](原生界面完整中英日.csv) | 从真实UI资产确认中文源文的2,104条记录；其中2,095条三语齐全，缺失语言留空 |
| [机制和天气说明中英日.csv](机制和天气说明中英日.csv) | 215条完整机制/天气说明，含原始富文本与数值；仅供文案对应 |
| [抗性与弱点方向_待补中文源.csv](抗性与弱点方向_待补中文源.csv) | 四种关系的8个英日文本键，中文源文尚未找回，明确留空 |
| [official-ui-glossary.json](official-ui-glossary.json) | 核心术语的程序读取入口，含raw、去标签plain、项目概念、语境和来源 |

CSV为UTF-8 BOM，可用Excel打开。源文中的大小写、空格、标点、富文本和不同场景变体均保留；按来源键查找，不按中文词汇全局替换。

## 常用词

| 中文概念 | 客户端英文 | 客户端日文 |
|---|---|---|
| 生命（能力表） | HP | HP |
| 物攻 | P. ATK | 物攻 |
| 魔攻 | M. ATK | 魔攻 |
| 物防 | P. DEF | 物防 |
| 魔防 | M. DEF | 魔防 |
| 速度（能力表） | SPD | 速さ |
| 个体资质 | Individual Aptitude | 個体資質 |
| 种族资质 | Species Aptitude | 種族資質 |
| 性格 | Personality | 性格 |
| 特性 | Trait | 特性 |
| 威力 | Power | 威力 |
| 耗能 | Energy Cost | コスト |
| 连击数 | Combo Count | 連撃数 |
| 系别 | Class | 属性 |
| 能力面板的属性 | Attributes | ステータス |
| 系别相性 | Class Matchup | 属性相性 |
| 克制（战斗提示） | Advantage | 有利 |
| 抵抗（战斗提示） | Resistant | 耐性 |
| 暴击 | Critical Hit | 会心 |
| 增益／减益 | Buff / Debuff | バフ / デバフ |
| 传动 | Gearshift | 位置変動 |
| 首领 | Alpha | リーダー |

这些是客户端原词。项目“种族值”对应原文“种族资质”，“个体”对应“个体资质”，“能耗”对应“耗能”；概念别名与客户端中文分列。生命也有Health，速度也有Speed，个体资质有Ind. Apt.短写，各自来源均保留。

| 属性 | English | 日本語 |
|---|---|---|
| 普通 | Common | ノーマル |
| 草 | Flora | 草 |
| 火 | Fire | 炎 |
| 水 | Water | 水 |
| 光 | Light | 光 |
| 地 | Earth | 地 |
| 冰 | Ice | 氷 |
| 龙 | Dragon | 竜 |
| 电 | Electro | 雷 |
| 毒 | Poison | 毒 |
| 虫 | Bug | 虫 |
| 武 | Fighting | 武 |
| 翼 | Wing | 翼 |
| 萌 | Charm | 萌 |
| 幽 | Shadow | 幽霊 |
| 恶 | Havoc | 悪 |
| 机械 | Mech | 機械 |
| 幻 | Stellar | 幻 |

## 抗性、弱点与多义词

`Game.locres`中已取得以下四组英日原文，每组两个不同key。限定UI资产和配置表未恢复它们的中文源文，不能认作已完成中文原词映射，也没有反译填入中文栏。

| English原文 | 日本語原文 |
|---|---|
| I Resist | 耐性 |
| Resists Me | 相手耐性 |
| Advantaged Against | 有利 |
| Disadvantaged Against | 不利 |

“克制／抵抗”的战斗提示已经有中文源证据，但不能据此把四方向关系全部压成两个词。接入抗性表时仍须按进攻／防御视角匹配。`Weak／イマイチ`的真实中文是“效果不佳”，不能当作“弱点”的正式独立标签。

其他须分开的场景：

- 普通属性的`Common`不用于“普通（无修正）”性格。
- `Priority／先手`的机制原文是忽略速度差的技能优先级；速度比较得出的先行动、历史先手次数另行对应。
- `Close／閉じる`指关闭界面；功能开关另有`setting_image_close → Off／閉じる`原行，按场景分列，并保留客户端日文原词。
- `Recovery／HP回復`是HP恢复，不用于“恢复设置”或“恢复官方种族值”。
- 技能类别“状态”与精灵负面状态分开；六维“魔攻”不采用旧技能标签“特攻”。
- 战斗天气采用`WEATHER_CONF.name_for_battle`；不拿世界天气“小雨／Light Rain”替代战斗“雨天／Rainy”。
- 静态威力、显示威力、自定义种族值等计算器专用词保留待译状态，不把项目旧英文标为客户端官方文本。

## 来源、缺口和校验

配置表链路：`BinConf schema → BinDataCompressed行 → 字符串索引 → zh_Hans/dev_CN/en/ja`。读取26张相关表，共12,695个本地化字段，包含说明、内部项及非UI内容，原始检索库为[client-ui-source-strings.json](client-ui-source-strings.json)。

界面链路：`UMG FText源中文 → namespace + key → Game.locres英日`，使用补丁Pak优先级。仅当FText源文与locres自带的sourceTextHash协议字段匹配时确认中文。读取1,176个相关UI资产，2,164处源文匹配；其余中文留null。[locres-ui-trilingual.json](locres-ui-trilingual.json)保留全部6,490个namespace/key与资产来源，包括尚无中文的英日行。

发现的客户端原文本身异常保存在[source-issues.json](source-issues.json)：世界天气“小雪”的英文是`Sean`，未推荐给界面；两项“攻击加成”的英文为`Damage Bonus`，与中日含义存在差异，标注后原样保留。

六项能力、18种有效属性、30个玩家性格已经核对；排除废弃岩系与非玩家重复性格。核心词和项目选定来源逐字段核验，CSV全列读回。结果见[qa.json](qa.json)，独立复核见[independent-ui-qa.json](independent-ui-qa.json)。包中出现某条内容只证明译文存在，不证明测试服已开放该精灵、功能或规则。

## 本地复用

过程目录：`_work/global-client-20261028/ui-terms/`。其中`extract-ui.mjs`、`decode-ui.py`负责配置表；`locres/`下的提取、解码、FText恢复脚本负责界面资源。无需再次提取客户端即可用当前已解码材料重建交付：

```powershell
py -3 -X utf8 _work/global-client-20261028/ui-terms/map-project-terms.py
py -3 -X utf8 _work/global-client-20261028/ui-terms/build-ui-delivery.py
```

`project-term-map.json`保留每条项目概念的候选来源和对应说明；`project-ui-exact-candidates.json`另列现有727条i18n文案的逐字匹配候选。候选不是替换指令，使用前须保留上述场景区分。
