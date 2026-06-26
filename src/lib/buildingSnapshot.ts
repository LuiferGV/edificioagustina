import { buildingSnapshot as demoSnapshot } from "../data/mockBuilding";
import {
  buildCollectionsFromSpaces,
  buildMetricsFromSpaces,
  buildUnitsFromSpaces,
  sortSpaces,
} from "./buildingManagement";
import type {
  AuditLogRecord,
  AnnouncementRecord,
  BuildingProfile,
  BuildingSnapshot,
  BuildingSpace,
  CollectionRecord,
  CollectionState,
  DashboardMetric,
  ExpenseCategory,
  ExpenseRecord,
  ExpenseSource,
  IncidentPriority,
  IncidentRecord,
  IncidentStatus,
  MetricTone,
  PaymentMethod,
  PaymentResponsible,
  PersonRecord,
  RentLedgerRecord,
  SpaceStatus,
  SpaceType,
  UnitRecord,
  UnitState,
} from "../types/building";

export interface ResolvedSnapshot {
  snapshot: BuildingSnapshot;
  source: "firebase" | "demo";
  message: string;
}

const metricTones: readonly MetricTone[] = ["sun", "clay", "mint", "ink"];
const unitStates: readonly UnitState[] = ["al dia", "con saldo", "mantenimiento", "disponible"];
const collectionStates: readonly CollectionState[] = ["pendiente", "pagado", "negociar"];
const incidentPriorities: readonly IncidentPriority[] = ["alta", "media", "baja"];
const incidentStatuses: readonly IncidentStatus[] = ["abierta", "en proceso", "resuelta"];
const spaceTypes: readonly SpaceType[] = ["departamento", "salon", "terraza"];
const expenseCategories: readonly ExpenseCategory[] = [
  "limpieza",
  "luz",
  "contador",
  "administrador",
  "mantenimiento",
  "iva",
  "otro",
];
const expenseSources: readonly ExpenseSource[] = ["manual", "iva"];
const spaceStatuses: readonly SpaceStatus[] = [
  "alquilado",
  "accionista",
  "disponible",
  "uso exclusivo",
];
const paymentMethods: readonly PaymentMethod[] = ["efectivo", "transferencia", "cheque"];

const knownSnapshotKeys = [
  "profile",
  "metrics",
  "spaces",
  "rentLedger",
  "expenses",
  "auditLog",
  "units",
  "collections",
  "incidents",
  "announcements",
  "agenda",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOwn(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function asText(value: unknown, fallback = ""): string {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number") {
    return String(value);
  }

  return fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const sanitized = value.replace(/[^\d.-]/g, "");
    const parsed = Number(sanitized);

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asChoice<T extends string>(
  value: unknown,
  choices: readonly T[],
  fallback: T,
): T {
  return choices.includes(value as T) ? (value as T) : fallback;
}

function recordEntries(value: unknown): Array<[string, Record<string, unknown>]> {
  if (Array.isArray(value)) {
    return value
      .map((item, index) => [String(index), item] as const)
      .filter((entry): entry is [string, Record<string, unknown>] => isRecord(entry[1]));
  }

  if (isRecord(value)) {
    return Object.entries(value).filter(
      (entry): entry is [string, Record<string, unknown>] => isRecord(entry[1]),
    );
  }

  return [];
}

function textValues(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => asText(item)).filter(Boolean);
  }

  if (isRecord(value)) {
    return Object.values(value).map((item) => asText(item)).filter(Boolean);
  }

  return [];
}

function looksLikeSnapshot(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && knownSnapshotKeys.some((key) => hasOwn(value, key));
}

function pickSnapshotCandidate(raw: unknown): Record<string, unknown> | null {
  if (looksLikeSnapshot(raw)) {
    return raw;
  }

  if (!isRecord(raw)) {
    return null;
  }

  for (const key of ["dashboard", "buildingSnapshot", "snapshot"]) {
    const candidate = raw[key];

    if (looksLikeSnapshot(candidate)) {
      return candidate;
    }
  }

  return null;
}

function normalizeProfile(value: unknown): BuildingProfile {
  const fallback = demoSnapshot.profile;
  const candidate = isRecord(value) ? value : {};

  return {
    name: asText(candidate.name, fallback.name),
    address: asText(candidate.address, fallback.address),
    neighborhood: asText(candidate.neighborhood, fallback.neighborhood),
    manager: asText(candidate.manager, fallback.manager),
    currentPeriod: asText(candidate.currentPeriod, fallback.currentPeriod),
    collectionGoal: asText(candidate.collectionGoal, fallback.collectionGoal),
  };
}

function normalizeMetrics(value: unknown): DashboardMetric[] {
  return recordEntries(value).map(([key, item], index) => {
    const fallback = demoSnapshot.metrics[index] ?? demoSnapshot.metrics[0];

    return {
      label: asText(item.label, fallback?.label ?? key),
      value: asText(item.value, fallback?.value ?? "-"),
      hint: asText(item.hint, fallback?.hint ?? ""),
      tone: asChoice(item.tone, metricTones, fallback?.tone ?? "ink"),
    };
  });
}

