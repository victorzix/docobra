"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { usePermissoes } from "@/hooks/use-permissoes";
import { descreverUso, type EstadoUso } from "@/lib/permissoes/descrever-uso";
import type { PermissoesDaEmpresa } from "@/lib/permissoes/permissoes-da-empresa";
import type { PermissaoDeUso } from "@/lib/permissoes/permissoes-de-uso";

interface UsoDoModuloProps {
  chave: PermissaoDeUso;
  unidade: string;
  permissoesIniciais: PermissoesDaEmpresa;
}

const COR_DA_BARRA: Record<EstadoUso, string> = {
  ilimitado: "bg-primary",
  normal: "bg-primary",
  perto: "bg-amber-500",
  estourado: "bg-destructive",
  negado: "bg-destructive",
};

export function UsoDoModulo({ chave, unidade, permissoesIniciais }: UsoDoModuloProps) {
  const { data } = usePermissoes(permissoesIniciais);
  const permissao = (data ?? permissoesIniciais)[chave];
  const uso = descreverUso(permissao, unidade);
  const bloqueado = uso.estado === "estourado" || uso.estado === "negado";

  return (
    <div className="flex items-center gap-3 text-sm">
      <div className="grid gap-1">
        <span className={bloqueado ? "font-medium text-destructive" : "text-muted-foreground"}>{uso.texto}</span>
        {uso.percentual !== null && (
          <div className="h-1.5 w-40 overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full transition-[width] ${COR_DA_BARRA[uso.estado]}`}
              style={{ width: `${uso.percentual}%` }}
            />
          </div>
        )}
      </div>
      {bloqueado && (
        <Button asChild variant="outline" size="sm">
          <Link href="/dashboard/planos">Ver planos</Link>
        </Button>
      )}
    </div>
  );
}
