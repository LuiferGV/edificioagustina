import type { User } from "firebase/auth";
import { spacesToRecord } from "./buildingManagement";
import { resolveBuildingSnapshot } from "./buildingSnapshot";
import type {
  AuditLogRecord,
  BuildingSnapshot,
  BuildingSpace,
  CollectionRecord,
  DashboardMetric,
  ExpenseRecord,
  IncidentRecord,
  UnitRecord,
} from "../types/building";

export type BackupTrigger = "auto-daily" | "manual" | "pre-restore";

export interface BackupSnapshotPayload {
  profile: BuildingSnapshot["profile"];
  metrics: DashboardMetric[];
  spaces: Record<string, BuildingSpace>;
  rentLedger: Record<string, BuildingSnapshot["rentLedger"][number]>;
  expenses: Record<string, ExpenseRecord>;
  auditLog: Record<string, AuditLogRecord>;
  units: UnitRecord[];
  collections: CollectionRecord[];
  incidents: IncidentRecord[];
  announcements: BuildingSnapshot["announcements"];
  agenda: string[];
}

export interface StoredBackupRecord {
  id: string;
  createdAt: string;
  dateKey: string;
  trigger: BackupTrigger;
  actorUid: string;
  actorEmail: string;
  note: string;
  snapshot: BackupSnapshotPayload;
}

export interface BackupRecord extends Omit<StoredBackupRecord, "snapshot"> {
  snapshot: BuildingSnapshot;
}

const backupTriggers: readonly BackupTrigger[] = ["auto-daily", "manual", "pre-restore"];

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

function asChoice<T extends string>(value: unknown, choices: readonly T[], fallback: T): T {
  return choices.includes(value as T) ? (value as T) : fallback;
}

function recordEntries(value: unknown): Array<[string, Record<string, unknown>]> {
  if (!isRecord(value)) {
    return [];
  }

  return Object.entries(value).filter(
    (entry): entry is [string, Record<string, unknown>] => isRecord(entry[1]),
  );
}

function recordById<T extends { id: string }>(items: T[]): Record<string, T> {
  return items.reduce<Record<string, T>>((accumulator, item) => {
    accumulator[item.id] = item;
    return accumulator;
  }, {});
}

function padNumber(value: number): string {
  return String(value).padStart(2, "0");
}

export function getBackupDateKey(referenceDate = new Date()): string {
  return `${referenceDate.getFullYear()}-${padNumber(referenceDate.getMonth() + 1)}-${padNumber(referenceDate.getDate())}`;
}

export function createBackupId(referenceDate = new Date()): string {
  return `backup-${referenceDate.getTime()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function getBackupTriggerLabel(trigger: BackupTrigger): string {
  if (trigger === "auto-daily") {
    return "Automatico diario";
  }

  if (trigger === "pre-restore") {
    return "Previo a restauracion";
  }

  return "Manual";
}

export function buildBackupPayload(snapshot: BuildingSnapshot): BackupSnapshotPayload {
  return {
    profile: snapshot.profile,
    metrics: snapshot.metrics,
    spaces: spacesToRecord(snapshot.spaces),
    rentLedger: recordById(snapshot.rentLedger),
    expenses: recordById(snapshot.expenses),
    auditLog: recordById(snapshot.auditLog),
    units: snapshot.units,
    collections: snapshot.collections,
    incidents: snapshot.incidents,
    announcements: snapshot.announcements,
    agenda: snapshot.agenda,
  };
}

export function createStoredBackupRecord(input: {
  actor: User | null;
  note: string;
  snapshot: BuildingSnapshot;
  trigger: BackupTrigger;
  referenceDate?: Date;
}): StoredBackupRecord {
  const referenceDate = input.referenceDate ?? new Date();

  return {
    id: createBackupId(referenceDate),
    createdAt: referenceDate.toISOString(),
    dateKey: getBackupDateKey(referenceDate),
    trigger: input.trigger,
    actorUid: input.actor?.uid ?? "",
    actorEmail: input.actor?.email ?? "Usuario sin email",
    note: input.note,
    snapshot: buildBackupPayload(input.snapshot),
  };
}

export function parseBackupRecords(raw: unknown): BackupRecord[] {
  if (!isRecord(raw) || !hasOwn(raw, "backups")) {
    return [];
  }

  return recordEntries(raw.backups)
    .map(([key, item]) => {
      const resolved = resolveBuildingSnapshot(item.snapshot);

      return {
        id: asText(item.id, key),
        createdAt: asText(item.createdAt, ""),
        dateKey: asText(item.dateKey, ""),
        trigger: asChoice(item.trigger, backupTriggers, "manual"),
        actorUid: asText(item.actorUid, ""),
        actorEmail: asText(item.actorEmail, "Usuario sin email"),
        note: asText(item.note, ""),
        snapshot: resolved.snapshot,
      };
    })
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}
