import { formatGs, formatResponsibleName } from "./buildingManagement";
import type {
  BuildingSpace,
  DashboardMetric,
  RentLedgerRecord,
  RentPaymentStatus,
} from "../types/building";

const MONTH_LABELS = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
] as const;

export interface RentBoardRecord {
  id: string;
  spaceId: string;
  spaceName: string;
  spaceCode: string;
  spaceLevel: string;
  spaceType: BuildingSpace["type"];
  residentName: string;
  chargeAmount: number;
  receivedAmount: number;
  taxExpenseAmount: number;
  dueDate: string;
  paidAt: string;
  notes: string;
  period: string;
  status: RentPaymentStatus;
  statusLabel: string;
  dueText: string;
  isPaid: boolean;
  isOverdue: boolean;
  isDueSoon: boolean;
  needsDueDate: boolean;
  space: BuildingSpace;
}

function padNumber(value: number): string {
  return String(value).padStart(2, "0");
}

function toDateOnly(value: Date): string {
  return `${value.getFullYear()}-${padNumber(value.getMonth() + 1)}-${padNumber(value.getDate())}`;
}

function toPeriod(value: Date): string {
  return `${value.getFullYear()}-${padNumber(value.getMonth() + 1)}`;
}

function startOfMonth(period: string): Date {
  const [year, month] = period.split("-").map(Number);
  return new Date(year, (month || 1) - 1, 1);
}

export function calculateBuildingTaxExpenseAmount(chargeAmount: number, paidAt: string): number {
  if (!paidAt.trim()) {
    return 0;
  }

  const grossAmount = Math.max(0, chargeAmount);
  const taxableBase = grossAmount / 1.05;
  const taxAmount = grossAmount - taxableBase;

  return Math.round(taxAmount * 100) / 100;
}

export function createLedgerId(spaceId: string, period: string): string {
  return `${spaceId}__${period}`;
}

export function getCurrentPeriod(referenceDate = new Date()): string {
  return toPeriod(referenceDate);
}

export function formatPeriodLabel(period: string): string {
  const [yearText, monthText] = period.split("-");
  const year = Number(yearText);
  const month = Number(monthText);

  if (!year || !month || month < 1 || month > 12) {
    return period;
  }

  return `${MONTH_LABELS[month - 1]} ${year}`;
}

export function createPeriodOptions(referenceDate = new Date(), total = 8): string[] {
  const base = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1);
  const periods: string[] = [];

  for (let offset = -2; offset <= total - 3; offset += 1) {
    const point = new Date(base.getFullYear(), base.getMonth() + offset, 1);
    periods.push(toPeriod(point));
  }

  return periods;
}

export function deriveDueDateForPeriod(space: BuildingSpace, period: string): string {
  const trimmedNextDueDate = space.nextDueDate.trim();

  if (trimmedNextDueDate.startsWith(`${period}-`)) {
    return trimmedNextDueDate;
  }

  const dueDay = Number(space.dueDay);

  if (!Number.isFinite(dueDay) || dueDay < 1 || dueDay > 31) {
    return "";
  }

  const monthStart = startOfMonth(period);
  const lastDay = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate();
  const safeDay = Math.min(dueDay, lastDay);

  return `${period}-${padNumber(safeDay)}`;
}

function getStatusForRecord(
  period: string,
  dueDate: string,
  paidAt: string,
  referenceDate: Date,
): RentPaymentStatus {
  if (paidAt.trim()) {
    return "pagado";
  }

  if (!dueDate.trim()) {
    return "sin vencimiento";
  }

  const currentPeriod = toPeriod(referenceDate);

  if (period < currentPeriod) {
    return "vencido";
  }

  if (period > currentPeriod) {
    return "pendiente";
  }

  const today = toDateOnly(referenceDate);

  if (dueDate < today) {
    return "vencido";
  }

  const due = new Date(`${dueDate}T00:00:00`);
  const diffMs = due.getTime() - referenceDate.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays <= 5) {
    return "por vencer";
  }

  return "pendiente";
}

