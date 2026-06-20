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
  const dueLabel = space.dueDay ? `Dia ${space.dueDay}` : "Sin vencimiento";
  const parkingLabel = space.hasParking
    ? space.parkingFee > 0
      ? `Parking ${space.parkingFee.toLocaleString("es-PY")}`
      : "Parking pendiente"
    : "";

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
        <p className="space-card__charge">{rentLabel}</p>
        <div className="space-card__meta">
          {nonRentable ? <span>No genera cobro</span> : <span>{dueLabel}</span>}
          {!nonRentable && space.additionalOccupants.length > 0 ? (
            <span>{space.additionalOccupants.length} adicionales</span>
          ) : null}
          {parkingLabel ? <span>{parkingLabel}</span> : null}
        </div>
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
