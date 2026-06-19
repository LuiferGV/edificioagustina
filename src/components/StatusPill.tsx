interface StatusPillProps {
  value: string;
}

const toneByValue: Record<string, string> = {
  "al dia": "pill--mint",
  "con saldo": "pill--clay",
  mantenimiento: "pill--ink",
  pendiente: "pill--clay",
  "por vencer": "pill--sun",
  vencido: "pill--clay",
  pagado: "pill--mint",
  "sin vencimiento": "pill--ink",
  negociar: "pill--sun",
  alta: "pill--clay",
  media: "pill--sun",
  baja: "pill--mint",
  abierta: "pill--clay",
  "en proceso": "pill--sun",
  resuelta: "pill--mint",
  alquilado: "pill--mint",
  Alquilado: "pill--mint",
  accionista: "pill--sun",
  disponible: "pill--ink",
  Disponible: "pill--ink",
  "uso exclusivo": "pill--clay",
  "No se alquila": "pill--sun",
};

export function StatusPill({ value }: StatusPillProps) {
  return <span className={`pill ${toneByValue[value] ?? "pill--ink"}`}>{value}</span>;
}
