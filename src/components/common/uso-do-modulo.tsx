"use client";

import { Button } from "@/components/ui/button";
import { usePermissoes } from "@/hooks/use-permissoes";
import { descreverUso, montarMailtoSuporte, type EstadoUso } from "@/lib/permissoes/descrever-uso";
import type { ContatoSuporte } from "@/lib/permissoes/contexto-de-planos";
import type { PermissoesDaEmpresa } from "@/lib/permissoes/permissoes-da-empresa";
import { ROTULOS_DE_USO, type PermissaoDeUso } from "@/lib/permissoes/permissoes-de-uso";

interface UsoDoModuloProps {
  chave: PermissaoDeUso;
  unidade: string;
  permissoesIniciais: PermissoesDaEmpresa;
  contatoSuporte: ContatoSuporte;
}

const COR_DA_BARRA: Record<EstadoUso, string> = {
  ilimitado: "bg-primary",
  normal: "bg-primary",
  perto: "bg-amber-500",
  estourado: "bg-destructive",
  negado: "bg-destructive",
};

export function UsoDoModulo({ chave, unidade, permissoesIniciais, contatoSuporte }: UsoDoModuloProps) {
  const { data } = usePermissoes(permissoesIniciais);
  const permissao = (data ?? permissoesIniciais)[chave];
  const uso = descreverUso(permissao, unidade);
  const bloqueado = uso.estado === "estourado" || uso.estado === "negado";

  const motivo =
    uso.estado === "negado"
      ? `Quero ter acesso a: ${ROTULOS_DE_USO[chave]}`
      : `Atingi o limite do plano para ${ROTULOS_DE_USO[chave]}`;

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
      {bloqueado && contatoSuporte.email && (
        <Button asChild variant="outline" size="sm">
          <a
            href={montarMailtoSuporte({
              email: contatoSuporte.email,
              empresaNome: contatoSuporte.empresaNome,
              planoChave: contatoSuporte.planoChave,
              motivo,
            })}
          >
            Falar com o suporte
          </a>
        </Button>
      )}
    </div>
  );
}
