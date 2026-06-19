import type {
  BuildingSpace,
  CollectionRecord,
  DashboardMetric,
  PaymentResponsible,
  UnitRecord,
  UnitState,
} from "../types/building";

const gsFormatter = new Intl.NumberFormat("es-PY");

export const buildingLevelOrder = [
  "Fachada",
  "Planta Baja",
  "Piso 1",
  "Piso 2",
  "Piso 3",
  "Piso 4",
] as const;

export function formatResponsibleName(responsible: PaymentResponsible): string {
  const fullName = `${responsible.firstName} ${responsible.lastName}`.trim();
  return responsible.displayName.trim() || fullName || "Sin ocupante asignado";
}

export function isNotForRent(space: BuildingSpace): boolean {
  return space.status === "accionista" || space.status === "uso exclusivo" || !space.rentable;
}

export function getSpaceStatusLabel(space: BuildingSpace): string {
  if (isNotForRent(space)) {
    return "No se alquila";
  }

  if (space.status === "disponible") {
    return "Disponible";
  }

  return "Alquilado";
}

export function getSpaceChargeLabel(space: BuildingSpace): string {
  if (isNotForRent(space)) {
    return "Sin cobro";
  }

  return space.monthlyRent > 0 ? formatGs(space.monthlyRent) : "Gs. 0";
}

function getResponsibleName(space: BuildingSpace): string {
  return formatResponsibleName(space.paymentResponsible);
}

function mapSpaceToUnitState(space: BuildingSpace): UnitState {
  if (space.status === "disponible") {
    return "disponible";
  }

  if (space.status === "uso exclusivo") {
    return "mantenimiento";
  }

  if (space.status === "accionista") {
    return "al dia";
  }

  return space.dueDay ? "al dia" : "con saldo";
}

export function formatGs(
  value: number,
  options?: {
    maximumFractionDigits?: number;
    minimumFractionDigits?: number;
  },
): string {
  const normalizedValue = Number.isFinite(value) ? Math.max(0, value) : 0;

  if (!options) {
    return `Gs. ${gsFormatter.format(Math.round(normalizedValue))}`;
  }

  const formatter = new Intl.NumberFormat("es-PY", {
    minimumFractionDigits: options.minimumFractionDigits ?? 0,
    maximumFractionDigits: options.maximumFractionDigits ?? 0,
  });

  return `Gs. ${formatter.format(normalizedValue)}`;
}

export function sortSpaces(spaces: BuildingSpace[]): BuildingSpace[] {
  return [...spaces].sort((left, right) => {
    const leftIndex = buildingLevelOrder.indexOf(left.level as (typeof buildingLevelOrder)[number]);
    const rightIndex = buildingLevelOrder.indexOf(right.level as (typeof buildingLevelOrder)[number]);

    if (leftIndex !== rightIndex) {
      return leftIndex - rightIndex;
    }

    return left.sortOrder - right.sortOrder;
  });
}

export function groupSpacesByLevel(spaces: BuildingSpace[]) {
  return buildingLevelOrder
    .map((level) => ({
      level,
      spaces: sortSpaces(spaces.filter((space) => space.level === level)),
    }))
    .filter((group) => group.spaces.length > 0);
}

export function buildMetricsFromSpaces(spaces: BuildingSpace[]): DashboardMetric[] {
  const rentableSpaces = spaces.filter((space) => space.rentable);
  const occupiedSpaces = rentableSpaces.filter((space) => space.status !== "disponible");
  const shareholderSpaces = spaces.filter((space) => space.status === "accionista");
  const exclusiveSpaces = spaces.filter((space) => space.status === "uso exclusivo");
  const chargedSpaces = rentableSpaces.filter(
    (space) => space.status === "alquilado" && space.monthlyRent > 0,
  );
  const totalIncome = chargedSpaces.reduce((sum, space) => sum + space.monthlyRent, 0);
  const missingDueDay = chargedSpaces.filter((space) => !space.dueDay.trim()).length;

  return [
    {
      label: "Espacios",
      value: `${occupiedSpaces.length}/${rentableSpaces.length}`,
      hint: `${chargedSpaces.length} con alquiler activo y ${shareholderSpaces.length} sin cobro`,
      tone: "sun",
    },
    {
      label: "Ingreso mensual",
      value: formatGs(totalIncome),
      hint: "Suma actual de alquileres cargados",
      tone: "clay",
    },
    {
      label: "Datos pendientes",
      value: `${missingDueDay}`,
      hint: "Espacios con alquiler sin vencimiento mensual definido",
      tone: "mint",
    },
    {
      label: "Uso exclusivo",
      value: `${exclusiveSpaces.length}`,
      hint: "Espacios reservados que no generan alquiler",
      tone: "ink",
    },
  ];
}

export function buildUnitsFromSpaces(spaces: BuildingSpace[]): UnitRecord[] {
  return sortSpaces(spaces)
    .filter((space) => space.type !== "terraza")
    .map((space) => ({
      id: space.displayName,
      resident: getResponsibleName(space),
      floor: space.level,
      area: space.zone,
      balance:
        space.status === "accionista" || space.status === "uso exclusivo"
          ? "No aplica"
          : formatGs(space.monthlyRent),
      lastPayment: space.nextDueDate || (space.dueDay ? `Dia ${space.dueDay}` : "-"),
      state: mapSpaceToUnitState(space),
      notes: space.notes || `Estado actual: ${space.status}.`,
    }));
}

export function buildCollectionsFromSpaces(spaces: BuildingSpace[]): CollectionRecord[] {
  return sortSpaces(spaces)
    .filter((space) => space.status === "alquilado" && space.monthlyRent > 0)
    .map((space) => ({
      resident: getResponsibleName(space),
      concept: `Alquiler ${space.displayName}`,
      amount: formatGs(space.monthlyRent),
      dueDate: space.nextDueDate || (space.dueDay ? `Dia ${space.dueDay}` : "Sin vencimiento"),
      state: space.dueDay ? "pendiente" : "negociar",
    }));
}

export function spacesToRecord(spaces: BuildingSpace[]): Record<string, BuildingSpace> {
  return sortSpaces(spaces).reduce<Record<string, BuildingSpace>>((accumulator, space) => {
    accumulator[space.id] = space;
    return accumulator;
  }, {});
}