function normalizeUnits(value: unknown): UnitRecord[] {
  return recordEntries(value).map(([key, item]) => ({
    id: asText(item.id, key),
    resident: asText(item.resident, "Sin residente"),
    floor: asText(item.floor, "Sin piso"),
    area: asText(item.area, "-"),
    balance: asText(item.balance, "Gs. 0"),
    lastPayment: asText(item.lastPayment, "-"),
    state: asChoice(item.state, unitStates, "disponible"),
    notes: asText(item.notes, ""),
  }));
}

function normalizeCollections(value: unknown): CollectionRecord[] {
  return recordEntries(value).map(([key, item]) => ({
    resident: asText(item.resident, key),
    concept: asText(item.concept, "Concepto pendiente"),
    amount: asText(item.amount, "Gs. 0"),
    dueDate: asText(item.dueDate, "-"),
    state: asChoice(item.state, collectionStates, "pendiente"),
  }));
}

function normalizeIncidents(value: unknown): IncidentRecord[] {
  return recordEntries(value).map(([key, item]) => ({
    title: asText(item.title, key),
    zone: asText(item.zone, "Zona pendiente"),
    priority: asChoice(item.priority, incidentPriorities, "media"),
    status: asChoice(item.status, incidentStatuses, "abierta"),
    updatedAt: asText(item.updatedAt, "-"),
  }));
}

function normalizeAnnouncements(value: unknown): AnnouncementRecord[] {
  return recordEntries(value).map(([key, item]) => ({
    title: asText(item.title, key),
    summary: asText(item.summary, ""),
    audience: asText(item.audience, "Todo el edificio"),
  }));
}

function normalizePaymentResponsible(
  value: unknown,
  fallback?: PaymentResponsible,
): PaymentResponsible {
  const candidate = isRecord(value) ? value : {};

  return {
    displayName: asText(candidate.displayName, fallback?.displayName ?? ""),
    firstName: asText(candidate.firstName, fallback?.firstName ?? ""),
    lastName: asText(candidate.lastName, fallback?.lastName ?? ""),
    documentId: asText(candidate.documentId, fallback?.documentId ?? ""),
    taxId: asText(candidate.taxId, fallback?.taxId ?? ""),
    nis: asText(candidate.nis, fallback?.nis ?? ""),
    meterNumber: asText(candidate.meterNumber, fallback?.meterNumber ?? ""),
  };
}

function normalizeAdditionalOccupants(
  value: unknown,
  fallback: PersonRecord[],
): PersonRecord[] {
  const normalized = recordEntries(value).map(([key, item], index) => ({
    id: asText(item.id, `${key}-${index}`),
    firstName: asText(item.firstName, ""),
    lastName: asText(item.lastName, ""),
    documentId: asText(item.documentId, ""),
  }));

  return normalized.length > 0 ? normalized : fallback;
}

function normalizeSpaces(value: unknown): BuildingSpace[] {
  return sortSpaces(
    recordEntries(value).map(([key, item], index) => {
      const fallback =
        demoSnapshot.spaces.find((space) => space.id === key || space.code === key) ??
        demoSnapshot.spaces[index] ??
        demoSnapshot.spaces[0];

      return {
        id: asText(item.id, fallback?.id ?? key),
        code: asText(item.code, fallback?.code ?? key),
        displayName: asText(item.displayName, fallback?.displayName ?? key),
        alias: asText(item.alias, fallback?.alias ?? ""),
        type: asChoice(item.type, spaceTypes, fallback?.type ?? "departamento"),
        status: asChoice(item.status, spaceStatuses, fallback?.status ?? "disponible"),
        level: asText(item.level, fallback?.level ?? "Sin nivel"),
        zone: asText(item.zone, fallback?.zone ?? ""),
        rentable: asBoolean(item.rentable, fallback?.rentable ?? true),
        sortOrder: asNumber(item.sortOrder, fallback?.sortOrder ?? index),
        monthlyRent: asNumber(item.monthlyRent, fallback?.monthlyRent ?? 0),
        hasParking: asBoolean(item.hasParking, fallback?.hasParking ?? false),
        parkingFee: asNumber(item.parkingFee, fallback?.parkingFee ?? 0),
        dueDay: asText(item.dueDay, fallback?.dueDay ?? ""),
        nextDueDate: asText(item.nextDueDate, fallback?.nextDueDate ?? ""),
        lastPaidPeriod: asText(item.lastPaidPeriod, fallback?.lastPaidPeriod ?? ""),
        paymentResponsible: normalizePaymentResponsible(
          item.paymentResponsible,
          fallback?.paymentResponsible,
        ),
        additionalOccupants: normalizeAdditionalOccupants(
          item.additionalOccupants,
          fallback?.additionalOccupants ?? [],
        ),
        notes: asText(item.notes, fallback?.notes ?? ""),
      };
    }),
  );
}

