import type { DashboardMetric } from "../types/building";

interface SummaryCardProps {
  metric: DashboardMetric;
}

export function SummaryCard({ metric }: SummaryCardProps) {
  return (
    <article className={`summary-card summary-card--${metric.tone}`}>
      <p className="summary-card__label">{metric.label}</p>
      <strong className="summary-card__value">{metric.value}</strong>
      <p className="summary-card__hint">{metric.hint}</p>
    </article>
  );
}
