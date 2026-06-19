import {
  formatResponsibleName,
  getSpaceChargeLabel,
  getSpaceStatusLabel,
  isNotForRent,
} from "../lib/buildingManagement";
import type { BuildingSpace } from "../types/building";
import { StatusPill } from "./StatusPill";

interface SpaceCardProps {
  space: BuildingSpace;
  onEdit: (spaceId: string) => void;
  auditLine?: string;
}

export function SpaceCard({ space, onEdit, auditLine }: SpaceCardProps) {
  const responsibleName = formatResponsibleName(space.paymentResponsible);
  const rentLabel = getSpaceChargeLabel(space);
  const nonRentable = isNotForRent(space);

  const actionLabel =
    space.status === "disponible" ? "Cargar" : space.type === "terraza" ? "Ver datos" : "Editar";

  return (
    <article className="space-card">
      <div className="space-card__header">
        <div>
          <p className="eyebrow">
            {space.level} / {space.type}
          </p>
          <h3>{space.displayName}</h3>
          {space.alias ? <p className="space-card__alias">{space.alias}</p> : null}
        </div>
        <StatusPill value={getSpaceStatusLabel(space)} />
      </div>

      <div className="space-card__body">
        <strong>{responsibleName}</strong>
        <p>{rentLabel}</p>
        {nonRentable ? (
          <p>Espacio reservado / no genera alquiler</p>
        ) : (
          <p>
            {space.additionalOccupants.length} ocupantes extra /{" "}
            {space.dueDay ? `vence dia ${space.dueDay}` : "sin vencimiento"}
          </p>
        )}
        {auditLine ? <p className="audit-note">{auditLine}</p> : null}
      </div>

      <div className="space-card__footer">
        <button
          className="secondary-button secondary-button--small"
          type="button"
          onClick={() => onEdit(space.id)}
        >
          {actionLabel}
        </button>
      </div>
    </article>
  );
}