function normalizeRentLedger(value: unknown): RentLedgerRecord[] {
  return recordEntries(value).map(([key, item]) => ({
    id: asText(item.id, key),
    spaceId: asText(item.spaceId, key.split("__")[0] ?? ""),
    period: asText(item.period, ""),
    chargeAmount: asNumber(item.chargeAmount, asNumber(item.amount, 0)),
    dueDate: asText(item.dueDate, ""),
    paidAt: asText(item.paidAt, ""),
    paymentMethod: asChoice(item.paymentMethod, paymentMethods, ""),
    receivedAmount: asNumber(item.receivedAmount, 0),
    taxExpenseAmount: asNumber(item.taxExpenseAmount, 0),
    notes: asText(item.notes, ""),
    createdAt: asText(item.createdAt, ""),
    updatedAt: asText(item.updatedAt, ""),
  }));
}

function normalizeExpenses(value: unknown): ExpenseRecord[] {
  return recordEntries(value).map(([key, item]) => ({
    id: asText(item.id, key),
    period: asText(item.period, ""),
    source: asChoice(item.source, expenseSources, "manual"),
    category: asChoice(item.category, expenseCategories, "otro"),
    title: asText(item.title, "Gasto sin nombre"),
    amount: asNumber(item.amount, 0),
    dueDate: asText(item.dueDate, ""),
    paidAt: asText(item.paidAt, ""),
    linkedRentId: asText(item.linkedRentId, ""),
    linkedSpaceId: asText(item.linkedSpaceId, ""),
    notes: asText(item.notes, ""),
    createdAt: asText(item.createdAt, ""),
    updatedAt: asText(item.updatedAt, ""),
  }));
}

function normalizeAuditLog(value: unknown): AuditLogRecord[] {
  return recordEntries(value).map(([key, item]) => ({
    id: asText(item.id, key),
    entityType: asChoice(item.entityType, ["space", "rent", "expense"] as const, "space"),
    entityId: asText(item.entityId, ""),
    spaceId: asText(item.spaceId, ""),
    actorUid: asText(item.actorUid, ""),
    actorEmail: asText(item.actorEmail, "Usuario sin email"),
    action: asText(item.action, "Actualizo datos"),
    summary: asText(item.summary, "realizo un cambio"),
    createdAt: asText(item.createdAt, ""),
  }));
}

export function resolveBuildingSnapshot(raw: unknown): ResolvedSnapshot {
  const candidate = pickSnapshotCandidate(raw);

  if (!candidate) {
    return {
      snapshot: demoSnapshot,
      source: "demo",
      message: "No se encontro un snapshot compatible en Firebase. Se muestra el panel demo.",
    };
  }

  const spaces = hasOwn(candidate, "spaces") ? normalizeSpaces(candidate.spaces) : demoSnapshot.spaces;
  const hasFirebaseSpaces = spaces.length > 0;

  const snapshot: BuildingSnapshot = {
    profile: hasOwn(candidate, "profile")
      ? normalizeProfile(candidate.profile)
      : demoSnapshot.profile,
    metrics:
      hasFirebaseSpaces && hasOwn(candidate, "spaces")
        ? buildMetricsFromSpaces(spaces)
        : hasOwn(candidate, "metrics")
          ? normalizeMetrics(candidate.metrics)
          : demoSnapshot.metrics,
    spaces,
    rentLedger: hasOwn(candidate, "rentLedger")
      ? normalizeRentLedger(candidate.rentLedger)
      : demoSnapshot.rentLedger,
    expenses: hasOwn(candidate, "expenses")
      ? normalizeExpenses(candidate.expenses)
      : demoSnapshot.expenses,
    auditLog: hasOwn(candidate, "auditLog")
      ? normalizeAuditLog(candidate.auditLog)
      : demoSnapshot.auditLog,
    units:
      hasFirebaseSpaces && hasOwn(candidate, "spaces")
        ? buildUnitsFromSpaces(spaces)
        : hasOwn(candidate, "units")
          ? normalizeUnits(candidate.units)
          : demoSnapshot.units,
    collections:
      hasFirebaseSpaces && hasOwn(candidate, "spaces")
        ? buildCollectionsFromSpaces(spaces)
        : hasOwn(candidate, "collections")
          ? normalizeCollections(candidate.collections)
          : demoSnapshot.collections,
    incidents: hasOwn(candidate, "incidents")
      ? normalizeIncidents(candidate.incidents)
      : demoSnapshot.incidents,
    announcements: hasOwn(candidate, "announcements")
      ? normalizeAnnouncements(candidate.announcements)
      : demoSnapshot.announcements,
    agenda: hasOwn(candidate, "agenda") ? textValues(candidate.agenda) : demoSnapshot.agenda,
  };

  return {
    snapshot,
    source: hasOwn(candidate, "spaces") ? "firebase" : "demo",
    message: hasOwn(candidate, "spaces")
      ? "Datos sincronizados en tiempo real desde Firebase."
      : "Firebase no tiene aun la estructura de espacios cargada. Se muestra la base demo.",
  };
}
