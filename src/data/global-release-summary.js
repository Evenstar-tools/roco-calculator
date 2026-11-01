export const GLOBAL_RELEASE_SUMMARY = Object.freeze({
  date: "2026.11.01",
  eyebrow: "国际服",
  title: "国际服计算器",
  description: "采用 S3 季中数值与规则。",
  items: [
    { id: "loadRecovery", title: "加载恢复修复", description: "更新检查不再一直等待，损坏的头像缓存可自动重试；失败时显示精灵名称。速度线与耐久排行移除麦田重复外观。" },
    { id: "attackStats", title: "攻击变化修复", description: "手调等级仍调整双攻；技能按S3文案只调整指定攻击。贪得无厌只加物攻，旧配置层数保留。" },
    { id: "interactions", title: "操作修复", description: "修正单技能防御解除、水泡盾增益与窄屏技能名，补齐增益摘要译文。" },
    { id: "presets", title: "常用精灵配置", description: "国际服常用配置有新增或更新时提醒，导入后不再提醒，手改配置保留。" },
    { id: "durability", title: "耐久排行", description: "已有精灵新增四种特性配置，保留基础档，可关闭特殊配置。" },
    { id: "typeChart", title: "18 系克制图", description: "查看18系攻防倍率，支持键盘定位。", action: "打开" },
    { id: "speed", title: "全屏速度线", description: "全屏查看速度线，拖动纵轴定位，补齐零个体速度对比。", action: "打开" },
    { id: "conditions", title: "条件与星陨斩杀线", description: "精简版可编辑技能和特性条件；结果栏可查询并应用星陨最低层数。" },
    { id: "locale", title: "英日界面完善", description: "按客户端统一英日术语，修正工具标题、配置说明与记录，切换语言保留配置。" },
  ],
});
