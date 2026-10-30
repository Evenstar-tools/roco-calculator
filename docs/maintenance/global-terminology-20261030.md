# 国际服英日正式术语校订 · 2026-10-30

用户要求回查海外包体，找出英日错译并修正上线。保留现有界面与功能，数据仍为S3季中。本次源码基线为实际线上国际服固定源码 `20404fe`，不使用包含其他在途改动的工作目录拼包。

## 来源与核对范围

- 本机 `C:/RoCoKingdom/Win64/NRC/Binaries/Win64/NRC-Win64-Shipping.exe` 当前文件版本为 `1.61.0.91`。仅只读访问版本与既有解码资料，没有修改客户端。
- 正式词来自 `data/research/global-client-20261028/ui/official-ui-glossary.json`、`client-ui-source-strings.json`、`locres-ui-trilingual.json`；实体按 `official-name-map.json`、愿力补充记录和现有ID桥核对，不按同名强配。
- 当前S3的592只精灵、571个技能、227项特性均有正式英日名称，显示词库逐项一致。两处已有依据的S3描述校订（做好事英文受益者、光度换算日文数值）保留。
- 纠正224个现有界面键，涉及161个英文单元格、170个日文单元格；这些是标题、配置说明、日志和简称的语境校对，不是重新翻译客户端全部剧情。

## 主要修正

| 中文概念 | English | 日本語 | 原生依据 |
| --- | --- | --- | --- |
| 传动 | Gearshift | 位置変動 | DESC_NOTE_CONF 1033 |
| 轮班技能 | Gear Shift | シフト制 | SKILL_CONF 7070220；与传动机制分开 |
| 技能石 | Skill Tablet | スキルストーン | DESC_NOTE_CONF 2018 |
| 共鸣魔法 | Resonance Ritual | 共鳴魔法 | DESC_NOTE_CONF 2063、LOCALIZATION_CONF umg_magic_title |
| 血脉 | Bloodline | 血統 | LOCALIZATION_CONF pet_filter_title_blood |
| 首领形态 | Alpha form | リーダー形態 | LOCALIZATION_CONF handbook_boss_title及原生首领词 |
| 个体资质 | Individual Aptitude | 個体資質 | LOCALIZATION_CONF filter_attribute_list |
| 种族资质 | Species Aptitude | 種族資質 | 原生资质界面；项目种族值标签按语境对应 |
| 奉献 | Offering | 献身 | DESC_NOTE_CONF 1009 |
| 迸发 | Surge | はじける力 | DESC_NOTE_CONF 1010 |
| 愿力冲击 | Wishpower Blast | 願いの波動 | client-wish-power.json，按正式技能ID |
| 咕噜球 | Buddy Pod | バディオーブ | 原生locres咕噜球文本 |
| S1暗夜拾光 | Embers in the Night | 闇夜に辿る光 | locres D4E6541A4F073D723F1319AAEA67264E |

同时同步属性Class、性格Personality、状态技能Status／状態、应对状态、风起与龙噬印记等组合说明。紧凑界面使用Ind. Apt.、Species SPD、Pers.及日文資質／種族等明确简称，完整说明保留正式名称。保留法律声明中的普通“角色”含义，以及自然的天气描述用语。

## 同名词的实际故障

传动历史原来把整行技能名称交给通用词典，日语技能“暴风雪”误用天气“吹雪”，“雷暴”也误套普通天气译文。槽位、初始预览、行动项、历史和变化来源现按技能身份取正式名称，分别显示“雪あらし”“サンダーストーム”。历史保留原始技能引用，切语言时重新显示；不修改引擎或持久化协议。

普通属性Common／ノーマル与无修正性格Neutral／補正なし继续隔离；性格“警惕”Vigilant与同名特性Vigilance不互相覆盖。

## 验证

- 在现有回归中加入由客户端sourceId独立取预期的术语契约，覆盖传动组合标题、累计记录、技能石加正式技能名、血脉、Magic、状态、Advantage、普通性格与普通属性；真实组件回归覆盖技能／天气同名分流。
- 数据生成后，国际服源码关键回归全部通过；定向多语言界面、英日工具、用户日志、语言表维护回归与ESLint通过。语言主表sync/check通过，已有待复核条目继续保留，没有把结构校验写成全语言包逐句审校完成。
- 源码分支已有Web／小程序核心分叉，`npm test`的前置镜像检查仍会报告该既有差异；本轮未修改核心或同步小程序。用已生成runtime直接运行源码关键配置完成验证，正式发布树另执行自身完整构建门禁。
- 英文1440亮色、日文1440及390暗色实际操作传动：选技能、开始、查看来源和逐层顺序均正常，文档宽度等于视口。新增字样适配原有版式，没有重做界面。

正式发布固定源码、构建与公网回查写在发布树同名记录中。本文件不把源码测试通过当作已上线。
