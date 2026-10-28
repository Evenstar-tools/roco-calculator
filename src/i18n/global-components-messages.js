// Client terminology: data/localization/global/language-table.json.
// Other entries are calculator UI copy, not official game names.
export const globalComponentsMessages = Object.fromEntries([
  // table:ATTRIBUTE_CONF:1:attribute_name
  ["生命", "HP", "HP"],
  // table:ATTRIBUTE_CONF:2:attribute_name
  ["物攻", "P. ATK", "物攻"],
  // table:ATTRIBUTE_CONF:3:attribute_name
  ["魔攻", "M. ATK", "魔攻"],
  // table:ATTRIBUTE_CONF:4:attribute_name
  ["物防", "P. DEF", "物防"],
  // table:ATTRIBUTE_CONF:5:attribute_name
  ["魔防", "M. DEF", "魔防"],
  // table:ATTRIBUTE_CONF:6:attribute_name
  ["速度", "SPD", "速さ"],
  // table:NATURE_CONF:10:name
  ["坦率", "Candid", "素直"],
  // table:NATURE_CONF:11:name
  ["聪明", "Smart", "かしこい"],
  // table:NATURE_CONF:12:name
  ["专注", "Focused", "集中型"],
  // table:NATURE_CONF:13:name
  ["偏执", "Headstrong", "偏屈"],
  // table:NATURE_CONF:14:name
  ["冷静", "Calm", "冷静"],
  // table:NATURE_CONF:15:name
  ["理性", "Rational", "理知的"],
  // table:NATURE_CONF:16:name
  ["警惕", "Vigilant", "警戒態勢"],
  // table:NATURE_CONF:17:name
  ["温顺", "Docile", "おとなしい"],
  // table:NATURE_CONF:18:name
  ["害羞", "Shy", "照れ屋"],
  // table:NATURE_CONF:19:name
  ["慎重", "Cautious", "用心深い"],
  // table:NATURE_CONF:1:name
  ["大胆", "Bold", "強気"],
  // table:NATURE_CONF:20:name
  ["焦虑", "Anxious", "神経質"],
  // table:NATURE_CONF:21:name
  ["胆小", "Skittish", "小心者"],
  // table:NATURE_CONF:22:name
  ["急躁", "Hasty", "せっかち"],
  // table:NATURE_CONF:23:name
  ["开朗", "Cheerful", "陽気"],
  // table:NATURE_CONF:24:name
  ["莽撞", "Reckless", "無鉄砲"],
  // table:NATURE_CONF:25:name
  ["热情", "Passionate", "情熱的"],
  // table:NATURE_CONF:26:name
  ["沉默", "Quiet", "無口"],
  // table:NATURE_CONF:27:name
  ["忧郁", "Melancholy", "憂うつ"],
  // table:NATURE_CONF:28:name
  ["平和", "Peaceful", "温和"],
  // table:NATURE_CONF:29:name
  ["粗心", "Careless", "そそっかしい"],
  // table:NATURE_CONF:2:name
  ["固执", "Stubborn", "頑固"],
  // table:NATURE_CONF:30:name
  ["踏实", "Grounded", "堅実"],
  // table:NATURE_CONF:3:name
  ["调皮", "Mischievous", "わんぱく"],
  // table:NATURE_CONF:4:name
  ["勇敢", "Brave", "勇敢"],
  // table:NATURE_CONF:5:name
  ["逞强", "Bravado", "強がり"],
  // table:NATURE_CONF:6:name
  ["稳重", "Steady", "沈着"],
  // table:NATURE_CONF:7:name
  ["天真", "Naive", "無邪気"],
  // table:NATURE_CONF:8:name
  ["懒散", "Lazy", "怠け者"],
  // table:NATURE_CONF:9:name
  ["悠闲", "Carefree", "のんき"],
  // locres::26472A14459FF424DB64288FE1BD0F5F
  ["性格", "Personality", "性格"],
  // locres::43FD9B4145B3E12A916343BE0166BFBF
  ["个体", "Ind. Apt.", "個体資質"],
  ["普通（无修正）", "Neutral (no modifier)", "補正なし"],
  ["{nature}（无修正）", "{nature} (no modifier)", "{nature}（補正なし）"],
  ["{nature}（+{up} -{down}）", "{nature} (+{up} -{down})", "{nature}（+{up} -{down}）"],
  ["{nature}（{up}↑ {down}↓）", "{nature} ({up}↑ {down}↓)", "{nature}（{up}↑ {down}↓）"],
  ["{label}性格", "{label} personality", "{label}の性格"],
  ["{label}普通性格", "{label} neutral personality", "{label}の補正なし性格"],
  ["{label}快捷性格", "{label} quick personality", "{label}の簡易性格設定"],
  ["性格 {nature}", "Personality: {nature}", "性格：{nature}"],
  ["{label}快捷个体", "{label} quick aptitude", "{label}の簡易個体資質設定"],
  ["{stat}个体 {value}", "{stat} aptitude {value}", "{stat}の個体資質 {value}"],
  ["{label}{stat}个体加点", "{label} {stat} aptitude allocation", "{label}の{stat}個体資質配分"],
  ["{label}个体", "{label} individual aptitude", "{label}の個体資質"],
  ["选择性格并填写个体；未设置项会保持为空。", "Choose a personality and enter individual aptitude values. Unset fields stay empty.", "性格を選び、個体資質を入力します。未設定の項目は空のまま保持されます。"],
  ["选择或清空单技能、四技能槽。", "Select or clear slots in single-skill or four-skill mode.", "単一スキル・4スキルモードでスキルを選択・解除します。"],
  ["打开菜单中的“分享当前配置”生成链接，也可粘贴同服分享链接载入。", "Choose Share current setup in the menu to create a link, or paste a link from the same server to load a setup.", "メニューの「現在の設定を共有」でリンクを作成できます。同じサーバーの共有リンクを貼り付けて読み込むこともできます。"],
  ["导出包含性格、个体、技能和收藏。", "Exports include personalities, individual aptitude values, skills and favorites.", "性格・個体資質・スキル・お気に入りをエクスポートします。"],
  ["暂不可计算伤害；显示偏好会保留。", "Damage calculation is not available yet. Your display preferences are saved.", "ダメージ計算はまだ利用できません。表示設定は保存されます。"],
  ["暗夜拾光", "Nightfall Discoveries", "夜に見つけた光"],
  ["狂欢怪谈", "Carnival Tales", "カーニバルの怪談"],
  ["铅字幻梦", "Storybook Dreams", "活字の夢"],
  ["月涌狂想", "Moonlit Rhapsody", "月夜の狂想曲"],
  ["圣龙宝藏", "Sacred Dragon Treasure", "聖竜の秘宝"],
  ["选性格和个体", "Choose personality and aptitude", "性格と個体資質を選択"],
  ["成员性格", "Member personality", "メンバーの性格"],
  ["性格配置", "Personality setup", "性格設定"],
  ["{label}能力", "{label} stats", "{label}の能力値"],
  ["{label}等级", "{label} stage", "{label}の能力ランク"],
  ["{label}{ability}", "{label} {ability}", "{label}の{ability}"],
  ["{label}减一", "Decrease {label}", "{label}を1下げる"],
  ["{label}加一", "Increase {label}", "{label}を1上げる"],
  ["攻击能力等级", "Attack stages", "攻撃能力ランク"],
  ["防御能力等级", "Defense stages", "防御能力ランク"],
  ["原值的 {percent}%", "{percent}% of the base value", "元の値の{percent}%"],
  ["{stage}层 · {percent}%", "Stage {stage} · {percent}%", "{stage}段階 · {percent}%"],
  ["手调 {stage}层（双攻） · 特性：物攻 {physical}层、魔攻 {magical}层", "Manual: {stage} stages (both attacks) · Trait: P. ATK {physical}, M. ATK {magical}", "手動：両攻{stage}段階 · 特性：物攻{physical}段階、魔攻{magical}段階"],
  ["手调 {stage}层 · 特性 {bonus}层；{hint}", "Manual: {stage} stages · Trait: {bonus} stages; {hint}", "手動：{stage}段階 · 特性：{bonus}段階；{hint}"],
  ["{label}耐久概览", "{label} durability overview", "{label}の耐久値一覧"],
  ["点击进入能力分析", "Open stat analysis", "能力分析を開く"],
  ["物理耐久", "Physical durability", "物理耐久"],
  ["魔法耐久", "Magic durability", "魔法耐久"],
  ["综合耐久", "Combined durability", "総合耐久"],
].map(([source, en, ja]) => [source, { en, ja }]));
