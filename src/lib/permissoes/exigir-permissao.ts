import { NextResponse } from "next/server";

import { ROTULOS_DE_USO, type PermissaoDeUso } from "./permissoes-de-uso";
import { verificarPermissao } from "./verificar-permissao";

export type CodigoBloqueio = "LIMITE_ATINGIDO" | "PERMISSAO_NEGADA";

export interface CorpoBloqueio {
  error: string;
  codigo: CodigoBloqueio;
  permissao: PermissaoDeUso;
  renovaEm: string | null;
}

function formatarData(data: Date): string {
  return data.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

export async function exigirPermissao(
  empresaId: string,
  chave: PermissaoDeUso,
  agora: Date = new Date(),
): Promise<NextResponse<CorpoBloqueio> | null> {
  const resultado = await verificarPermissao(empresaId, chave, agora);
  if (resultado.permitido) return null;

  const rotulo = ROTULOS_DE_USO[chave];
  const renovaEm = resultado.janela?.fim ?? null;

  const corpo: CorpoBloqueio =
    resultado.limite !== null
      ? {
          error: `Você atingiu o limite do seu plano para ${rotulo}.${
            renovaEm ? ` A cota renova em ${formatarData(renovaEm)}.` : ""
          }`,
          codigo: "LIMITE_ATINGIDO",
          permissao: chave,
          renovaEm: renovaEm?.toISOString() ?? null,
        }
      : {
          error: `Seu plano não inclui ${rotulo}.`,
          codigo: "PERMISSAO_NEGADA",
          permissao: chave,
          renovaEm: null,
        };

  return NextResponse.json(corpo, { status: 403 });
}
