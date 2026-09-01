const STEPS = [
  {
    detail: "支持名称模糊搜索",
    title: "选择攻守双方精灵",
  },
  {
    detail: "自动带出技能、特性与种族值",
    title: "挑选技能与条件",
  },
  {
    detail: "右侧实时显示伤害区间与剩余 HP",
    title: "查看伤害结果",
  },
];

export function EmptyStateGuide() {
  return (
    <section aria-label="使用引导" className="empty-guide">
      <h2 className="empty-guide__title">三步完成一次伤害计算</h2>
      <ol className="empty-guide__steps">
        {STEPS.map((step, index) => (
          <li className="empty-guide__step" key={step.title}>
            <span aria-hidden="true" className="empty-guide__step-index">
              {index + 1}
            </span>
            <span className="empty-guide__step-title">{step.title}</span>
            <span className="empty-guide__step-detail">{step.detail}</span>
          </li>
        ))}
      </ol>
      <p className="empty-guide__footnote">
        顶部「队伍」可管理六人配置 · 菜单内可一键导入常用精灵配置
      </p>
    </section>
  );
}
