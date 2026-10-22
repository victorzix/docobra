import { PERMISSOES_DE_USO, type PermissaoDeUso } from "./permissoes-de-uso";
import { verificarPermissao } from "./verificar-permissao";

export interface PermissaoSerializada {
  permitido: boolean;
  limite: number | null;
  usado: number;
  restante: number | null;
  renovaEm: string | null;
}

export type PermissoesDaEmpresa = Record<PermissaoDeUso, PermissaoSerializada>;

export async function carregarPermissoesDaEmpresa(
  empresaId: string,
  agora: Date = new Date(),
): Promise<PermissoesDaEmpresa> {
  const resultados = await Promise.all(
    PERMISSOES_DE_USO.map((chave) => verificarPermissao(empresaId, chave, agora)),
  );

  const entradas = PERMISSOES_DE_USO.map((chave, indice) => {
    const resultado = resultados[indice];
    const serializada: PermissaoSerializada = {
      permitido: resultado.permitido,
      limite: resultado.limite,
      usado: resultado.usado,
      restante: resultado.restante,
      renovaEm: resultado.janela ? resultado.janela.fim.toISOString() : null,
    };
    return [chave, serializada] as const;
  });

  return Object.fromEntries(entradas) as PermissoesDaEmpresa;
}
