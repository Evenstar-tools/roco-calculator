export const appMessages = Object.fromEntries([
  [
    "国际服数据尚待核验",
    "Global data needs verification",
    "グローバル版のデータは未検証です"
  ],
  [
    "国际服数值与规则核验前，暂不提供计算；存档、分享和界面设置可正常使用。",
    "Calculations will be available after Global stats and rules are verified. Saved setups, sharing and interface settings are available.",
    "グローバル版の数値とルールの検証が完了するまで計算は利用できません。設定の保存・共有・表示設定は利用できます。"
  ],
  [
    "正在打开电鹿工具…",
    "Opening KO threshold…",
    "撃破ラインを開いています…"
  ],
  [
    "正在打开承伤对比…",
    "Opening damage comparison…",
    "被ダメージ比較を開いています…"
  ],
  [
    "正在打开排行榜…",
    "Opening rankings…",
    "ランキングを開いています…"
  ],
  [
    "正在打开传动计算器…",
    "Opening transmission calculator…",
    "伝動計算機を開いています…"
  ],
  [
    "正在打开属性查询…",
    "Opening type matchups…",
    "タイプ相性を開いています…"
  ],
  [
    "正在打开技能查询…",
    "Opening skill search…",
    "スキル検索を開いています…"
  ],
  [
    "正在加载 S4「季中」数据…",
    "Loading S4 Midseason data…",
    "S4 シーズン中盤のデータを読み込み中…"
  ],
  [
    "已清理未完成配置，保留 {count} 只完整配置",
    "Removed incomplete setups; kept {count} complete setups",
    "未完了の設定を削除し、{count}件の設定を保持しました"
  ],
  [
    "{side}萌化配置保留已{status}（{scope}）",
    "{side} form setup memory {status} ({scope})",
    "{side}の形態変更時の設定保持を{status}（{scope}）"
  ],
  [
    "开启",
    "enabled",
    "有効化"
  ],
  [
    "关闭",
    "Close",
    "閉じる"
  ],
  [
    "跨页面记忆",
    "across pages",
    "ページ間で保持"
  ],
  [
    "本标签页",
    "this tab",
    "このタブのみ"
  ],
  [
    "设置未能保存；当前标签的修改仍保留",
    "Settings could not be saved; changes are kept in this tab",
    "設定を保存できませんでした。このタブでは変更内容を保持しています"
  ],
  [
    "已载入{side} {name}",
    "Loaded {name} as {side}",
    "{side}に{name}を読み込みました"
  ],
  [
    "队伍成员",
    "Team members",
    "チームメンバー"
  ],
  [
    "能力方案已应用到{side} {name}",
    "Applied the stat setup to {side}: {name}",
    "{side}の{name}に能力設定を適用しました"
  ],
  [
    "当前精灵",
    "Current Jini",
    "現在のキャラクター"
  ],
  [
    "主配置已变化，请重新打开承伤对比",
    "The main setup has changed. Reopen damage comparison.",
    "基本設定が変更されました。被ダメージ比較を開き直してください。"
  ],
  ["页面无法显示，请重新加载。", "The page could not be displayed. Please reload.", "ページを表示できませんでした。再読み込みしてください。"]
].map(([key, en, ja]) => [key, { en, ja }]));
