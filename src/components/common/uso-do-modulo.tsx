"use client";

import Link from "next/link";
import { BarraDeUso } from "@/components/common/barra-de-uso";
import { Button } from "@/components/ui/button";
import { usePermissoes } from "@/hooks/use-permissoes";
import { descreverUso } from "@/lib/permissoes/descrever-uso";
import type { PermissoesDaEmpresa } from "@/lib/permissoes/permissoes-da-empresa";
import type { PermissaoDeUso } from "@/lib/permissoes/permissoes-de-uso";

interface UsoDoModuloProps {
  chave: PermissaoDeUso;
  unidade: string;
  permissoesIniciais: PermissoesDaEmpresa;
}

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
          <BarraDeUso estado={uso.estado} percentual={uso.percentual} />
        )}
      </div>
      {bloqueado && (
        <Button asChild variant="outline" size="sm">
          <Link href="/dashboard/configuracoes/assinatura">Ver planos</Link>
        </Button>
      )}
    </div>
  );
}
