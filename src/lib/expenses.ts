import { formatGs } from "./buildingManagement";
import { calculateBuildingTaxExpenseAmount, formatPeriodLabel } from "./rentLedger";
import type {
  BuildingSpace,
  DashboardMetric,
  ExpenseCategory,
  ExpenseRecord,
  ExpenseSource,
  ExpenseStatus,
  RentLedgerRecord,
} from "../types/building";

export interface ExpenseBoardRecord {
  id: string;
  auditEntityId: string;
  period: string;
  source: ExpenseSource;
  sourceLabel: string;
  category: ExpenseCategory;
  categoryLabel: string;
  title: string;
  amount: number;
  dueDate: string;
  paidAt: string;
  status: ExpenseStatus;
  statusLabel: ExpenseStatus;
  notes: string;
  linkedSpaceName: string;
  createdAt: string;
  updatedAt: string;
}

const categoryLabels: Record<ExpenseCategory, string> = {
  limpieza: "Limpieza",
  luz: "Luz",
  contador: "Contador",
  administrador: "Administrador",
  mantenimiento: "Mantenimiento",
  iva: "IVA",
  otro: "Otro",
};

export function createExpenseId(referenceDate = new Date()): string {
  return `expense-${referenceDate.getTime()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function formatExpenseCategoryLabel(category: ExpenseCategory): string {
  return categoryLabels[category] ?? "Otro";
}

function resolveExpenseStatus(record: { paidAt: string }): ExpenseStatus {
  return record.paidAt.trim() ? "pagado" : "pendiente";
}

function mapManualExpense(expense: ExpenseRecord): ExpenseBoardRecord {
  const status = resolveExpenseStatus(expense);

  return {
    id: expense.id,
    auditEntityId: expense.id,
    period: expense.period,
    source: expense.source,
    sourceLabel: "Manual",
    category: expense.category,
    categoryLabel: formatExpenseCategoryLabel(expense.category),
    title: expense.title,
    amount: expense.amount,
    dueDate: expense.dueDate,
    paidAt: expense.paidAt,
    status,
    statusLabel: status,
    notes: expense.notes,
    linkedSpaceName: "",
    createdAt: expense.createdAt,
    updatedAt: expense.updatedAt,
  };
}

function mapTaxExpense(
  entry: RentLedgerRecord,
  spaceById: Map<string, BuildingSpace>,
): ExpenseBoardRecord | null {
  if (!entry.paidAt.trim()) {
    return null;
  }

  const amount =
    calculateBuildingTaxExpenseAmount(entry.chargeAmount, entry.paidAt);

  if (amount <= 0) {
    return null;
  }

  const linkedSpace = spaceById.get(entry.spaceId);
  const title = linkedSpace
    ? `IVA por cobro de ${linkedSpace.displayName}`
    : `IVA por cobro ${formatPeriodLabel(entry.period)}`;

  return {
    id: `iva-${entry.id}`,
    auditEntityId: entry.id,
    period: entry.period,
    source: "iva",
    sourceLabel: "IVA automatico",
    category: "iva",
    categoryLabel: "IVA",
    title,
    amount,
    dueDate: entry.paidAt,
    paidAt: entry.paidAt,
    status: "pagado",
    statusLabel: "pagado",
    notes: linkedSpace
      ? `Generado automaticamente al registrar el pago de ${linkedSpace.displayName}.`
      : "Generado automaticamente por un alquiler cobrado.",
    linkedSpaceName: linkedSpace?.displayName ?? "",
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  };
}

function sortExpenseRecords(left: ExpenseBoardRecord, right: ExpenseBoardRecord): number {
  if (left.status !== right.status) {
    return left.status === "pendiente" ? -1 : 1;
  }

  const leftDate = left.paidAt || left.dueDate || left.updatedAt || left.createdAt;
  const rightDate = right.paidAt || right.dueDate || right.updatedAt || right.createdAt;

  return rightDate.localeCompare(leftDate) || left.title.localeCompare(right.title);
}

export function buildExpenseBoardRecords(
  expenses: ExpenseRecord[],
  rentLedger: RentLedgerRecord[],
  spaces: BuildingSpace[],
  period: string,
): ExpenseBoardRecord[] {
  const spaceById = new Map(spaces.map((space) => [space.id, space]));
  const manualRecords = expenses.filter((expense) => expense.period === period).map(mapManualExpense);
  const taxRecords = rentLedger
    .filter((entry) => entry.period === period)
    .map((entry) => mapTaxExpense(entry, spaceById))
    .filter((entry): entry is ExpenseBoardRecord => Boolean(entry));

  return [...manualRecords, ...taxRecords].sort(sortExpenseRecords);
}

export function buildExpenseMetrics(records: ExpenseBoardRecord[]): DashboardMetric[] {
  const totalAmount = records.reduce((sum, item) => sum + item.amount, 0);
  const paidCount = records.filter((item) => item.status === "pagado").length;
  const totalPaid = records
    .filter((item) => item.status === "pagado")
    .reduce((sum, item) => sum + item.amount, 0);
  const pendingCount = records.filter((item) => item.status === "pendiente").length;
  const totalPending = records
    .filter((item) => item.status === "pendiente")
    .reduce((sum, item) => sum + item.amount, 0);
  const taxCount = records.filter((item) => item.source === "iva").length;
  const totalTax = records
    .filter((item) => item.source === "iva")
    .reduce((sum, item) => sum + item.amount, 0);

  return [
    {
      label: "Gastos del mes",
      value: formatGs(totalAmount, { maximumFractionDigits: 2 }),
      hint: `${records.length} movimientos`,
      tone: "clay",
    },
    {
      label: "Pagados",
      value: formatGs(totalPaid, { maximumFractionDigits: 2 }),
      hint: `${paidCount} cubiertos`,
      tone: "mint",
    },
    {
      label: "Pendientes",
      value: formatGs(totalPending, { maximumFractionDigits: 2 }),
      hint: `${pendingCount} por pagar`,
      tone: "sun",
    },
    {
      label: "IVA generado",
      value: formatGs(totalTax, { maximumFractionDigits: 2 }),
      hint: `${taxCount} automaticos`,
      tone: "ink",
    },
  ];
}
