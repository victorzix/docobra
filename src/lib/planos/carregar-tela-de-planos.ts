import { ANTECEDENCIA_RENOVACAO_DIAS_PADRAO } from "@/core/billing/renovacao";
import { simularUpgrade } from "@/core/billing/upgrade";
import { buscarAssinaturaVigente, type AssinaturaVigente } from "@/db/queries/assinatura";
import { buscarPlanoDoCatalogo, listarPlanosPublicos, type PlanoDoCatalogo, type PlanoPublico } from "@/db/queries/plano";
import { valorMinimoDoAmbiente } from "@/lib/pagamentos/iniciar-cobranca";
import { MS_POR_DIA } from "@/lib/permissoes/janela";
import { derivarStatus, type StatusEfetivo } from "@/lib/permissoes/status-assinatura";
import { descreverLimitesDoPlano } from "./descrever-limites";

export type AcaoDoPlano = "assinar" | "renovar" | "upgrade" | "suporte" | "atual";

export interface PlanoDaTela {
  chave: string;
  nome: string;
  precoCentavos: number;
  cicloDias: number;
  limites: string[];
  acao: AcaoDoPlano;
  valorUpgradeCentavos: number | null;
}

export interface AssinaturaDaTela {
  planoNome: string;
  status: StatusEfetivo;
  venceEm: string;
  diasRestantes: number;
}

export interface TelaDePlanos {
  assinatura: AssinaturaDaTela;
  planos: PlanoDaTela[];
}

interface Contexto {
  vigente: AssinaturaVigente;
  atual: PlanoDoCatalogo;
  status: StatusEfetivo;
  diasRestantes: number;
  agora: Date;
  valorMinimoCentavos: number;
}

// Espelha as regras de `iniciarCobranca`: o que a tela oferece é o que a rota aceita.
function decidirAcao(destino: PlanoPublico, c: Contexto): Pick<PlanoDaTela, "acao" | "valorUpgradeCentavos"> {
  const sem = (acao: AcaoDoPlano) => ({ acao, valorUpgradeCentavos: null });

  const assinaturaPaga = c.vigente.status === "ativa" && (c.status === "ativa" || c.status === "carencia");
  if (!assinaturaPaga) return sem("assinar");

  if (destino.chave === c.atual.chave) {
    // Renovar antes da janela emendaria um ciclo pago sobre outro sem necessidade.
    const naJanela = c.status === "carencia" || c.diasRestantes <= ANTECEDENCIA_RENOVACAO_DIAS_PADRAO;
    return sem(naJanela ? "renovar" : "atual");
  }

  if (c.status === "ativa") {
    const simulacao = simularUpgrade({ atual: c.atual, destino, venceEm: c.vigente.venceEm, agora: c.agora });
    if (simulacao.ok) {
      return { acao: "upgrade", valorUpgradeCentavos: Math.max(simulacao.valorCentavos, c.valorMinimoCentavos) };
    }
  }
  return sem("suporte");
}

export async function carregarTelaDePlanos(empresaId: string, agora: Date = new Date()): Promise<TelaDePlanos | null> {
  const vigente = await buscarAssinaturaVigente(empresaId);
  if (!vigente) return null;

  const [atual, publicos] = await Promise.all([buscarPlanoDoCatalogo(vigente.planoChave), listarPlanosPublicos()]);
  const status = derivarStatus(vigente, agora);
  const diasRestantes = Math.max(0, Math.ceil((vigente.venceEm.getTime() - agora.getTime()) / MS_POR_DIA));
  const contexto: Contexto = {
    vigente,
    atual: atual as PlanoDoCatalogo,
    status,
    diasRestantes,
    agora,
    valorMinimoCentavos: valorMinimoDoAmbiente(),
  };

  return {
    assinatura: { planoNome: contexto.atual.nome, status, venceEm: vigente.venceEm.toISOString(), diasRestantes },
    planos: publicos.map((p) => ({
      chave: p.chave,
      nome: p.nome,
      precoCentavos: p.precoCentavos,
      cicloDias: p.cicloDias,
      limites: descreverLimitesDoPlano(p.permissoes),
      ...decidirAcao(p, contexto),
    })),
  };
}
