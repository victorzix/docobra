import { MS_POR_DIA } from "@/lib/permissoes/janela";

export interface PlanoCobravel {
  chave: string;
  nivel: number;
  cicloDias: number;
  precoCentavos: number;
}

export type MotivoRecusaUpgrade = "mesmo_plano" | "periodicidade_diferente" | "mesmo_nivel_ou_menor";

export type SimulacaoUpgrade =
  | { ok: true; valorCentavos: number; diasRestantes: number }
  | { ok: false; motivo: MotivoRecusaUpgrade | "ciclo_vencido" };

export function diasRestantesNoCiclo(venceEm: Date, agora: Date, cicloDias: number): number {
  const dias = Math.ceil((venceEm.getTime() - agora.getTime()) / MS_POR_DIA);
  return Math.min(cicloDias, Math.max(0, dias));
}

export function valorDoUpgradeCentavos({
  precoAtualCentavos,
  precoNovoCentavos,
  cicloDias,
  diasRestantes,
}: {
  precoAtualCentavos: number;
  precoNovoCentavos: number;
  cicloDias: number;
  diasRestantes: number;
}): number {
  const numerador = (precoNovoCentavos - precoAtualCentavos) * diasRestantes;
  // Meio centavo sobe, em aritmética inteira: dividir em ponto flutuante poderia errar o meio.
  return Math.floor((2 * numerador + cicloDias) / (2 * cicloDias));
}

export function avaliarUpgrade(
  atual: PlanoCobravel,
  destino: PlanoCobravel,
): { permitido: true } | { permitido: false; motivo: MotivoRecusaUpgrade } {
  if (atual.chave === destino.chave) return { permitido: false, motivo: "mesmo_plano" };
  if (atual.cicloDias !== destino.cicloDias) return { permitido: false, motivo: "periodicidade_diferente" };
  if (destino.nivel <= atual.nivel) return { permitido: false, motivo: "mesmo_nivel_ou_menor" };
  return { permitido: true };
}

export function simularUpgrade({
  atual,
  destino,
  venceEm,
  agora,
}: {
  atual: PlanoCobravel;
  destino: PlanoCobravel;
  venceEm: Date;
  agora: Date;
}): SimulacaoUpgrade {
  const avaliacao = avaliarUpgrade(atual, destino);
  if (!avaliacao.permitido) return { ok: false, motivo: avaliacao.motivo };
  if (agora.getTime() >= venceEm.getTime()) return { ok: false, motivo: "ciclo_vencido" };

  const diasRestantes = diasRestantesNoCiclo(venceEm, agora, atual.cicloDias);
  const valorCentavos = valorDoUpgradeCentavos({
    precoAtualCentavos: atual.precoCentavos,
    precoNovoCentavos: destino.precoCentavos,
    cicloDias: atual.cicloDias,
    diasRestantes,
  });

  return { ok: true, valorCentavos, diasRestantes };
}
