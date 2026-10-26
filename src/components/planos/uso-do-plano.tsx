"use client";

import { BarraDeUso } from "@/components/common/barra-de-uso";
import { usePermissoes } from "@/hooks/use-permissoes";
import { descreverUso } from "@/lib/permissoes/descrever-uso";
import type { PermissoesDaEmpresa } from "@/lib/permissoes/permissoes-da-empresa";
import type { PermissaoDeUso } from "@/lib/permissoes/permissoes-de-uso";

const LINHAS: { chave: PermissaoDeUso; titulo: string; unidade: string }[] = [
  { chave: "memorial.gerar", titulo: "Memoriais descritivos", unidade: "memoriais" },
  { chave: "comunique-se.processar", titulo: "Análises de Comunique-se", unidade: "análises" },
  { chave: "projetos.criar", titulo: "Projetos", unidade: "projetos" },
];

export function UsoDoPlano({ permissoesIniciais }: { permissoesIniciais: PermissoesDaEmpresa }) {
  const { data } = usePermissoes(permissoesIniciais);
  const permissoes = data ?? permissoesIniciais;
  const audio = permissoes["memorial.audio"];

  return (
    <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
      {LINHAS.map(({ chave, titulo, unidade }) => {
        const uso = descreverUso(permissoes[chave], unidade);
        const bloqueado = uso.estado === "estourado" || uso.estado === "negado";
        return (
          <div key={chave} className="grid gap-1.5">
            <span className="text-sm font-medium">{titulo}</span>
            <span className={bloqueado ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
              {uso.texto}
            </span>
            {uso.percentual !== null && <BarraDeUso estado={uso.estado} percentual={uso.percentual} className="w-full" />}
          </div>
        );
      })}
      <div className="grid gap-1.5">
        <span className="text-sm font-medium">Memorial por áudio</span>
        <span className={audio.permitido ? "text-sm text-muted-foreground" : "text-sm text-destructive"}>
          {audio.permitido ? "Incluído no seu plano" : "Não incluído no seu plano"}
        </span>
      </div>
    </div>
  );
}
