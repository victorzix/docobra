import type { EstadoUso } from "@/lib/permissoes/descrever-uso";

const COR_DA_BARRA: Record<EstadoUso, string> = {
  ilimitado: "bg-emerald-500",
  normal: "bg-emerald-500",
  perto: "bg-amber-500",
  estourado: "bg-destructive",
  negado: "bg-destructive",
};

interface BarraDeUsoProps {
  estado: EstadoUso;
  percentual: number;
  className?: string;
}

export function BarraDeUso({ estado, percentual, className = "w-40" }: BarraDeUsoProps) {
  return (
    <div className={`h-1.5 overflow-hidden rounded-full bg-muted ${className}`}>
      <div
        className={`h-full rounded-full transition-[width] ${COR_DA_BARRA[estado]}`}
        style={{ width: `${percentual}%` }}
      />
    </div>
  );
}
