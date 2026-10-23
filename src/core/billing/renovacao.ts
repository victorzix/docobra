import { MS_POR_DIA } from "@/lib/permissoes/janela";
import type { PlanoCobravel } from "./upgrade";

export const ANTECEDENCIA_RENOVACAO_DIAS_PADRAO = 5;

export function proximoVencimento(venceEm: Date, cicloDias: number): Date {
  return new Date(venceEm.getTime() + cicloDias * MS_POR_DIA);
}

export function dataDeGeracaoDaRenovacao(
  venceEm: Date,
  antecedenciaDias: number = ANTECEDENCIA_RENOVACAO_DIAS_PADRAO,
): Date {
  return new Date(venceEm.getTime() - antecedenciaDias * MS_POR_DIA);
}

export function valorDaRenovacaoCentavos(plano: Pick<PlanoCobravel, "precoCentavos">): number {
  return plano.precoCentavos;
}
