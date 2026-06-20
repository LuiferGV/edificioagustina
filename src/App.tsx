import { FirebaseError } from "firebase/app";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from "firebase/auth";
import { onValue, ref, update } from "firebase/database";
import {
  startTransition,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useState,
  type FormEvent,
  type MouseEvent,
} from "react";
import { AppSelect } from "./components/AppSelect";
import { AuthPanel } from "./components/AuthPanel";
import { BrandLogo } from "./components/BrandLogo";
import { SpaceCard } from "./components/SpaceCard";
import { StatusPill } from "./components/StatusPill";
import { SummaryCard } from "./components/SummaryCard";
import { buildingSnapshot as demoSnapshot } from "./data/mockBuilding";
import {
  formatGs,
  formatResponsibleName,
  getSpaceStatusLabel,
  groupSpacesByLevel,
  isNotForRent,
  spacesToRecord,
} from "./lib/buildingManagement";
import {
  buildExpenseAuditSummary,
  buildRentAuditSummary,
  buildSpaceAuditSummary,
  createAuditEntry,
  formatAuditLine,
} from "./lib/auditTrail";
import { resolveBuildingSnapshot } from "./lib/buildingSnapshot";
import {
  buildExpenseBoardRecords,
  buildExpenseMetrics,
  createExpenseId,
  type ExpenseBoardRecord,
} from "./lib/expenses";
import { auth, database } from "./lib/firebase";
import {
  buildRentBoardRecords,
  buildRentMetrics,
  calculateBuildingTaxExpenseAmount,
  createLedgerId,
  createPeriodOptions,
  deriveDueDateForPeriod,
  formatPeriodLabel,
  getCurrentPeriod,
  type RentBoardRecord,
} from "./lib/rentLedger";
import type {
  AuditLogRecord,
  BuildingSpace,
  ExpenseCategory,
  ExpenseRecord,
  PaymentMethod,
  PersonRecord,
  RentLedgerRecord,
  SpaceStatus,
  ViewKey,
} from "./types/building";

interface OccupantDraft {
  id: string;
  firstName: string;
  lastName: string;
  documentId: string;
}

interface SpaceFormState {
  status: SpaceStatus;
  monthlyRent: string;
  hasParking: boolean;
  parkingFee: string;
  dueDay: string;
  nextDueDate: string;
  payerDisplayName: string;
  payerFirstName: string;
  payerLastName: string;
  payerDocumentId: string;
  payerTaxId: string;
  payerNis: string;
  payerMeterNumber: string;
  additionalOccupants: OccupantDraft[];
  notes: string;
}

interface PaymentFormState {
  spaceId: string;
  period: string;
  chargeAmount: string;
  dueDate: string;
  paidAt: string;
  paymentMethod: PaymentMethod | "";
  receivedAmount: string;
  notes: string;
}

interface ExpenseFormState {
  period: string;
  category: ExpenseCategory;
  title: string;
  amount: string;
  dueDate: string;
  paidAt: string;
  notes: string;
}

type MessageTone = "" | "error" | "success";
type ChargeFilter = "todos" | "pendientes" | "por vencer" | "vencidos" | "pagados";
type ExpenseFilter = "todos" | "pendientes" | "pagados" | "manuales" | "iva";
type RentMetricCardKey = "total" | "paid" | "pending" | "missingDue";
type ExpenseMetricCardKey = "total" | "paid" | "pending" | "tax";

const views: Array<{ key: ViewKey; label: string }> = [
  { key: "inicio", label: "Inicio" },
  { key: "mapa", label: "Mapa" },
  { key: "cobranzas", label: "Cobranzas" },
  { key: "gastos", label: "Gastos" },
  { key: "inquilinos", label: "Inquilinos" },
];

const chargeFilters: Array<{ key: ChargeFilter; label: string }> = [
  { key: "todos", label: "Todos" },
  { key: "pendientes", label: "Pendientes" },
  { key: "por vencer", label: "Por vencer" },
  { key: "vencidos", label: "Vencidos" },
  { key: "pagados", label: "Pagados" },
];

const expenseFilters: Array<{ key: ExpenseFilter; label: string }> = [
  { key: "todos", label: "Todos" },
  { key: "pendientes", label: "Pendientes" },
  { key: "pagados", label: "Pagados" },
  { key: "manuales", label: "Manuales" },
  { key: "iva", label: "IVA" },
];

const expenseCategoryOptions: Array<{ value: ExpenseCategory; label: string }> = [
  { value: "limpieza", label: "Limpieza" },
  { value: "luz", label: "Luz" },
  { value: "contador", label: "Contador" },
  { value: "administrador", label: "Administrador" },
  { value: "mantenimiento", label: "Mantenimiento" },
  { value: "otro", label: "Otro" },
];

const paymentMethodOptions: Array<{ value: PaymentMethod; label: string }> = [
  { value: "efectivo", label: "Efectivo" },
  { value: "transferencia", label: "Transferencia" },
  { value: "cheque", label: "Cheque" },
];

const rentMetricCardOrder: RentMetricCardKey[] = ["total", "paid", "pending", "missingDue"];
const expenseMetricCardOrder: ExpenseMetricCardKey[] = ["total", "paid", "pending", "tax"];

function padNumber(value: number): string {
  return String(value).padStart(2, "0");
}

function formatDateForStorage(referenceDate = new Date()): string {
  return `${referenceDate.getFullYear()}-${padNumber(referenceDate.getMonth() + 1)}-${padNumber(
    referenceDate.getDate(),
  )}`;
}

function getAuthMessage(error: unknown): string {
  if (!(error instanceof FirebaseError)) {
    return "No se pudo iniciar sesion. Intenta nuevamente.";
  }

  const messages: Record<string, string> = {
    "auth/invalid-email": "El email no tiene un formato valido.",
    "auth/invalid-credential": "El email o la contrasena no coinciden.",
    "auth/missing-password": "Ingresa tu contrasena para continuar.",
    "auth/too-many-requests": "El acceso fue bloqueado temporalmente por muchos intentos.",
    "auth/network-request-failed": "No se pudo conectar. Revisa tu conexion.",
  };

  return messages[error.code] ?? "No se pudo iniciar sesion en este momento.";
}

