import type { DashboardMetric } from "../types/building";

interface SummaryCardProps {
  metric: DashboardMetric;
  onClick?: () => void;
  actionLabel?: string;
}

export function SummaryCard({ metric, onClick, actionLabel = "Ver detalle" }: SummaryCardProps) {
  const content = (
    <>
      <p className="summary-card__label">{metric.label}</p>
      <strong className="summary-card__value">{metric.value}</strong>
      <div className="summary-card__footer">
        <p className="summary-card__hint">{metric.hint}</p>
        {onClick ? <span className="summary-card__action">{actionLabel}</span> : null}
      </div>
    </>
  );

  if (onClick) {
    return (
      <button
        className={`summary-card summary-card--${metric.tone} summary-card--interactive`}
        type="button"
        onClick={onClick}
      >
        {content}
      </button>
    );
  }

  return <article className={`summary-card summary-card--${metric.tone}`}>{content}</article>;
}