export function buildRentBoardRecords(
  spaces: BuildingSpace[],
  ledgerRecords: RentLedgerRecord[],
  period: string,
  referenceDate = new Date(),
): RentBoardRecord[] {
  const ledgerById = new Map(ledgerRecords.map((item) => [item.id, item]));

  return spaces
    .filter((space) => space.status === "alquilado" && space.monthlyRent > 0)
    .map((space) => {
      const id = createLedgerId(space.id, period);
      const existing = ledgerById.get(id);
      const dueDate = existing?.dueDate.trim() || deriveDueDateForPeriod(space, period);
      const paidAt = existing?.paidAt.trim() || "";
      const status = getStatusForRecord(period, dueDate, paidAt, referenceDate);
      const chargeAmount = existing?.chargeAmount ?? space.monthlyRent;
      const receivedAmount =
        existing && existing.receivedAmount > 0 ? existing.receivedAmount : existing?.chargeAmount ?? 0;
      const taxExpenseAmount = calculateBuildingTaxExpenseAmount(chargeAmount, paidAt);

      return {
        id,
        spaceId: space.id,
        spaceName: space.displayName,
        spaceCode: space.code,
        spaceLevel: space.level,
        spaceType: space.type,
        residentName: formatResponsibleName(space.paymentResponsible),
        chargeAmount,
        receivedAmount,
        taxExpenseAmount,
        dueDate,
        paidAt,
        notes: existing?.notes ?? "",
        period,
        status,
        statusLabel: status,
        dueText: dueDate ? dueDate : "Sin vencimiento cargado",
        isPaid: status === "pagado",
        isOverdue: status === "vencido",
        isDueSoon: status === "por vencer",
        needsDueDate: !dueDate,
        space,
      };
    });
}

export function buildRentMetrics(records: RentBoardRecord[]): DashboardMetric[] {
  const totalCharged = records.reduce((sum, item) => sum + item.chargeAmount, 0);
  const paidCount = records.filter((item) => item.isPaid).length;
  const totalCollected = records
    .filter((item) => item.isPaid)
    .reduce((sum, item) => sum + (item.receivedAmount || item.chargeAmount), 0);
  const totalTaxExpense = records.reduce((sum, item) => sum + item.taxExpenseAmount, 0);
  const pendingCount = records.filter(
    (item) => item.status === "pendiente" || item.status === "vencido" || item.status === "por vencer",
  ).length;
  const dueSoonCount = records.filter((item) => item.status === "por vencer").length;
  const overdueCount = records.filter((item) => item.status === "vencido").length;
  const missingDueDateCount = records.filter((item) => item.status === "sin vencimiento").length;

  return [
    {
      label: "A cobrar",
      value: formatGs(totalCharged),
      hint: `${records.length} activos`,
      tone: "sun",
    },
    {
      label: "Cobrado",
      value: formatGs(totalCollected),
      hint: `${paidCount} pagos`,
      tone: "mint",
    },
    {
      label: "Pendientes",
      value: `${pendingCount}`,
      hint: `${overdueCount} vencidos · ${dueSoonCount} por vencer`,
      tone: "clay",
    },
    {
      label: "Sin vencimiento",
      value: `${missingDueDateCount}`,
      hint: `${missingDueDateCount} sin fecha`,
      tone: "ink",
    },
  ];
}

export function buildQuickPaymentRecord(
  space: BuildingSpace,
  period: string,
  referenceDate = new Date(),
): RentLedgerRecord {
  const today = toDateOnly(referenceDate);

  return {
    id: createLedgerId(space.id, period),
    spaceId: space.id,
    period,
    chargeAmount: space.monthlyRent,
    dueDate: deriveDueDateForPeriod(space, period),
    paidAt: today,
    paymentMethod: "",
    receivedAmount: space.monthlyRent,
    taxExpenseAmount: calculateBuildingTaxExpenseAmount(space.monthlyRent, today),
    notes: "",
    createdAt: today,
    updatedAt: today,
  };
}
