export type UnitState = "al dia" | "con saldo" | "mantenimiento" | "disponible";
export type MetricTone = "sun" | "clay" | "mint" | "ink";
export type CollectionState = "pendiente" | "pagado" | "negociar";
export type IncidentPriority = "alta" | "media" | "baja";
export type IncidentStatus = "abierta" | "en proceso" | "resuelta";
export type SpaceType = "departamento" | "salon" | "terraza";
export type SpaceStatus = "alquilado" | "accionista" | "disponible" | "uso exclusivo";
export type PaymentMethod = "efectivo" | "transferencia" | "cheque";
export type ExpenseCategory =
  | "limpieza"
  | "luz"
  | "contador"
  | "administrador"
  | "mantenimiento"
  | "iva"
  | "otro";
export type ExpenseSource = "manual" | "iva";
export type ExpenseStatus = "pendiente" | "pagado";
export type RentPaymentStatus =
  | "pendiente"
  | "por vencer"
  | "vencido"
  | "pagado"
  | "sin vencimiento";

export type ViewKey = "inicio" | "cobranzas" | "gastos" | "inquilinos" | "mapa";

export interface BuildingProfile {
  name: string;
  address: string;
  neighborhood: string;
  manager: string;
  currentPeriod: string;
  collectionGoal: string;
}

export interface DashboardMetric {
  label: string;
  value: string;
  hint: string;
  tone: MetricTone;
}

export interface UnitRecord {
  id: string;
  resident: string;
  floor: string;
  area: string;
  balance: string;
  lastPayment: string;
  state: UnitState;
  notes: string;
}

export interface CollectionRecord {
  resident: string;
  concept: string;
  amount: string;
  dueDate: string;
  state: CollectionState;
}

export interface IncidentRecord {
  title: string;
  zone: string;
  priority: IncidentPriority;
  status: IncidentStatus;
  updatedAt: string;
}

export interface AnnouncementRecord {
  title: string;
  summary: string;
  audience: string;
}

export interface PersonRecord {
  id: string;
  firstName: string;
  lastName: string;
  documentId: string;
}

export interface PaymentResponsible {
  displayName: string;
  firstName: string;
  lastName: string;
  documentId: string;
  taxId: string;
  nis: string;
  meterNumber: string;
}

export interface BuildingSpace {
  id: string;
  code: string;
  displayName: string;
  alias: string;
  type: SpaceType;
  status: SpaceStatus;
  level: string;
  zone: string;
  rentable: boolean;
  sortOrder: number;
  monthlyRent: number;
  hasParking: boolean;
  parkingFee: number;
  dueDay: string;
  nextDueDate: string;
  lastPaidPeriod: string;
  paymentResponsible: PaymentResponsible;
  additionalOccupants: PersonRecord[];
  notes: string;
}

export interface RentLedgerRecord {
  id: string;
  spaceId: string;
  period: string;
  chargeAmount: number;
  dueDate: string;
  paidAt: string;
  paymentMethod: PaymentMethod | "";
  receivedAmount: number;
  taxExpenseAmount: number;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExpenseRecord {
  id: string;
  period: string;
  source: ExpenseSource;
  category: ExpenseCategory;
  title: string;
  amount: number;
  dueDate: string;
  paidAt: string;
  linkedRentId: string;
  linkedSpaceId: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuditLogRecord {
  id: string;
  entityType: "space" | "rent" | "expense";
  entityId: string;
  spaceId: string;
  actorUid: string;
  actorEmail: string;
  action: string;
  summary: string;
  createdAt: string;
}

export interface BuildingSnapshot {
  profile: BuildingProfile;
  metrics: DashboardMetric[];
  spaces: BuildingSpace[];
  rentLedger: RentLedgerRecord[];
  expenses: ExpenseRecord[];
  auditLog: AuditLogRecord[];
  units: UnitRecord[];
  collections: CollectionRecord[];
  incidents: IncidentRecord[];
  announcements: AnnouncementRecord[];
  agenda: string[];
}
