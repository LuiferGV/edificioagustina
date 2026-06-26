import type { User } from "firebase/auth";
import type { AuditLogRecord, BuildingSpace, ExpenseRecord, RentLedgerRecord } from "../types/building";

function createAuditId(referenceDate = new Date()): string {
  return `audit-${referenceDate.getTime()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createAuditEntry(input: {
  action: string;
  actor: User | null;
  entityId: string;
  entityType: AuditLogRecord["entityType"];
  spaceId: string;
  summary: string;
}): AuditLogRecord {
  return {
    id: createAuditId(),
    entityType: input.entityType,
    entityId: input.entityId,
    spaceId: input.spaceId,
    actorUid: input.actor?.uid ?? "",
    actorEmail: input.actor?.email ?? "Usuario sin email",
    action: input.action,
    summary: input.summary,
    createdAt: new Date().toISOString(),
  };
}

function joinChanges(changes: string[], fallback: string): string {
  return changes.length > 0 ? changes.join(", ") : fallback;
}

export function buildSpaceAuditSummary(previous: BuildingSpace, next: BuildingSpace): string {
  const changes: string[] = [];

  if (previous.status !== next.status) {
    changes.push("cambio estado");
  }

  if (previous.monthlyRent !== next.monthlyRent) {
    changes.push("cambio alquiler");
  }

  if (previous.hasParking !== next.hasParking || previous.parkingFee !== next.parkingFee) {
    changes.push("actualizo estacionamiento");
  }

  if (previous.dueDay !== next.dueDay || previous.nextDueDate !== next.nextDueDate) {
    changes.push("cambio vencimiento");
  }

  if (previous.lastPaidPeriod !== next.lastPaidPeriod) {
    changes.push("actualizo ultimo mes pagado");
  }

  if (
    previous.paymentResponsible.displayName !== next.paymentResponsible.displayName ||
    previous.paymentResponsible.firstName !== next.paymentResponsible.firstName ||
    previous.paymentResponsible.lastName !== next.paymentResponsible.lastName ||
    previous.paymentResponsible.documentId !== next.paymentResponsible.documentId ||
    previous.paymentResponsible.taxId !== next.paymentResponsible.taxId ||
    previous.paymentResponsible.nis !== next.paymentResponsible.nis ||
    previous.paymentResponsible.meterNumber !== next.paymentResponsible.meterNumber
  ) {
    changes.push("cambio titular");
  }

  if (JSON.stringify(previous.additionalOccupants) !== JSON.stringify(next.additionalOccupants)) {
    changes.push("actualizo ocupantes");
  }

  if (previous.notes !== next.notes) {
    changes.push("actualizo notas");
  }

  return joinChanges(changes, "edito ficha del espacio");
}

export function buildRentAuditSummary(
  previous: RentLedgerRecord | null | undefined,
  next: RentLedgerRecord,
): { action: string; summary: string } {
  if (!previous) {
    if (next.paidAt) {
      return {
        action: "Registro pago",
        summary: "registro el pago del mes",
      };
    }

    return {
      action: "Creo cobranza",
      summary: "creo la cobranza del mes",
    };
  }

  const changes: string[] = [];

  if (previous.chargeAmount !== next.chargeAmount) {
    changes.push("cambio monto");
  }

  if (previous.dueDate !== next.dueDate) {
    changes.push("cambio vencimiento");
  }

  if (!previous.paidAt && next.paidAt) {
    changes.push("marco pagado");
  } else if (previous.paidAt !== next.paidAt) {
    changes.push("cambio fecha de pago");
  }

  if (previous.paymentMethod !== next.paymentMethod) {
    changes.push("cambio metodo de pago");
  }

  if (previous.receivedAmount !== next.receivedAmount) {
    changes.push("cambio importe cobrado");
  }

  if (previous.taxExpenseAmount !== next.taxExpenseAmount) {
    changes.push("actualizo gasto IVA");
  }

  if (previous.notes !== next.notes) {
    changes.push("actualizo observacion");
  }

  return {
    action: "Actualizo cobranza",
    summary: joinChanges(changes, "actualizo la cobranza del mes"),
  };
}

export function buildExpenseAuditSummary(
  previous: ExpenseRecord | null | undefined,
  next: ExpenseRecord,
): { action: string; summary: string } {
  if (!previous) {
    return {
      action: "Registro gasto",
      summary: "registro un gasto manual del edificio",
    };
  }

  const changes: string[] = [];

  if (previous.category !== next.category) {
    changes.push("cambio categoria");
  }

  if (previous.title !== next.title) {
    changes.push("cambio concepto");
  }

  if (previous.amount !== next.amount) {
    changes.push("cambio monto");
  }

  if (previous.dueDate !== next.dueDate) {
    changes.push("cambio vencimiento");
  }

  if (previous.paidAt !== next.paidAt) {
    changes.push(previous.paidAt ? "cambio fecha de pago" : "marco pagado");
  }

  if (previous.notes !== next.notes) {
    changes.push("actualizo observacion");
  }

  return {
    action: "Actualizo gasto",
    summary: joinChanges(changes, "actualizo un gasto manual del edificio"),
  };
}

export function formatAuditLine(entry: AuditLogRecord | null | undefined): string {
  if (!entry) {
    return "Sin movimientos recientes";
  }

  const actor = entry.actorEmail || "Usuario";
  const date = new Date(entry.createdAt);
  const dateLabel = Number.isNaN(date.getTime())
    ? entry.createdAt
    : new Intl.DateTimeFormat("es-PY", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(date);

  return `${actor} / ${entry.summary} / ${dateLabel}`;
}
