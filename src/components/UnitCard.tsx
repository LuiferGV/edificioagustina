import { StatusPill } from "./StatusPill";
import type { UnitRecord } from "../types/building";

interface UnitCardProps {
  unit: UnitRecord;
}

export function UnitCard({ unit }: UnitCardProps) {
  return (
    <article className="unit-card">
      <div className="unit-card__header">
        <div>
          <p className="eyebrow">{unit.floor}</p>
          <h3>{unit.id}</h3>
        </div>
        <StatusPill value={unit.state} />
      </div>

      <div className="unit-card__body">
        <p className="unit-card__resident">{unit.resident}</p>
        <p>{unit.area}</p>
        <p>Saldo: {unit.balance}</p>
        <p>Ultimo pago: {unit.lastPayment}</p>
      </div>

      <p className="unit-card__notes">{unit.notes}</p>
    </article>
  );
}