function createOccupantDraft(): OccupantDraft {
  return {
    id: `occupant-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    firstName: "",
    lastName: "",
    documentId: "",
  };
}

function createFormState(space: BuildingSpace): SpaceFormState {
  return {
    status: space.status,
    monthlyRent: String(space.monthlyRent || 0),
    hasParking: space.hasParking,
    parkingFee: String(space.parkingFee || 0),
    dueDay: space.dueDay,
    nextDueDate: space.nextDueDate,
    payerDisplayName: space.paymentResponsible.displayName,
    payerFirstName: space.paymentResponsible.firstName,
    payerLastName: space.paymentResponsible.lastName,
    payerDocumentId: space.paymentResponsible.documentId,
    payerTaxId: space.paymentResponsible.taxId,
    payerNis: space.paymentResponsible.nis,
    payerMeterNumber: space.paymentResponsible.meterNumber,
    additionalOccupants: space.additionalOccupants.map((occupant) => ({
      id: occupant.id,
      firstName: occupant.firstName,
      lastName: occupant.lastName,
      documentId: occupant.documentId,
    })),
    notes: space.notes,
  };
}

function buildResponsibleLabel(formState: SpaceFormState): string {
  const joinedName = `${formState.payerFirstName} ${formState.payerLastName}`.trim();
  return formState.payerDisplayName.trim() || joinedName;
}

function parsePositiveWholeNumber(value: string): number {
  const sanitized = value.replace(/[^\d]/g, "");
  return sanitized ? Number(sanitized) : 0;
}

function serializeSpace(baseSpace: BuildingSpace, formState: SpaceFormState): BuildingSpace {
  const normalizedOccupants: PersonRecord[] = formState.additionalOccupants
    .map((occupant) => ({
      id: occupant.id,
      firstName: occupant.firstName.trim(),
      lastName: occupant.lastName.trim(),
      documentId: occupant.documentId.trim(),
    }))
    .filter(
      (occupant) =>
        occupant.firstName.length > 0 ||
        occupant.lastName.length > 0 ||
        occupant.documentId.length > 0,
    );

  const monthlyRent =
    formState.status === "accionista" || formState.status === "uso exclusivo"
      ? 0
      : parsePositiveWholeNumber(formState.monthlyRent);
  const hasParking = formState.status === "alquilado" ? formState.hasParking : false;
  const parkingFee = hasParking ? parsePositiveWholeNumber(formState.parkingFee) : 0;

  return {
    ...baseSpace,
    status: formState.status,
    monthlyRent,
    hasParking,
    parkingFee,
    dueDay: formState.dueDay.trim(),
    nextDueDate: formState.nextDueDate,
    paymentResponsible: {
      displayName: formState.payerDisplayName.trim(),
      firstName: formState.payerFirstName.trim(),
      lastName: formState.payerLastName.trim(),
      documentId: formState.payerDocumentId.trim(),
      taxId: formState.payerTaxId.trim(),
      nis: formState.payerNis.trim(),
      meterNumber: formState.payerMeterNumber.trim(),
    },
    additionalOccupants: normalizedOccupants,
    notes: formState.notes.trim(),
  };
}

function clearTenantAssignment(baseSpace: BuildingSpace): BuildingSpace {
  return {
    ...baseSpace,
    status: "disponible",
    monthlyRent: 0,
    hasParking: false,
    parkingFee: 0,
    dueDay: "",
    nextDueDate: "",
    paymentResponsible: {
      displayName: "",
      firstName: "",
      lastName: "",
      documentId: "",
      taxId: "",
      nis: "",
      meterNumber: "",
    },
    additionalOccupants: [],
    notes: "",
  };
}

function ledgerToRecord(ledger: RentLedgerRecord[]): Record<string, RentLedgerRecord> {
  return ledger.reduce<Record<string, RentLedgerRecord>>((accumulator, item) => {
    accumulator[item.id] = item;
    return accumulator;
  }, {});
}

function expensesToRecord(expenses: ExpenseRecord[]): Record<string, ExpenseRecord> {
  return expenses.reduce<Record<string, ExpenseRecord>>((accumulator, item) => {
    accumulator[item.id] = item;
    return accumulator;
  }, {});
}

function auditToRecord(auditLog: AuditLogRecord[]): Record<string, AuditLogRecord> {
  return auditLog.reduce<Record<string, AuditLogRecord>>((accumulator, item) => {
    accumulator[item.id] = item;
    return accumulator;
  }, {});
}

function createInitialDatabasePayload() {
  return {
    profile: {
      ...demoSnapshot.profile,
      currentPeriod: formatPeriodLabel(getCurrentPeriod(new Date())),
    },
    spaces: spacesToRecord(demoSnapshot.spaces),
    rentLedger: ledgerToRecord(demoSnapshot.rentLedger),
    expenses: expensesToRecord(demoSnapshot.expenses),
    auditLog: auditToRecord(demoSnapshot.auditLog),
    metrics: demoSnapshot.metrics,
    units: demoSnapshot.units,
    collections: demoSnapshot.collections,
    incidents: demoSnapshot.incidents,
    announcements: demoSnapshot.announcements,
    agenda: demoSnapshot.agenda,
  };
}

function getSpaceSearchText(space: BuildingSpace): string {
  return [
    space.displayName,
    space.alias,
    space.code,
    space.level,
    space.zone,
    space.status,
    getSpaceStatusLabel(space),
    formatResponsibleName(space.paymentResponsible),
    space.paymentResponsible.documentId,
    space.paymentResponsible.taxId,
    space.paymentResponsible.nis,
    space.paymentResponsible.meterNumber,
    space.hasParking ? "estacionamiento" : "",
    String(space.parkingFee || 0),
    space.notes,
  ]
    .join(" ")
    .toLowerCase();
}

function getChargeSearchText(record: RentBoardRecord): string {
  return [
    record.spaceName,
    record.spaceLevel,
    record.residentName,
    record.status,
    record.notes,
    record.dueText,
  ]
    .join(" ")
    .toLowerCase();
}

function getExpenseSearchText(record: ExpenseBoardRecord): string {
  return [
    record.title,
    record.categoryLabel,
    record.sourceLabel,
    record.statusLabel,
    record.linkedSpaceName,
    record.notes,
  ]
    .join(" ")
    .toLowerCase();
}

function getSortedAuditLog(entries: AuditLogRecord[]): AuditLogRecord[] {
  return [...entries].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

function getToolbarSearchContent(
  activeView: ViewKey,
  chargeQuery: string,
  expenseQuery: string,
  spaceQuery: string,
  tenantQuery: string,
  onChargeChange: (value: string) => void,
  onExpenseChange: (value: string) => void,
  onSpaceChange: (value: string) => void,
  onTenantChange: (value: string) => void,
) {
  if (activeView === "gastos") {
    return {
      label: "Buscar",
      placeholder: "Ej.: luz, limpieza, IVA, contador",
      value: expenseQuery,
      onChange: onExpenseChange,
    };
  }

  if (activeView === "inquilinos") {
    return {
      label: "Buscar",
      placeholder: "Ej.: Gerardo, Salon 2, no se alquila",
      value: tenantQuery,
      onChange: onTenantChange,
    };
  }

  if (activeView === "mapa") {
    return {
      label: "Buscar",
      placeholder: "Ej.: Salon 4, Juan Perez, piso 2",
      value: spaceQuery,
      onChange: onSpaceChange,
    };
  }

  return {
    label: "Buscar",
    placeholder: "Ej.: Dto 2.3, Mario, vencido",
    value: chargeQuery,
    onChange: onChargeChange,
  };
}

function createPaymentFormState(
  space: BuildingSpace,
  period: string,
  existing?: RentLedgerRecord | null,
): PaymentFormState {
  const receivedAmount =
    existing && existing.receivedAmount > 0
      ? String(existing.receivedAmount)
      : existing?.paidAt
        ? String(existing.chargeAmount)
        : "0";

  return {
    spaceId: space.id,
    period,
    chargeAmount: String(existing?.chargeAmount ?? space.monthlyRent),
    dueDate: existing?.dueDate || deriveDueDateForPeriod(space, period),
    paidAt: existing?.paidAt ?? "",
    paymentMethod: existing?.paymentMethod ?? "",
    receivedAmount,
    notes: existing?.notes ?? "",
  };
}

function createExpenseFormState(period: string, existing?: ExpenseRecord | null): ExpenseFormState {
  return {
    period: existing?.period ?? period,
    category: existing?.category ?? "limpieza",
    title: existing?.title ?? "",
    amount: String(existing?.amount ?? 0),
    dueDate: existing?.dueDate ?? "",
    paidAt: existing?.paidAt ?? "",
    notes: existing?.notes ?? "",
  };
}

function serializePaymentForm(
  space: BuildingSpace,
  formState: PaymentFormState,
  existing?: RentLedgerRecord | null,
): RentLedgerRecord {
  const today = formatDateForStorage(new Date());
  const chargeAmount = parsePositiveWholeNumber(formState.chargeAmount);
  const paidAt = formState.paidAt.trim();
  const receivedAmount = paidAt
    ? parsePositiveWholeNumber(formState.receivedAmount) || chargeAmount
    : parsePositiveWholeNumber(formState.receivedAmount);
  const taxExpenseAmount = calculateBuildingTaxExpenseAmount(chargeAmount, paidAt);

  return {
    id: createLedgerId(space.id, formState.period),
    spaceId: space.id,
    period: formState.period,
    chargeAmount,
    dueDate: formState.dueDate.trim(),
    paidAt,
    paymentMethod: paidAt ? formState.paymentMethod : "",
    receivedAmount,
    taxExpenseAmount,
    notes: formState.notes.trim(),
    createdAt: existing?.createdAt || today,
    updatedAt: today,
  };
}

function serializeExpenseForm(
  formState: ExpenseFormState,
  existing?: ExpenseRecord | null,
): ExpenseRecord {
  const today = formatDateForStorage(new Date());

  return {
    id: existing?.id ?? createExpenseId(),
    period: formState.period,
    source: "manual",
    category: formState.category,
    title: formState.title.trim(),
    amount: parsePositiveWholeNumber(formState.amount),
    dueDate: formState.dueDate.trim(),
    paidAt: formState.paidAt.trim(),
    linkedRentId: existing?.linkedRentId ?? "",
    linkedSpaceId: existing?.linkedSpaceId ?? "",
    notes: formState.notes.trim(),
    createdAt: existing?.createdAt || today,
    updatedAt: today,
  };
}

function renderEmptyState(title: string, body: string) {
  return (
    <article className="empty-state">
      <h3>{title}</h3>
      <p>{body}</p>
    </article>
  );
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");
  const [databaseError, setDatabaseError] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [activeView, setActiveView] = useState<ViewKey>("inicio");
  const [selectedPeriod, setSelectedPeriod] = useState(getCurrentPeriod(new Date()));
  const [chargeQuery, setChargeQuery] = useState("");
  const [expenseQuery, setExpenseQuery] = useState("");
  const [spaceQuery, setSpaceQuery] = useState("");
  const [tenantQuery, setTenantQuery] = useState("");
  const [chargeFilter, setChargeFilter] = useState<ChargeFilter>("todos");
  const [expenseFilter, setExpenseFilter] = useState<ExpenseFilter>("todos");
  const [snapshot, setSnapshot] = useState(demoSnapshot);
  const [tenantEditorOpen, setTenantEditorOpen] = useState(false);
  const [tenantEditorSpaceId, setTenantEditorSpaceId] = useState("");
  const [spaceForm, setSpaceForm] = useState<SpaceFormState | null>(null);
  const [tenantEditorBusy, setTenantEditorBusy] = useState(false);
  const [tenantEditorError, setTenantEditorError] = useState("");
  const [tenantDeleteConfirmOpen, setTenantDeleteConfirmOpen] = useState(false);
  const [paymentEditorOpen, setPaymentEditorOpen] = useState(false);
  const [paymentEditorSpaceId, setPaymentEditorSpaceId] = useState("");
  const [paymentEditorMarkPaid, setPaymentEditorMarkPaid] = useState(false);
  const [paymentForm, setPaymentForm] = useState<PaymentFormState | null>(null);
  const [paymentEditorBusy, setPaymentEditorBusy] = useState(false);
  const [paymentEditorError, setPaymentEditorError] = useState("");
  const [rentMetricModalKey, setRentMetricModalKey] = useState<RentMetricCardKey | null>(null);
  const [expenseEditorOpen, setExpenseEditorOpen] = useState(false);
  const [expenseEditorId, setExpenseEditorId] = useState("");
  const [expenseEditorMarkPaid, setExpenseEditorMarkPaid] = useState(false);
  const [expenseForm, setExpenseForm] = useState<ExpenseFormState | null>(null);
  const [expenseEditorBusy, setExpenseEditorBusy] = useState(false);
  const [expenseEditorError, setExpenseEditorError] = useState("");
  const [expenseMetricModalKey, setExpenseMetricModalKey] = useState<ExpenseMetricCardKey | null>(null);
  const [seedBusy, setSeedBusy] = useState(false);
  const [pageMessage, setPageMessage] = useState("");
  const [pageMessageTone, setPageMessageTone] = useState<MessageTone>("");

  const deferredChargeQuery = useDeferredValue(chargeQuery);
  const deferredExpenseQuery = useDeferredValue(expenseQuery);
  const deferredSpaceQuery = useDeferredValue(spaceQuery);
  const deferredTenantQuery = useDeferredValue(tenantQuery);

  const applyRemoteSnapshot = useEffectEvent((raw: unknown) => {
    const resolved = resolveBuildingSnapshot(raw);

    startTransition(() => {
      setSnapshot(resolved.snapshot);
      setDatabaseError("");
    });
  });

  const applyDatabaseFailure = useEffectEvent((message: string) => {
    startTransition(() => {
      setSnapshot(demoSnapshot);
      setDatabaseError(message);
    });
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      startTransition(() => {
        setUser(nextUser);
        setAuthReady(true);
        setAuthBusy(false);
        setAuthError("");
      });
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!user) {
      startTransition(() => {
        setSnapshot(demoSnapshot);
        setDatabaseError("");
      });

      return;
    }

    const unsubscribe = onValue(
      ref(database),
      (databaseSnapshot) => {
        applyRemoteSnapshot(databaseSnapshot.val());
      },
      () => {
        applyDatabaseFailure("No se pudieron actualizar los datos en este momento.");
      },
    );

    return unsubscribe;
  }, [user]);

  const allSpaces = snapshot.spaces;
  const chargeableSpaces = allSpaces.filter((space) => space.status === "alquilado" && space.monthlyRent > 0);
  const tenantEditorSpace = allSpaces.find((space) => space.id === tenantEditorSpaceId) ?? null;
  const paymentEditorSpace = allSpaces.find((space) => space.id === paymentEditorSpaceId) ?? null;
  const expenseEditorExisting = snapshot.expenses.find((item) => item.id === expenseEditorId) ?? null;
  const paymentEditorExisting =
    snapshot.rentLedger.find(
      (item) => item.id === createLedgerId(paymentEditorSpaceId, paymentForm?.period ?? selectedPeriod),
    ) ?? null;

  useEffect(() => {
    if (!tenantEditorOpen || !tenantEditorSpace) {
      return;
    }

    setSpaceForm(createFormState(tenantEditorSpace));
    setTenantEditorError("");
  }, [tenantEditorOpen, tenantEditorSpace]);

  useEffect(() => {
    if (!paymentEditorOpen || !paymentEditorSpace) {
      return;
    }

    const existing =
      snapshot.rentLedger.find(
        (item) => item.id === createLedgerId(paymentEditorSpace.id, selectedPeriod),
      ) ?? null;

    const nextForm = createPaymentFormState(paymentEditorSpace, selectedPeriod, existing);

    if (paymentEditorMarkPaid && !nextForm.paidAt) {
      nextForm.paidAt = formatDateForStorage(new Date());
      nextForm.receivedAmount = nextForm.chargeAmount;
    }

    setPaymentForm(nextForm);
    setPaymentEditorError("");
  }, [paymentEditorOpen, paymentEditorSpace, paymentEditorMarkPaid, selectedPeriod, snapshot.rentLedger]);

  useEffect(() => {
    if (!expenseEditorOpen) {
      return;
    }

    const nextForm = createExpenseFormState(selectedPeriod, expenseEditorExisting);

    if (expenseEditorMarkPaid && !nextForm.paidAt) {
      nextForm.paidAt = formatDateForStorage(new Date());
    }

    setExpenseForm(nextForm);
    setExpenseEditorError("");
  }, [expenseEditorExisting, expenseEditorMarkPaid, expenseEditorOpen, selectedPeriod]);

  const now = new Date();
  const rentBoardRecords = buildRentBoardRecords(allSpaces, snapshot.rentLedger, selectedPeriod, now);
  const rentMetrics = buildRentMetrics(rentBoardRecords);
  const expenseBoardRecords = buildExpenseBoardRecords(
    snapshot.expenses,
    snapshot.rentLedger,
    allSpaces,
    selectedPeriod,
  );
  const expenseMetrics = buildExpenseMetrics(expenseBoardRecords);
  const overdueRecords = rentBoardRecords.filter((item) => item.isOverdue);
  const dueSoonRecords = rentBoardRecords.filter((item) => item.isDueSoon);
  const pendingWithoutDueDate = rentBoardRecords.filter((item) => item.needsDueDate);
  const paidRecords = rentBoardRecords.filter((item) => item.status === "pagado");
  const filteredChargeRecords = rentBoardRecords
    .filter((record) => getChargeSearchText(record).includes(deferredChargeQuery.trim().toLowerCase()))
    .filter((record) => {
      if (chargeFilter === "todos") {
        return true;
      }

      if (chargeFilter === "pendientes") {
        return record.status === "pendiente" || record.status === "sin vencimiento";
      }

      if (chargeFilter === "por vencer") {
        return record.status === "por vencer";
      }

      if (chargeFilter === "vencidos") {
        return record.status === "vencido";
      }

      return record.status === "pagado";
    });
  const filteredExpenseRecords = expenseBoardRecords
    .filter((record) => getExpenseSearchText(record).includes(deferredExpenseQuery.trim().toLowerCase()))
    .filter((record) => {
      if (expenseFilter === "todos") {
        return true;
      }

      if (expenseFilter === "pendientes") {
        return record.status === "pendiente";
      }

      if (expenseFilter === "pagados") {
        return record.status === "pagado";
      }

      if (expenseFilter === "manuales") {
        return record.source === "manual";
      }

      return record.source === "iva";
    });
  const filteredSpaces = allSpaces.filter((space) =>
    getSpaceSearchText(space).includes(deferredSpaceQuery.trim().toLowerCase()),
  );
  const groupedSpaces = groupSpacesByLevel(filteredSpaces);
  const tenantSpaces = allSpaces
    .filter((space) => space.type !== "terraza")
    .filter((space) => getSpaceSearchText(space).includes(deferredTenantQuery.trim().toLowerCase()));
  const pendingExpenseRecords = expenseBoardRecords.filter((record) => record.status === "pendiente");
  const paidExpenseRecords = expenseBoardRecords.filter((record) => record.status === "pagado");
  const taxExpenseRecords = expenseBoardRecords.filter((record) => record.source === "iva");
  const periodOptions = [...createPeriodOptions(now, 10)];
  const sortedAuditLog = getSortedAuditLog(snapshot.auditLog);
  const latestAuditBySpaceId = new Map<string, AuditLogRecord>();
  const latestAuditByEntityId = new Map<string, AuditLogRecord>();

  if (!periodOptions.includes(selectedPeriod)) {
    periodOptions.unshift(selectedPeriod);
  }

  for (const entry of sortedAuditLog) {
    if (!latestAuditBySpaceId.has(entry.spaceId)) {
      latestAuditBySpaceId.set(entry.spaceId, entry);
    }

    if (!latestAuditByEntityId.has(entry.entityId)) {
      latestAuditByEntityId.set(entry.entityId, entry);
    }
  }

  const tenantEditorHistory = tenantEditorSpace
    ? sortedAuditLog.filter((entry) => entry.spaceId === tenantEditorSpace.id).slice(0, 4)
    : [];
  const paymentEditorHistory = paymentEditorSpace
    ? sortedAuditLog
        .filter(
          (entry) =>
            entry.spaceId === paymentEditorSpace.id ||
            entry.entityId === createLedgerId(paymentEditorSpace.id, paymentForm?.period ?? selectedPeriod),
        )
        .slice(0, 4)
    : [];
  const expenseEditorHistory = expenseEditorExisting
    ? sortedAuditLog.filter((entry) => entry.entityId === expenseEditorExisting.id).slice(0, 4)
    : [];
  const paymentTaxExpensePreview = paymentForm
    ? calculateBuildingTaxExpenseAmount(
        parsePositiveWholeNumber(paymentForm.chargeAmount),
        paymentForm.paidAt,
      )
    : 0;
  const rentPendingRecords = rentBoardRecords.filter(
    (record) =>
      record.status === "pendiente" ||
      record.status === "vencido" ||
      record.status === "por vencer",
  );
  const rentMetricRecordsByKey: Record<RentMetricCardKey, RentBoardRecord[]> = {
    total: rentBoardRecords,
    paid: paidRecords,
    pending: rentPendingRecords,
    missingDue: pendingWithoutDueDate,
  };
  const rentMetricModalConfig = rentMetricModalKey
    ? {
        total: {
          title: "Cobros del mes",
          copy: "Aqui ves todos los alquileres activos del periodo seleccionado.",
          emptyMessage: "No hay cobros activos en este periodo.",
        },
        paid: {
          title: "Cobros pagados",
          copy: "Detalle de los alquileres que ya fueron marcados como pagados en este mes.",
          emptyMessage: "Todavia no hay alquileres pagados en este periodo.",
        },
        pending: {
          title: "Cobros pendientes",
          copy: "Aqui se agrupan los alquileres pendientes, por vencer y vencidos del mes.",
          emptyMessage: "No hay alquileres pendientes en este periodo.",
        },
        missingDue: {
          title: "Cobros sin vencimiento",
          copy: "Detalle de los alquileres que todavia no tienen fecha de vencimiento cargada.",
          emptyMessage: "Todos los alquileres visibles ya tienen vencimiento configurado.",
        },
      }[rentMetricModalKey]
    : null;
  const rentMetricModalRecords = rentMetricModalKey ? rentMetricRecordsByKey[rentMetricModalKey] : [];
  const rentMetricModalTotal = rentMetricModalRecords.reduce((sum, record) => {
    if (rentMetricModalKey === "paid") {
      return sum + (record.receivedAmount || record.chargeAmount);
    }

    return sum + record.chargeAmount;
  }, 0);
  const expenseMetricRecordsByKey: Record<ExpenseMetricCardKey, ExpenseBoardRecord[]> = {
    total: expenseBoardRecords,
    paid: paidExpenseRecords,
    pending: pendingExpenseRecords,
    tax: taxExpenseRecords,
  };
  const expenseMetricModalConfig = expenseMetricModalKey
    ? {
        total: {
          title: "Gastos del mes",
          copy: "Aqui ves todos los gastos del periodo, incluyendo manuales e IVA generado.",
          emptyMessage: "No hay gastos cargados en este periodo.",
        },
        paid: {
          title: "Gastos pagados",
          copy: "Detalle de todos los gastos que ya fueron marcados como pagados en este mes.",
          emptyMessage: "Todavia no hay gastos pagados en este periodo.",
        },
        pending: {
          title: "Gastos pendientes",
          copy: "Detalle de los gastos del edificio que aun faltan cubrir en este mes.",
          emptyMessage: "No hay gastos pendientes en este periodo.",
        },
        tax: {
          title: "IVA generado",
          copy: "Detalle del IVA automatico que se genera por cada alquiler cobrado.",
          emptyMessage: "Todavia no hay IVA generado por cobros en este periodo.",
        },
      }[expenseMetricModalKey]
    : null;
  const expenseMetricModalRecords = expenseMetricModalKey
    ? expenseMetricRecordsByKey[expenseMetricModalKey]
    : [];
  const expenseMetricModalTotal = expenseMetricModalRecords.reduce((sum, record) => sum + record.amount, 0);

  function openTenantEditor(spaceId: string) {
    setRentMetricModalKey(null);
    setExpenseMetricModalKey(null);
    setTenantEditorSpaceId(spaceId);
    setTenantEditorOpen(true);
    setTenantEditorError("");
    setPageMessage("");
    setPageMessageTone("");
  }

  function openTenantEditorFromHeader() {
    const fallbackSpace =
      allSpaces.find((space) => space.rentable && space.status === "disponible") ??
      allSpaces.find((space) => space.type !== "terraza") ??
      allSpaces[0];

    if (fallbackSpace) {
      openTenantEditor(fallbackSpace.id);
    }
  }

  function closeTenantEditor() {
    setTenantEditorOpen(false);
    setSpaceForm(null);
    setTenantEditorError("");
    setTenantDeleteConfirmOpen(false);
  }

  function openPaymentEditor(spaceId?: string, options?: { markPaid?: boolean }) {
    setRentMetricModalKey(null);
    setExpenseMetricModalKey(null);
    const fallbackSpace =
      (spaceId && chargeableSpaces.find((space) => space.id === spaceId)) ??
      overdueRecords[0]?.space ??
      dueSoonRecords[0]?.space ??
      chargeableSpaces[0];

    if (!fallbackSpace) {
      return;
    }

    setPaymentEditorSpaceId(fallbackSpace.id);
    setPaymentEditorMarkPaid(options?.markPaid ?? false);
    setPaymentEditorOpen(true);
    setPaymentEditorError("");
    setPageMessage("");
    setPageMessageTone("");
  }

  function closePaymentEditor() {
    setPaymentEditorOpen(false);
    setPaymentEditorMarkPaid(false);
    setPaymentForm(null);
    setPaymentEditorError("");
  }

  function openExpenseEditor(expenseId?: string, options?: { markPaid?: boolean }) {
    setRentMetricModalKey(null);
    setExpenseMetricModalKey(null);
    setExpenseEditorId(expenseId ?? "");
    setExpenseEditorMarkPaid(options?.markPaid ?? false);
    setExpenseEditorOpen(true);
    setExpenseEditorError("");
    setPageMessage("");
    setPageMessageTone("");
  }

  function closeExpenseEditor() {
    setExpenseEditorOpen(false);
    setExpenseEditorId("");
    setExpenseEditorMarkPaid(false);
    setExpenseForm(null);
    setExpenseEditorError("");
  }

  function refreshPaymentForm(nextSpaceId: string, nextPeriod: string) {
    const nextSpace = allSpaces.find((space) => space.id === nextSpaceId);

    if (!nextSpace) {
      return;
    }

    const existing =
      snapshot.rentLedger.find((item) => item.id === createLedgerId(nextSpace.id, nextPeriod)) ?? null;

    setPaymentEditorSpaceId(nextSpace.id);
    const nextForm = createPaymentFormState(nextSpace, nextPeriod, existing);

    if (paymentEditorMarkPaid && !nextForm.paidAt) {
      nextForm.paidAt = formatDateForStorage(new Date());
      nextForm.receivedAmount = nextForm.chargeAmount;
    }

    setPaymentForm(nextForm);
    setPaymentEditorError("");
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthBusy(true);
    setAuthError("");

    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      setPassword("");
    } catch (error) {
      setAuthBusy(false);
      setAuthError(getAuthMessage(error));
    }
  }

  async function handleLogout() {
    setAuthBusy(true);

    try {
      await signOut(auth);
    } catch {
      setAuthBusy(false);
      setAuthError("No se pudo cerrar la sesion actual.");
    }
  }

  async function handleSeedDatabase() {
    if (!user) {
      return;
    }

    const shouldProceed =
      typeof window === "undefined" ||
      window.confirm(
        "Se cargara la estructura inicial del edificio y se reemplazaran los espacios actuales. Deseas continuar?",
      );

    if (!shouldProceed) {
      return;
    }

    setSeedBusy(true);
    setPageMessage("");
    setPageMessageTone("");

    try {
      await update(ref(database), createInitialDatabasePayload());
      setPageMessage("La estructura inicial del edificio se guardo correctamente.");
      setPageMessageTone("success");
    } catch {
      setPageMessage("No se pudo cargar la estructura inicial.");
      setPageMessageTone("error");
    } finally {
      setSeedBusy(false);
    }
  }

  async function handleSaveSpace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!tenantEditorSpace || !spaceForm) {
      return;
    }

    const responsibleLabel = buildResponsibleLabel(spaceForm);
    const dueDayNumber = spaceForm.dueDay ? Number(spaceForm.dueDay) : 0;

    if (
      (spaceForm.status === "alquilado" || spaceForm.status === "accionista") &&
      responsibleLabel.length === 0
    ) {
      setTenantEditorError("Debes cargar el nombre del inquilino principal o un nombre visible.");
      return;
    }

    if (
      spaceForm.dueDay &&
      (!Number.isFinite(dueDayNumber) || dueDayNumber < 1 || dueDayNumber > 31)
    ) {
      setTenantEditorError("El dia de vencimiento debe estar entre 1 y 31.");
      return;
    }

    setTenantEditorBusy(true);
    setTenantEditorError("");

    try {
      const nextSpace = serializeSpace(tenantEditorSpace, spaceForm);
      const auditEntry = createAuditEntry({
        actor: user,
        entityId: tenantEditorSpace.id,
        entityType: "space",
        spaceId: tenantEditorSpace.id,
        action: "Edito ficha",
        summary: buildSpaceAuditSummary(tenantEditorSpace, nextSpace),
      });

      await update(ref(database), {
        [`spaces/${tenantEditorSpace.id}`]: nextSpace,
        [`auditLog/${auditEntry.id}`]: auditEntry,
      });
      setPageMessage(`${tenantEditorSpace.displayName} fue actualizado correctamente.`);
      setPageMessageTone("success");
      closeTenantEditor();
    } catch {
      setTenantEditorError("No se pudo guardar la ficha del inquilino.");
    } finally {
      setTenantEditorBusy(false);
    }
  }

  async function handleDeleteTenant() {
    if (!tenantEditorSpace) {
      return;
    }

    setTenantEditorBusy(true);
    setTenantEditorError("");

    try {
      const clearedSpace = clearTenantAssignment(tenantEditorSpace);
      const auditEntry = createAuditEntry({
        actor: user,
        entityId: tenantEditorSpace.id,
        entityType: "space",
        spaceId: tenantEditorSpace.id,
        action: "Elimino inquilino",
        summary: "elimino la ficha actual del inquilino y dejo el espacio disponible",
      });

      await update(ref(database), {
        [`spaces/${tenantEditorSpace.id}`]: clearedSpace,
        [`auditLog/${auditEntry.id}`]: auditEntry,
      });
      setPageMessage(`La ficha de ${tenantEditorSpace.displayName} fue eliminada y el espacio quedo disponible.`);
      setPageMessageTone("success");
      closeTenantEditor();
    } catch {
      setTenantEditorError("No se pudo eliminar la ficha del inquilino.");
    } finally {
      setTenantEditorBusy(false);
      setTenantDeleteConfirmOpen(false);
    }
  }

  async function handleSavePayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!paymentEditorSpace || !paymentForm) {
      return;
    }

    const chargeAmount = parsePositiveWholeNumber(paymentForm.chargeAmount);
    const receivedAmount = parsePositiveWholeNumber(paymentForm.receivedAmount);

    if (chargeAmount <= 0) {
      setPaymentEditorError("Debes cargar un monto mensual mayor a cero.");
      return;
    }

    if (paymentForm.paidAt && receivedAmount <= 0) {
      setPaymentEditorError("Si marcas una fecha de pago, tambien debes indicar el monto recibido.");
      return;
    }

    if (paymentForm.paidAt && !paymentForm.paymentMethod) {
      setPaymentEditorError("Debes seleccionar el metodo de pago.");
      return;
    }

    setPaymentEditorBusy(true);
    setPaymentEditorError("");

    try {
      const existing =
        snapshot.rentLedger.find(
          (item) => item.id === createLedgerId(paymentEditorSpace.id, paymentForm.period),
        ) ?? null;
      const nextRecord = serializePaymentForm(paymentEditorSpace, paymentForm, existing);
      const auditChange = buildRentAuditSummary(existing, nextRecord);
      const auditEntry = createAuditEntry({
        actor: user,
        entityId: nextRecord.id,
        entityType: "rent",
        spaceId: paymentEditorSpace.id,
        action: auditChange.action,
        summary: `${auditChange.summary} en ${formatPeriodLabel(paymentForm.period)}`,
      });

      await update(ref(database), {
        [`rentLedger/${nextRecord.id}`]: nextRecord,
        [`auditLog/${auditEntry.id}`]: auditEntry,
      });
      setPageMessage(
        paymentForm.paidAt
          ? `Pago de ${paymentEditorSpace.displayName} registrado para ${formatPeriodLabel(paymentForm.period)}. IVA generado: ${formatGs(nextRecord.taxExpenseAmount, { maximumFractionDigits: 2 })}.`
          : `Cobranza de ${paymentEditorSpace.displayName} preparada para ${formatPeriodLabel(paymentForm.period)}.`,
      );
      setPageMessageTone("success");
      closePaymentEditor();
      setActiveView("cobranzas");
    } catch {
      setPaymentEditorError("No se pudo guardar la cobranza.");
    } finally {
      setPaymentEditorBusy(false);
    }
  }

  async function handleSaveExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!expenseForm) {
      return;
    }

    const amount = parsePositiveWholeNumber(expenseForm.amount);

    if (!expenseForm.title.trim()) {
      setExpenseEditorError("Debes cargar el concepto principal del gasto.");
      return;
    }

    if (amount <= 0) {
      setExpenseEditorError("Debes cargar un monto mayor a cero.");
      return;
    }

    setExpenseEditorBusy(true);
    setExpenseEditorError("");

    try {
      const nextRecord = serializeExpenseForm(expenseForm, expenseEditorExisting);
      const auditChange = buildExpenseAuditSummary(expenseEditorExisting, nextRecord);
      const auditEntry = createAuditEntry({
        actor: user,
        entityId: nextRecord.id,
        entityType: "expense",
        spaceId: nextRecord.linkedSpaceId,
        action: auditChange.action,
        summary: `${auditChange.summary} en ${formatPeriodLabel(nextRecord.period)}`,
      });

      await update(ref(database), {
        [`expenses/${nextRecord.id}`]: nextRecord,
        [`auditLog/${auditEntry.id}`]: auditEntry,
      });
      setPageMessage(
        nextRecord.paidAt
          ? `Gasto ${nextRecord.title} guardado como pagado en ${formatPeriodLabel(nextRecord.period)}.`
          : `Gasto ${nextRecord.title} cargado para ${formatPeriodLabel(nextRecord.period)}.`,
      );
      setPageMessageTone("success");
      closeExpenseEditor();
      setActiveView("gastos");
    } catch {
      setExpenseEditorError("No se pudo guardar el gasto del edificio.");
    } finally {
      setExpenseEditorBusy(false);
    }
  }

  async function handleClearPaymentRecord() {
    if (!paymentEditorSpace || !paymentForm) {
      return;
    }

    const recordId = createLedgerId(paymentEditorSpace.id, paymentForm.period);
    const shouldProceed =
      typeof window === "undefined" ||
      window.confirm(
        `Se eliminara el registro mensual de ${paymentEditorSpace.displayName} para ${formatPeriodLabel(paymentForm.period)}. Deseas continuar?`,
      );

    if (!shouldProceed) {
      return;
    }

    setPaymentEditorBusy(true);
    setPaymentEditorError("");

    try {
      const auditEntry = createAuditEntry({
        actor: user,
        entityId: recordId,
        entityType: "rent",
        spaceId: paymentEditorSpace.id,
        action: "Limpio registro",
        summary: `elimino la cobranza de ${formatPeriodLabel(paymentForm.period)}`,
      });

      await update(ref(database), {
        [`rentLedger/${recordId}`]: null,
        [`auditLog/${auditEntry.id}`]: auditEntry,
      });
      setPageMessage(`Se limpio el registro mensual de ${paymentEditorSpace.displayName}.`);
      setPageMessageTone("success");
      closePaymentEditor();
    } catch {
      setPaymentEditorError("No se pudo limpiar el registro mensual.");
    } finally {
      setPaymentEditorBusy(false);
    }
  }

  function handleModalCardClick(event: MouseEvent<HTMLDivElement>) {
    event.stopPropagation();
  }

  function renderAuditNote(entry: AuditLogRecord | null | undefined) {
    if (!entry) {
      return null;
    }

    return <p className="audit-note">Ultimo movimiento: {formatAuditLine(entry)}</p>;
  }

  function renderAuditHistory(title: string, entries: AuditLogRecord[]) {
    if (entries.length === 0) {
      return null;
    }

    return (
      <section className="editor-form__section audit-section">
        <div className="editor-form__section-head">
          <div>
            <p className="eyebrow">Historial</p>
            <h3>{title}</h3>
          </div>
        </div>

        <div className="audit-history">
          {entries.map((entry) => (
            <p className="audit-note" key={entry.id}>
              {formatAuditLine(entry)}
            </p>
          ))}
        </div>
      </section>
    );
  }

  function renderMiniChargeList(title: string, records: RentBoardRecord[], emptyMessage: string) {
    return (
      <article className="panel dashboard-sidecard">
        <div className="dashboard-sidecard__head">
          <div>
            <h3>{title}</h3>
          </div>
          <span className="dashboard-counter">{records.length}</span>
        </div>

        {records.length > 0 ? (
          <div className="mini-charge-list">
            {records.map((record) => (
              <button
                className="mini-charge-item"
                key={record.id}
                type="button"
                onClick={() => openPaymentEditor(record.spaceId)}
              >
                <div>
                  <strong>{record.spaceName}</strong>
                  <p>{record.residentName}</p>
                </div>
                <div className="mini-charge-item__meta">
                  <StatusPill value={record.statusLabel} />
                  <span>{record.dueText}</span>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <p className="dashboard-sidecard__empty">{emptyMessage}</p>
        )}
      </article>
    );
  }

  function renderRentRow(record: RentBoardRecord) {
    return (
      <article className="ledger-row" key={record.id}>
        <div className="ledger-row__grid">
          <div className="ledger-row__identity">
            <div className="ledger-row__topline">
              <p className="eyebrow">
                {record.spaceLevel} / {record.spaceName}
              </p>
              <StatusPill value={record.statusLabel} />
            </div>
            <h3>{record.residentName}</h3>
            <p>{record.spaceName}</p>
          </div>

          <div className="ledger-row__metric">
            <span>Alquiler</span>
            <strong>{formatGs(record.chargeAmount)}</strong>
            <small>
              IVA{" "}
              {record.taxExpenseAmount > 0
                ? formatGs(record.taxExpenseAmount, { maximumFractionDigits: 2 })
                : "al pagar"}
            </small>
          </div>

          <div className="ledger-row__metric">
            <span>Vence</span>
            <strong>{record.dueDate || "Sin fecha"}</strong>
          </div>

          <div className="ledger-row__metric">
            <span>Pago</span>
            <strong>{record.paidAt || "Pendiente"}</strong>
          </div>

          <div className="ledger-row__actions">
            <button
              className="secondary-button secondary-button--small"
              type="button"
              onClick={() => openTenantEditor(record.spaceId)}
            >
              Ficha
            </button>
            <button
              className="secondary-button secondary-button--small"
              type="button"
              onClick={() => openPaymentEditor(record.spaceId)}
            >
              Cobro
            </button>
            {!record.isPaid ? (
              <button
                className="primary-button primary-button--small"
                type="button"
                onClick={() => openPaymentEditor(record.spaceId, { markPaid: true })}
              >
                Pagado
              </button>
            ) : null}
          </div>
        </div>
        {renderAuditNote(
          latestAuditByEntityId.get(record.id) ?? latestAuditBySpaceId.get(record.spaceId) ?? null,
        )}
      </article>
    );
  }

  function renderExpenseSideList(title: string, records: ExpenseBoardRecord[], emptyMessage: string) {
    return (
      <article className="panel dashboard-sidecard">
        <div className="dashboard-sidecard__head">
          <div>
            <h3>{title}</h3>
          </div>
          <span className="dashboard-counter">{records.length}</span>
        </div>

        {records.length > 0 ? (
          <div className="mini-charge-list">
            {records.map((record) => (
              <article className="mini-charge-item" key={record.id}>
                <div>
                  <strong>{record.title}</strong>
                  <p>{record.linkedSpaceName || record.categoryLabel}</p>
                </div>
                <div className="mini-charge-item__meta">
                  <StatusPill value={record.statusLabel} />
                  <span>
                    {formatGs(record.amount, {
                      maximumFractionDigits: record.source === "iva" ? 2 : 0,
                    })}
                  </span>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="dashboard-sidecard__empty">{emptyMessage}</p>
        )}
      </article>
    );
  }

  function renderExpenseRow(record: ExpenseBoardRecord) {
    return (
      <article className="ledger-row" key={record.id}>
        <div className="ledger-row__grid">
          <div className="ledger-row__identity">
            <div className="ledger-row__topline">
              <p className="eyebrow">
                {record.sourceLabel} / {record.categoryLabel}
              </p>
              <StatusPill value={record.statusLabel} />
            </div>
            <h3>{record.title}</h3>
            <p>{record.linkedSpaceName || "Gasto general del edificio"}</p>
          </div>

          <div className="ledger-row__metric">
            <span>Monto</span>
            <strong>
              {formatGs(record.amount, {
                maximumFractionDigits: record.source === "iva" ? 2 : 0,
              })}
            </strong>
          </div>

          <div className="ledger-row__metric">
            <span>Vence</span>
            <strong>{record.dueDate || "Sin fecha"}</strong>
          </div>

          <div className="ledger-row__metric">
            <span>Pago</span>
            <strong>{record.paidAt || "Pendiente"}</strong>
          </div>

          {record.source === "manual" ? (
            <div className="ledger-row__actions">
              <button
                className="secondary-button secondary-button--small"
                type="button"
                onClick={() => openExpenseEditor(record.id)}
              >
                Editar
              </button>
              {record.status === "pendiente" ? (
                <button
                  className="primary-button primary-button--small"
                  type="button"
                  onClick={() => openExpenseEditor(record.id, { markPaid: true })}
                >
                  Pagar
                </button>
              ) : null}
            </div>
          ) : (
            <div className="ledger-row__actions ledger-row__actions--readonly">
              <span className="ledger-row__readonly-badge">Automatico</span>
            </div>
          )}
        </div>

        {record.notes ? <p className="audit-note">{record.notes}</p> : null}

        {renderAuditNote(latestAuditByEntityId.get(record.auditEntityId) ?? null)}
      </article>
    );
  }

  function renderExpensesView() {
    return (
      <section className="dashboard-content-stack">
        <section className="dashboard-grid">
          <section className="panel dashboard-panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Gastos</p>
                <h2>Gastos del mes</h2>
              </div>
              <span className="section-heading__meta">{filteredExpenseRecords.length} visibles</span>
            </div>

            <div className="toolbar-row">
              <div className="filter-row" role="tablist" aria-label="Filtros de gastos">
                {expenseFilters.map((filter) => (
                  <button
                    key={filter.key}
                    className={expenseFilter === filter.key ? "chip chip--active" : "chip"}
                    type="button"
                    onClick={() => setExpenseFilter(filter.key)}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="ledger-list">
              {filteredExpenseRecords.length > 0
                ? filteredExpenseRecords.map((record) => renderExpenseRow(record))
                : renderEmptyState(
                    "Sin gastos visibles",
                    "No hay gastos que coincidan con el mes, el filtro o la busqueda actual.",
                  )}
            </div>
          </section>

          <div className="dashboard-side">
            {renderExpenseSideList(
              "Pendientes",
              pendingExpenseRecords,
              "Sin pendientes.",
            )}
            {renderExpenseSideList(
              "IVA generado",
              taxExpenseRecords,
              "Sin IVA generado.",
            )}
            {renderExpenseSideList(
              "Pagados",
              paidExpenseRecords,
              "Sin gastos pagados.",
            )}
          </div>
        </section>
      </section>
    );
  }

  function renderHomeView() {
    return (
      <section className="dashboard-content-stack">
        <section className="dashboard-grid">
          <div className="panel dashboard-panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Hoy</p>
                <h2>Mes en curso</h2>
              </div>
              <span className="section-heading__meta">{filteredChargeRecords.length} cobros</span>
            </div>

            <div className="ledger-list">
              {filteredChargeRecords.length > 0
                ? filteredChargeRecords.map((record) => renderRentRow(record))
                : renderEmptyState(
                    "Sin cobranzas visibles",
                    "No hay alquileres que coincidan con la busqueda o con el filtro del mes.",
                  )}
            </div>
          </div>

          <div className="dashboard-side">
            {renderMiniChargeList(
              "Vencidos",
              overdueRecords,
              "Sin vencidos.",
            )}
            {renderMiniChargeList(
              "Por vencer",
              dueSoonRecords,
              "Sin proximos.",
            )}
            {renderMiniChargeList(
              "Sin vencimiento",
              pendingWithoutDueDate,
              "Todo cargado.",
            )}
          </div>
        </section>
      </section>
    );
  }

  function renderCollectionsView() {
    return (
      <section className="dashboard-content-stack">
        <section className="panel dashboard-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Cobranzas</p>
              <h2>Cobranzas</h2>
            </div>
            <span className="section-heading__meta">{filteredChargeRecords.length} visibles</span>
          </div>

          <div className="toolbar-row">
            <div className="filter-row" role="tablist" aria-label="Filtros de cobranzas">
              {chargeFilters.map((filter) => (
                <button
                  key={filter.key}
                  className={chargeFilter === filter.key ? "chip chip--active" : "chip"}
                  type="button"
                  onClick={() => setChargeFilter(filter.key)}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>

          <div className="ledger-list">
            {filteredChargeRecords.length > 0
              ? filteredChargeRecords.map((record) => renderRentRow(record))
              : renderEmptyState(
                  "Sin movimientos visibles",
                  "No hay alquileres que coincidan con este filtro en el mes seleccionado.",
                )}
          </div>
        </section>
      </section>
    );
  }

  function renderTenantsView() {
    return (
      <section className="dashboard-content-stack">
        <section className="panel dashboard-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Inquilinos</p>
              <h2>Fichas y contratos</h2>
            </div>
            <span className="section-heading__meta">{tenantSpaces.length} espacios</span>
          </div>

          <div className="tenant-admin-list">
            {tenantSpaces.length > 0
              ? tenantSpaces.map((space) => {
                  const currentCharge = rentBoardRecords.find((item) => item.spaceId === space.id) ?? null;
                  const dueLabel = space.dueDay ? `Dia ${space.dueDay}` : "Sin vencimiento fijo";

                  return (
                    <article className="tenant-admin-row" key={space.id}>
                      <div className="tenant-admin-row__main">
                        <div>
                          <p className="eyebrow">
                            {space.level} / {space.displayName}
                          </p>
                          <h3>{formatResponsibleName(space.paymentResponsible)}</h3>
                          <p>{space.alias || space.zone}</p>
                        </div>

                        <div className="tenant-admin-row__meta">
                          <div>
                            <span>Alquiler</span>
                            <strong>{space.monthlyRent > 0 ? formatGs(space.monthlyRent) : "Sin cobro"}</strong>
                          </div>
                          <div>
                            <span>Vence</span>
                            <strong>{dueLabel}</strong>
                          </div>
                          <div>
                            <span>Parking</span>
                            <strong>
                              {space.hasParking
                                ? space.parkingFee > 0
                                  ? formatGs(space.parkingFee)
                                  : "Monto pendiente"
                                : "No"}
                            </strong>
                          </div>
                          <div>
                            <span>Estado</span>
                            <strong>
                              {isNotForRent(space)
                                ? "No se alquila"
                                : currentCharge
                                  ? currentCharge.statusLabel
                                  : "No aplica"}
                            </strong>
                          </div>
                          <StatusPill value={getSpaceStatusLabel(space)} />
                        </div>
                      </div>

                      <div className="tenant-admin-row__actions">
                        <button
                          className="secondary-button secondary-button--small"
                          type="button"
                          onClick={() => openPaymentEditor(space.id)}
                          disabled={space.status !== "alquilado" || space.monthlyRent <= 0}
                        >
                          Cobro
                        </button>
                        <button
                          className="primary-button primary-button--small"
                          type="button"
                          onClick={() => openTenantEditor(space.id)}
                        >
                          Ficha
                        </button>
                      </div>
                      {renderAuditNote(latestAuditBySpaceId.get(space.id) ?? null)}
                    </article>
                  );
                })
              : renderEmptyState(
                  "Sin inquilinos visibles",
                  "No hay registros que coincidan con la busqueda actual.",
                )}
          </div>
        </section>
      </section>
    );
  }

  function renderMapView() {
    return (
      <section className="dashboard-content-stack">
        <section className="panel dashboard-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Mapa del edificio</p>
              <h2>Salones y departamentos</h2>
            </div>
            <span className="section-heading__meta">{filteredSpaces.length} visibles</span>
          </div>

          <div className="space-section-list">
            {groupedSpaces.length > 0
              ? groupedSpaces.map((group) => (
                  <section className="space-group" key={group.level}>
                    <div className="space-group__header">
                      <div>
                        <p className="eyebrow">Nivel</p>
                        <h3>{group.level}</h3>
                      </div>
                      <span>{group.spaces.length} espacios</span>
                    </div>

                    <div className="space-grid">
                      {group.spaces.map((space) => (
                        <SpaceCard
                          key={space.id}
                          space={space}
                          onEdit={openTenantEditor}
                          auditLine={
                            latestAuditBySpaceId.has(space.id)
                              ? formatAuditLine(latestAuditBySpaceId.get(space.id))
                              : undefined
                          }
                        />
                      ))}
                    </div>
                  </section>
                ))
              : renderEmptyState(
                  "Sin espacios visibles",
                  "No hay salones o departamentos que coincidan con la busqueda actual.",
                )}
          </div>
        </section>
      </section>
    );
  }

  if (!authReady) {
    return (
      <main className="app-shell app-shell--centered">
        <div className="app-shell__ambient app-shell__ambient--left" />
        <div className="app-shell__ambient app-shell__ambient--right" />

        <section className="panel loading-panel">
          <p className="eyebrow">Sistema</p>
          <h1>Verificando sesion</h1>
          <p>Preparando el acceso al panel del edificio.</p>
        </section>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="app-shell">
        <div className="app-shell__ambient app-shell__ambient--left" />
        <div className="app-shell__ambient app-shell__ambient--right" />

        <AuthPanel
          email={email}
          password={password}
          error={authError}
          loading={authBusy}
          onEmailChange={setEmail}
          onPasswordChange={setPassword}
          onSubmit={handleLogin}
        />
      </main>
    );
  }

  const currentPeriodLabel = formatPeriodLabel(selectedPeriod);
  const toolbarSearch = getToolbarSearchContent(
    activeView,
    chargeQuery,
    expenseQuery,
    spaceQuery,
    tenantQuery,
    setChargeQuery,
    setExpenseQuery,
    setSpaceQuery,
    setTenantQuery,
  );
  const shouldShowSummaryCards = activeView !== "mapa" && activeView !== "inquilinos";
  const summaryMetrics = activeView === "gastos" ? expenseMetrics : rentMetrics;
  const summaryCards =
    activeView === "gastos"
      ? summaryMetrics.map((metric, index) => ({
          metric,
          onClick: () => setExpenseMetricModalKey(expenseMetricCardOrder[index] ?? "total"),
          actionLabel: "Detalle",
        }))
      : summaryMetrics.map((metric, index) => ({
          metric,
          onClick: () => setRentMetricModalKey(rentMetricCardOrder[index] ?? "total"),
          actionLabel: "Detalle",
        }));

  return (
    <>
      <main className="app-shell">
        <div className="app-shell__ambient app-shell__ambient--left" />
        <div className="app-shell__ambient app-shell__ambient--right" />

        <header className="panel dashboard-header">
          <div className="dashboard-header__brand">
            <div className="dashboard-header__title-row">
              <BrandLogo className="brand-logo brand-logo--header" />

              <div className="dashboard-header__brand-copy">
                <span className="dashboard-chip">{currentPeriodLabel}</span>
                <span className="dashboard-chip dashboard-chip--muted">
                  {user.email ?? "Sesion activa"}
                </span>
              </div>
            </div>
          </div>

          <nav className="dashboard-header__nav" aria-label="Secciones principales">
            {views.map((view) => (
              <button
                key={view.key}
                className={activeView === view.key ? "tab tab--active" : "tab"}
                type="button"
                onClick={() => setActiveView(view.key)}
              >
                {view.label}
              </button>
            ))}
          </nav>

          <div className="dashboard-header__utility">
            <button
              className="secondary-button secondary-button--small"
              type="button"
              onClick={handleSeedDatabase}
              disabled={seedBusy}
            >
              {seedBusy ? "Cargando..." : "Estructura"}
            </button>
            <button
              className="secondary-button secondary-button--small"
              type="button"
              onClick={handleLogout}
              disabled={authBusy}
            >
              Salir
            </button>
          </div>
        </header>

        <section className="panel dashboard-toolbar">
          <label className="search-field dashboard-toolbar__search">
            <span>{toolbarSearch.label}</span>
            <input
              type="search"
              value={toolbarSearch.value}
              onChange={(event) => toolbarSearch.onChange(event.target.value)}
              placeholder={toolbarSearch.placeholder}
            />
          </label>

          <label className="search-field dashboard-toolbar__period">
            <span>Mes</span>
            <AppSelect
              value={selectedPeriod}
              ariaLabel="Mes de trabajo"
              options={periodOptions.map((period) => ({
                value: period,
                label: formatPeriodLabel(period),
              }))}
              onChange={(value) => {
                setSelectedPeriod(value);
                setChargeFilter("todos");
                setExpenseFilter("todos");
              }}
            />
          </label>

          <div className="dashboard-toolbar__actions">
            <button
              className="primary-button primary-button--small"
              type="button"
              onClick={openTenantEditorFromHeader}
            >
              Nuevo inquilino
            </button>
            <button
              className="secondary-button secondary-button--small"
              type="button"
              onClick={() => openPaymentEditor()}
            >
              Cobro
            </button>
            <button
              className="secondary-button secondary-button--small"
              type="button"
              onClick={() => openExpenseEditor()}
            >
              Gasto
            </button>
          </div>
        </section>

        {databaseError ? (
          <section className="notice-strip">
            <article className="panel notice-card notice-card--warn">
              <p className="eyebrow">Aviso</p>
              <h2>No se pudieron actualizar los datos.</h2>
              <p>{databaseError}</p>
            </article>
          </section>
        ) : null}

        {pageMessage ? (
          <section className="page-banner-wrap">
            <article
              className={
                pageMessageTone === "error"
                  ? "panel page-banner page-banner--error"
                  : "panel page-banner page-banner--success"
              }
            >
              <p>{pageMessage}</p>
            </article>
          </section>
        ) : null}

        {shouldShowSummaryCards ? (
          <section className="summary-grid">
            {summaryCards.map((card) => (
              <SummaryCard
                key={card.metric.label}
                metric={card.metric}
                onClick={card.onClick}
                actionLabel={card.actionLabel}
              />
            ))}
          </section>
        ) : null}

        {activeView === "inicio" ? renderHomeView() : null}
        {activeView === "cobranzas" ? renderCollectionsView() : null}
        {activeView === "gastos" ? renderExpensesView() : null}
        {activeView === "inquilinos" ? renderTenantsView() : null}
        {activeView === "mapa" ? renderMapView() : null}
      </main>

      {tenantEditorOpen && tenantEditorSpace && spaceForm ? (
        <div className="modal-backdrop" onClick={closeTenantEditor}>
          <div className="modal-panel modal-panel--wide" onClick={handleModalCardClick}>
            <div className="modal-panel__header">
              <div>
                <p className="eyebrow">Ficha del inquilino</p>
                <h2>{tenantEditorSpace.displayName}</h2>
              </div>
              <button className="secondary-button secondary-button--small" type="button" onClick={closeTenantEditor}>
                Cerrar
              </button>
            </div>

            <form className="editor-form" onSubmit={handleSaveSpace}>
              <section className="editor-form__section">
                <div className="editor-form__section-head">
                  <div>
                    <p className="eyebrow">Datos del espacio</p>
                    <h3>Ubicacion y estado</h3>
                  </div>
                  <p className="editor-form__section-copy">
                    Selecciona el salon o departamento y define la situacion actual del espacio.
                  </p>
                </div>

                <div className="editor-grid">
                  <label className="search-field auth-form__field">
                    <span>Espacio</span>
                    <AppSelect
                      value={tenantEditorSpaceId}
                      ariaLabel="Espacio"
                      options={allSpaces.map((space) => ({
                        value: space.id,
                        label: `${space.displayName} / ${space.level}`,
                      }))}
                      onChange={setTenantEditorSpaceId}
                    />
                  </label>

                  <label className="search-field auth-form__field">
                    <span>Estado del espacio</span>
                    <AppSelect
                      value={spaceForm.status}
                      ariaLabel="Estado del espacio"
                      options={[
                        { value: "alquilado", label: "Alquilado" },
                        { value: "accionista", label: "No se alquila" },
                        { value: "disponible", label: "Disponible" },
                        { value: "uso exclusivo", label: "Uso exclusivo" },
                      ]}
                      onChange={(value) => {
                        const nextStatus = value as SpaceStatus;
                        setSpaceForm((current) => (current ? { ...current, status: nextStatus } : current));
                      }}
                    />
                  </label>
                </div>
              </section>

              <section className="editor-form__section">
                <div className="editor-form__section-head">
                  <div>
                    <p className="eyebrow">Inquilino principal</p>
                    <h3>Titular y encargado de pagos</h3>
                  </div>
                  <p className="editor-form__section-copy">
                    Carga nombre, apellido, cedula, RUC, NIS y medidor del titular. Si usas
                    empresa o alias, tambien puedes dejar un nombre visible opcional.
                  </p>
                </div>

                <div className="editor-grid">
                  <label className="search-field auth-form__field">
                    <span>Nombre del titular</span>
                    <input
                      type="text"
                      value={spaceForm.payerFirstName}
                      onChange={(event) =>
                        setSpaceForm((current) =>
                          current ? { ...current, payerFirstName: event.target.value } : current,
                        )
                      }
                      placeholder="Ej.: Juan"
                    />
                  </label>

                  <label className="search-field auth-form__field">
                    <span>Apellido del titular</span>
                    <input
                      type="text"
                      value={spaceForm.payerLastName}
                      onChange={(event) =>
                        setSpaceForm((current) =>
                          current ? { ...current, payerLastName: event.target.value } : current,
                        )
                      }
                      placeholder="Ej.: Perez"
                    />
                  </label>
                </div>

                <div className="editor-grid">
                  <label className="search-field auth-form__field">
                    <span>Cedula del titular</span>
                    <input
                      type="text"
                      value={spaceForm.payerDocumentId}
                      onChange={(event) =>
                        setSpaceForm((current) =>
                          current ? { ...current, payerDocumentId: event.target.value } : current,
                        )
                      }
                      placeholder="Numero de cedula"
                    />
                  </label>

                  <label className="search-field auth-form__field">
                    <span>RUC</span>
                    <input
                      type="text"
                      value={spaceForm.payerTaxId}
                      onChange={(event) =>
                        setSpaceForm((current) =>
                          current ? { ...current, payerTaxId: event.target.value } : current,
                        )
                      }
                      placeholder="Ej.: 80012345-6"
                    />
                  </label>
                </div>

                <div className="editor-grid">
                  <label className="search-field auth-form__field">
                    <span>NIS</span>
                    <input
                      type="text"
                      value={spaceForm.payerNis}
                      onChange={(event) =>
                        setSpaceForm((current) =>
                          current ? { ...current, payerNis: event.target.value } : current,
                        )
                      }
                      placeholder="Numero de NIS"
                    />
                  </label>

                  <label className="search-field auth-form__field">
                    <span>Medidor</span>
                    <input
                      type="text"
                      value={spaceForm.payerMeterNumber}
                      onChange={(event) =>
                        setSpaceForm((current) =>
                          current ? { ...current, payerMeterNumber: event.target.value } : current,
                        )
                      }
                      placeholder="Numero de medidor"
                    />
                  </label>
                </div>

                <label className="search-field auth-form__field">
                  <span>Nombre visible o empresa (opcional)</span>
                  <input
                    type="text"
                    value={spaceForm.payerDisplayName}
                    onChange={(event) =>
                      setSpaceForm((current) =>
                        current ? { ...current, payerDisplayName: event.target.value } : current,
                      )
                    }
                    placeholder="Ej.: Fify S.A. o Juan Perez"
                  />
                </label>
              </section>

              <section className="editor-form__section editor-form__section--nested">
                <div className="editor-occupants__header">
                  <div>
                    <p className="eyebrow">Otras personas ocupantes</p>
                    <h3>Opcional</h3>
                    <p className="editor-form__section-copy">
                      Si viven otras personas en el espacio, puedes agregarlas aqui.
                    </p>
                  </div>

                  <button
                    className="secondary-button secondary-button--small"
                    type="button"
                    onClick={() =>
                      setSpaceForm((current) =>
                        current
                          ? {
                              ...current,
                              additionalOccupants: [...current.additionalOccupants, createOccupantDraft()],
                            }
                          : current,
                      )
                    }
                  >
                    Agregar persona
                  </button>
                </div>

                {spaceForm.additionalOccupants.length > 0 ? (
                  <div className="occupant-list">
                    {spaceForm.additionalOccupants.map((occupant, index) => (
                      <article className="occupant-row" key={occupant.id}>
                        <div className="occupant-row__title">
                          <strong>Persona adicional {index + 1}</strong>
                        </div>

                        <div className="editor-grid">
                          <label className="search-field auth-form__field">
                            <span>Nombre</span>
                            <input
                              type="text"
                              value={occupant.firstName}
                              onChange={(event) =>
                                setSpaceForm((current) =>
                                  current
                                    ? {
                                        ...current,
                                        additionalOccupants: current.additionalOccupants.map((item) =>
                                          item.id === occupant.id
                                            ? { ...item, firstName: event.target.value }
                                            : item,
                                        ),
                                      }
                                    : current,
                                )
                              }
                              placeholder="Nombre"
                            />
                          </label>

                          <label className="search-field auth-form__field">
                            <span>Apellido</span>
                            <input
                              type="text"
                              value={occupant.lastName}
                              onChange={(event) =>
                                setSpaceForm((current) =>
                                  current
                                    ? {
                                        ...current,
                                        additionalOccupants: current.additionalOccupants.map((item) =>
                                          item.id === occupant.id
                                            ? { ...item, lastName: event.target.value }
                                            : item,
                                        ),
                                      }
                                    : current,
                                )
                              }
                              placeholder="Apellido"
                            />
                          </label>
                        </div>

                        <div className="occupant-row__footer">
                          <label className="search-field auth-form__field">
                            <span>Cedula</span>
                            <input
                              type="text"
                              value={occupant.documentId}
                              onChange={(event) =>
                                setSpaceForm((current) =>
                                  current
                                    ? {
                                        ...current,
                                        additionalOccupants: current.additionalOccupants.map((item) =>
                                          item.id === occupant.id
                                            ? { ...item, documentId: event.target.value }
                                            : item,
                                        ),
                                      }
                                    : current,
                                )
                              }
                              placeholder="Numero de cedula"
                            />
                          </label>

                          <button
                            className="secondary-button secondary-button--small"
                            type="button"
                            onClick={() =>
                              setSpaceForm((current) =>
                                current
                                  ? {
                                      ...current,
                                      additionalOccupants: current.additionalOccupants.filter(
                                        (item) => item.id !== occupant.id,
                                      ),
                                    }
                                  : current,
                              )
                            }
                          >
                            Quitar
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="editor-hint">
                    No hay personas adicionales cargadas. Este bloque es opcional.
                  </p>
                )}
              </section>

              <section className="editor-form__section">
                <div className="editor-form__section-head">
                  <div>
                    <p className="eyebrow">Datos del alquiler</p>
                    <h3>Monto y vencimientos</h3>
                  </div>
                  <p className="editor-form__section-copy">
                    Este bloque alimenta la cobranza mensual del sistema y deja preparado el dato
                    del estacionamiento cuando corresponda.
                  </p>
                </div>

                <div className="editor-grid">
                  <label className="search-field auth-form__field">
                    <span>Monto del alquiler (Gs.)</span>
                    <input
                      type="number"
                      min="0"
                      step="1000"
                      value={spaceForm.monthlyRent}
                      onChange={(event) =>
                        setSpaceForm((current) =>
                          current ? { ...current, monthlyRent: event.target.value } : current,
                        )
                      }
                      placeholder="0"
                    />
                  </label>

                  <label className="search-field auth-form__field">
                    <span>Dia de vencimiento</span>
                    <input
                      type="number"
                      min="1"
                      max="31"
                      value={spaceForm.dueDay}
                      onChange={(event) =>
                        setSpaceForm((current) =>
                          current ? { ...current, dueDay: event.target.value } : current,
                        )
                      }
                      placeholder="Ej.: 10"
                    />
                  </label>
                </div>

                <div className="editor-grid editor-grid--parking">
                  <label className="toggle-field" htmlFor="parking-enabled">
                    <input
                      id="parking-enabled"
                      type="checkbox"
                      checked={spaceForm.hasParking}
                      onChange={(event) =>
                        setSpaceForm((current) =>
                          current
                            ? {
                                ...current,
                                hasParking: event.target.checked,
                                parkingFee: event.target.checked ? current.parkingFee : "0",
                              }
                            : current,
                        )
                      }
                    />
                    <div>
                      <strong>Cuenta con estacionamiento</strong>
                      <p>Activa esta opcion si el inquilino paga un espacio aparte.</p>
                    </div>
                  </label>

                  <label className="search-field auth-form__field">
                    <span>Monto del estacionamiento (Gs.)</span>
                    <input
                      type="number"
                      min="0"
                      step="1000"
                      value={spaceForm.parkingFee}
                      onChange={(event) =>
                        setSpaceForm((current) =>
                          current ? { ...current, parkingFee: event.target.value } : current,
                        )
                      }
                      placeholder="Pendiente"
                      disabled={!spaceForm.hasParking}
                    />
                  </label>
                </div>

                <label className="search-field auth-form__field">
                  <span>Proximo vencimiento</span>
                  <input
                    type="date"
                    value={spaceForm.nextDueDate}
                    onChange={(event) =>
                      setSpaceForm((current) =>
                        current ? { ...current, nextDueDate: event.target.value } : current,
                      )
                    }
                  />
                </label>
              </section>

              <section className="editor-form__section">
                <div className="editor-form__section-head">
                  <div>
                    <p className="eyebrow">Notas</p>
                    <h3>Observaciones adicionales</h3>
                  </div>
                </div>

                <label className="search-field auth-form__field">
                  <span>Notas internas</span>
                  <textarea
                    value={spaceForm.notes}
                    onChange={(event) =>
                      setSpaceForm((current) =>
                        current ? { ...current, notes: event.target.value } : current,
                      )
                    }
                    placeholder="Observaciones del contrato, alias o acuerdos."
                  />
                </label>
              </section>

              {renderAuditHistory("Ultimos movimientos de esta ficha", tenantEditorHistory)}

              {tenantEditorError ? <p className="form-error">{tenantEditorError}</p> : null}

              <div className="modal-panel__actions modal-panel__actions--spread">
                <div className="modal-panel__actions-left">
                  {tenantEditorSpace.status === "alquilado" ? (
                    <button
                      className="secondary-button secondary-button--danger"
                      type="button"
                      onClick={() => setTenantDeleteConfirmOpen(true)}
                      disabled={tenantEditorBusy}
                    >
                      Eliminar inquilino
                    </button>
                  ) : null}
                </div>
                <div className="modal-panel__actions-right">
                  <button className="secondary-button" type="button" onClick={closeTenantEditor}>
                    Cancelar
                  </button>
                  <button className="primary-button" type="submit" disabled={tenantEditorBusy}>
                    {tenantEditorBusy ? "Guardando..." : "Guardar ficha"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {tenantDeleteConfirmOpen && tenantEditorSpace ? (
        <div className="modal-backdrop" onClick={() => setTenantDeleteConfirmOpen(false)}>
          <div className="modal-panel modal-panel--compact" onClick={handleModalCardClick}>
            <div className="modal-panel__header">
              <div>
                <p className="eyebrow">Confirmacion de seguridad</p>
                <h2>Eliminar inquilino</h2>
              </div>
            </div>

            <div className="editor-form">
              <section className="editor-form__section">
                <div className="editor-form__section-head">
                  <div>
                    <p className="eyebrow">{tenantEditorSpace.displayName}</p>
                    <h3>Esta accion no se puede deshacer</h3>
                  </div>
                  <p className="editor-form__section-copy">
                    Se eliminara la ficha actual del inquilino, se limpiaran monto y vencimientos,
                    y el espacio quedara disponible. El historial de movimientos no se borra.
                  </p>
                </div>
              </section>

              <div className="modal-panel__actions">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => setTenantDeleteConfirmOpen(false)}
                  disabled={tenantEditorBusy}
                >
                  Volver
                </button>
                <button
                  className="secondary-button secondary-button--danger"
                  type="button"
                  onClick={handleDeleteTenant}
                  disabled={tenantEditorBusy}
                >
                  {tenantEditorBusy ? "Eliminando..." : "Si, eliminar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {paymentEditorOpen && paymentEditorSpace && paymentForm ? (
        <div className="modal-backdrop" onClick={closePaymentEditor}>
          <div className="modal-panel" onClick={handleModalCardClick}>
            <div className="modal-panel__header">
              <div>
                <p className="eyebrow">Cobranza mensual</p>
                <h2>{paymentEditorSpace.displayName}</h2>
              </div>
              <button className="secondary-button secondary-button--small" type="button" onClick={closePaymentEditor}>
                Cerrar
              </button>
            </div>

            <form className="editor-form" onSubmit={handleSavePayment}>
              <section className="editor-form__section">
                <div className="editor-form__section-head">
                  <div>
                    <p className="eyebrow">Mes y espacio</p>
                    <h3>Base del cobro</h3>
                  </div>
                  <p className="editor-form__section-copy">
                    Aqui defines que alquiler estas gestionando y para que mes.
                  </p>
                </div>

                <div className="editor-grid">
                  <label className="search-field auth-form__field">
                    <span>Espacio</span>
                    <AppSelect
                      value={paymentForm.spaceId}
                      ariaLabel="Espacio"
                      options={chargeableSpaces.map((space) => ({
                        value: space.id,
                        label: `${space.displayName} / ${formatResponsibleName(space.paymentResponsible)}`,
                      }))}
                      onChange={(value) => refreshPaymentForm(value, paymentForm.period)}
                    />
                  </label>

                  <label className="search-field auth-form__field">
                    <span>Mes a cobrar</span>
                    <AppSelect
                      value={paymentForm.period}
                      ariaLabel="Mes a cobrar"
                      options={periodOptions.map((period) => ({
                        value: period,
                        label: formatPeriodLabel(period),
                      }))}
                      onChange={(value) => refreshPaymentForm(paymentForm.spaceId, value)}
                    />
                  </label>
                </div>

                <div className="editor-grid">
                  <label className="search-field auth-form__field">
                    <span>Monto del alquiler (Gs.)</span>
                    <input
                      type="number"
                      min="0"
                      step="1000"
                      value={paymentForm.chargeAmount}
                      onChange={(event) =>
                        setPaymentForm((current) =>
                          current ? { ...current, chargeAmount: event.target.value } : current,
                        )
                      }
                    />
                  </label>

                  <label className="search-field auth-form__field">
                    <span>Fecha de vencimiento</span>
                    <input
                      type="date"
                      value={paymentForm.dueDate}
                      onChange={(event) =>
                        setPaymentForm((current) =>
                          current ? { ...current, dueDate: event.target.value } : current,
                        )
                      }
                    />
                  </label>
                </div>
              </section>

              <section className="editor-form__section">
                <div className="editor-form__section-head">
                  <div>
                    <p className="eyebrow">Estado del pago</p>
                    <h3>{paymentEditorMarkPaid ? "Confirmar cobro" : "Pago recibido o pendiente"}</h3>
                  </div>
                  <p className="editor-form__section-copy">
                    Si ya pago, carga fecha y monto recibido. Si todavia no pago, deja la fecha en blanco.
                  </p>
                </div>

                <div className="editor-grid">
                  <label className="search-field auth-form__field">
                    <span>Fecha de pago</span>
                    <input
                      type="date"
                      value={paymentForm.paidAt}
                      onChange={(event) =>
                        setPaymentForm((current) =>
                          current ? { ...current, paidAt: event.target.value } : current,
                        )
                      }
                    />
                  </label>

                  <label className="search-field auth-form__field">
                    <span>Metodo de pago</span>
                    <AppSelect
                      value={paymentForm.paymentMethod}
                      ariaLabel="Metodo de pago"
                      options={[
                        { value: "", label: "Seleccionar" },
                        ...paymentMethodOptions.map((option) => ({
                          value: option.value,
                          label: option.label,
                        })),
                      ]}
                      onChange={(value) =>
                        setPaymentForm((current) =>
                          current
                            ? {
                                ...current,
                                paymentMethod: value as PaymentMethod | "",
                              }
                            : current,
                        )
                      }
                    />
                  </label>

                  <label className="search-field auth-form__field">
                    <span>Monto recibido (Gs.)</span>
                    <input
                      type="number"
                      min="0"
                      step="1000"
                      value={paymentForm.receivedAmount}
                      onChange={(event) =>
                        setPaymentForm((current) =>
                          current ? { ...current, receivedAmount: event.target.value } : current,
                        )
                      }
                    />
                  </label>
                </div>

                <article className="payment-tax-summary">
                  <span>IVA del edificio</span>
                  <strong>
                    {paymentTaxExpensePreview > 0
                      ? formatGs(paymentTaxExpensePreview, { maximumFractionDigits: 2 })
                      : "Se genera al marcar el alquiler como pagado"}
                  </strong>
                  <p>Se calcula automaticamente como el IVA del 5% incluido dentro del monto del alquiler.</p>
                </article>

                <label className="search-field auth-form__field">
                  <span>Notas del cobro</span>
                  <textarea
                    value={paymentForm.notes}
                    onChange={(event) =>
                      setPaymentForm((current) =>
                        current ? { ...current, notes: event.target.value } : current,
                      )
                    }
                    placeholder="Ej.: pago parcial, transferencia, acuerdo de prorroga."
                  />
                </label>
              </section>

              {renderAuditHistory("Ultimos movimientos de esta cobranza", paymentEditorHistory)}

              {paymentEditorExisting?.paidAt ? (
                <p className="form-success">
                  Ya existe un pago registrado para este mes: {paymentEditorExisting.paidAt}.
                </p>
              ) : null}

              {paymentEditorError ? <p className="form-error">{paymentEditorError}</p> : null}

              <div className="modal-panel__actions modal-panel__actions--spread">
                <div className="modal-panel__actions-left">
                  {paymentEditorExisting ? (
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={handleClearPaymentRecord}
                      disabled={paymentEditorBusy}
                    >
                      Limpiar registro del mes
                    </button>
                  ) : null}
                </div>

                <div className="modal-panel__actions-right">
                  <button className="secondary-button" type="button" onClick={closePaymentEditor}>
                    Cancelar
                  </button>
                  <button className="primary-button" type="submit" disabled={paymentEditorBusy}>
                    {paymentEditorBusy ? "Guardando..." : "Guardar cobranza"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {rentMetricModalKey && rentMetricModalConfig ? (
        <div className="modal-backdrop" onClick={() => setRentMetricModalKey(null)}>
          <div className="modal-panel modal-panel--wide" onClick={handleModalCardClick}>
            <div className="modal-panel__header">
              <div>
                <p className="eyebrow">{currentPeriodLabel}</p>
                <h2>{rentMetricModalConfig.title}</h2>
                <p className="modal-panel__copy">{rentMetricModalConfig.copy}</p>
              </div>
              <button
                className="secondary-button secondary-button--small"
                type="button"
                onClick={() => setRentMetricModalKey(null)}
              >
                Cerrar
              </button>
            </div>

            <section className="modal-highlight-grid">
              <article className="modal-highlight-card modal-highlight-card--primary">
                <span>Total del recuadro</span>
                <strong>{formatGs(rentMetricModalTotal, { maximumFractionDigits: 2 })}</strong>
                <p>{rentMetricModalRecords.length} movimientos encontrados</p>
              </article>

              <article className="modal-highlight-card">
                <span>Mes consultado</span>
                <strong>{currentPeriodLabel}</strong>
                <p>Detalle filtrado segun la tarjeta elegida</p>
              </article>
            </section>

            <div className="ledger-list">
              {rentMetricModalRecords.length > 0
                ? rentMetricModalRecords.map((record) => renderRentRow(record))
                : renderEmptyState("Sin movimientos", rentMetricModalConfig.emptyMessage)}
            </div>
          </div>
        </div>
      ) : null}

      {expenseMetricModalKey && expenseMetricModalConfig ? (
        <div className="modal-backdrop" onClick={() => setExpenseMetricModalKey(null)}>
          <div className="modal-panel modal-panel--wide" onClick={handleModalCardClick}>
            <div className="modal-panel__header">
              <div>
                <p className="eyebrow">{currentPeriodLabel}</p>
                <h2>{expenseMetricModalConfig.title}</h2>
                <p className="modal-panel__copy">{expenseMetricModalConfig.copy}</p>
              </div>
              <button
                className="secondary-button secondary-button--small"
                type="button"
                onClick={() => setExpenseMetricModalKey(null)}
              >
                Cerrar
              </button>
            </div>

            <section className="modal-highlight-grid">
              <article className="modal-highlight-card modal-highlight-card--primary">
                <span>Total del recuadro</span>
                <strong>{formatGs(expenseMetricModalTotal, { maximumFractionDigits: 2 })}</strong>
                <p>{expenseMetricModalRecords.length} movimientos encontrados</p>
              </article>

              <article className="modal-highlight-card">
                <span>Mes consultado</span>
                <strong>{currentPeriodLabel}</strong>
                <p>Detalle filtrado segun la tarjeta elegida</p>
              </article>
            </section>

            <div className="ledger-list">
              {expenseMetricModalRecords.length > 0
                ? expenseMetricModalRecords.map((record) => renderExpenseRow(record))
                : renderEmptyState("Sin movimientos", expenseMetricModalConfig.emptyMessage)}
            </div>
          </div>
        </div>
      ) : null}

      {expenseEditorOpen && expenseForm ? (
        <div className="modal-backdrop" onClick={closeExpenseEditor}>
          <div className="modal-panel" onClick={handleModalCardClick}>
            <div className="modal-panel__header">
              <div>
                <p className="eyebrow">Gastos del edificio</p>
                <h2>{expenseEditorExisting ? "Editar gasto manual" : "Cargar gasto manual"}</h2>
              </div>
              <button className="secondary-button secondary-button--small" type="button" onClick={closeExpenseEditor}>
                Cerrar
              </button>
            </div>

            <form className="editor-form" onSubmit={handleSaveExpense}>
              <section className="editor-form__section">
                <div className="editor-form__section-head">
                  <div>
                    <p className="eyebrow">Base del gasto</p>
                    <h3>Concepto y categoria</h3>
                  </div>
                  <p className="editor-form__section-copy">
                    Carga aqui los gastos propios del edificio como limpieza, luz, contador,
                    administrador o mantenimiento.
                  </p>
                </div>

                <div className="editor-grid">
                  <label className="search-field auth-form__field">
                    <span>Mes del gasto</span>
                    <AppSelect
                      value={expenseForm.period}
                      ariaLabel="Mes del gasto"
                      options={periodOptions.map((period) => ({
                        value: period,
                        label: formatPeriodLabel(period),
                      }))}
                      onChange={(value) =>
                        setExpenseForm((current) =>
                          current ? { ...current, period: value } : current,
                        )
                      }
                    />
                  </label>

                  <label className="search-field auth-form__field">
                    <span>Categoria</span>
                    <AppSelect
                      value={expenseForm.category}
                      ariaLabel="Categoria"
                      options={expenseCategoryOptions.map((option) => ({
                        value: option.value,
                        label: option.label,
                      }))}
                      onChange={(value) =>
                        setExpenseForm((current) =>
                          current
                            ? { ...current, category: value as ExpenseCategory }
                            : current,
                        )
                      }
                    />
                  </label>
                </div>

                <label className="search-field auth-form__field">
                  <span>Concepto principal</span>
                  <input
                    type="text"
                    value={expenseForm.title}
                    onChange={(event) =>
                      setExpenseForm((current) =>
                        current ? { ...current, title: event.target.value } : current,
                      )
                    }
                    placeholder="Ej.: Factura de luz de areas comunes"
                  />
                </label>
              </section>

              <section className="editor-form__section">
                <div className="editor-form__section-head">
                  <div>
                    <p className="eyebrow">Monto y estado</p>
                    <h3>Seguimiento del pago</h3>
                  </div>
                  <p className="editor-form__section-copy">
                    Puedes dejarlo pendiente o marcarlo como pagado cuando corresponda.
                  </p>
                </div>

                <div className="editor-grid">
                  <label className="search-field auth-form__field">
                    <span>Monto del gasto (Gs.)</span>
                    <input
                      type="number"
                      min="0"
                      step="1000"
                      value={expenseForm.amount}
                      onChange={(event) =>
                        setExpenseForm((current) =>
                          current ? { ...current, amount: event.target.value } : current,
                        )
                      }
                    />
                  </label>

                  <label className="search-field auth-form__field">
                    <span>Fecha de vencimiento</span>
                    <input
                      type="date"
                      value={expenseForm.dueDate}
                      onChange={(event) =>
                        setExpenseForm((current) =>
                          current ? { ...current, dueDate: event.target.value } : current,
                        )
                      }
                    />
                  </label>
                </div>

                <label className="search-field auth-form__field">
                  <span>Fecha de pago</span>
                  <input
                    type="date"
                    value={expenseForm.paidAt}
                    onChange={(event) =>
                      setExpenseForm((current) =>
                        current ? { ...current, paidAt: event.target.value } : current,
                      )
                    }
                  />
                </label>

                <label className="search-field auth-form__field">
                  <span>Notas internas</span>
                  <textarea
                    value={expenseForm.notes}
                    onChange={(event) =>
                      setExpenseForm((current) =>
                        current ? { ...current, notes: event.target.value } : current,
                      )
                    }
                    placeholder="Ej.: factura, proveedor, observaciones o acuerdo de pago."
                  />
                </label>
              </section>

              {renderAuditHistory("Ultimos movimientos de este gasto", expenseEditorHistory)}

              {expenseEditorError ? <p className="form-error">{expenseEditorError}</p> : null}

              <div className="modal-panel__actions">
                <button className="secondary-button" type="button" onClick={closeExpenseEditor}>
                  Cancelar
                </button>
                <button className="primary-button" type="submit" disabled={expenseEditorBusy}>
                  {expenseEditorBusy ? "Guardando..." : "Guardar gasto"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
