import { ANTECEDENCIA_RENOVACAO_DIAS_PADRAO } from "@/core/billing/renovacao";
import { simularUpgrade } from "@/core/billing/upgrade";
import { buscarAssinaturaVigente, type AssinaturaVigente } from "@/db/queries/assinatura";
import {
  buscarLimitesDoPlano,
  buscarPlanoDoCatalogo,
  listarPlanosPublicos, type PlanoDoCatalogo, type PlanoPublico,
} from "@/db/queries/plano";
import { podeCancelarAssinatura } from "@/lib/pagamentos/cancelar-assinatura";
import { CICLO_MENSAL_DIAS } from "@/lib/pagamentos/ciclo-mensal";
import { valorMinimoDoAmbiente } from "@/lib/pagamentos/iniciar-cobranca";
import { derivarStatus, type StatusEfetivo } from "@/lib/permissoes/status-assinatura";
import { diasRestantesAte } from "./dias-restantes";
import { descreverLimitesDoPlano } from "./descrever-limites";

export type AcaoDoPlano = "assinar" | "renovar" | "upgrade" | "downgrade" | "suporte" | "atual" | "reativar" | "em_breve";

export interface PlanoDaTela {
  chave: string;
  nome: string;
  precoCentavos: number;
  cicloDias: number;
  limites: string[];
  ehAtual: boolean;
  acao: AcaoDoPlano;
  valorUpgradeCentavos: number | null;
}

export interface AssinaturaDaTela {
  planoNome: string;
  ehTrial: boolean;
  status: StatusEfetivo;
  venceEm: string;
  diasRestantes: number;
  podeCancelar: boolean;
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

  if (destino.cicloDias !== CICLO_MENSAL_DIAS && destino.chave !== c.atual.chave) return sem("em_breve");

  if (c.vigente.status === "cancelada" && c.status === "cancelada" && destino.chave === c.atual.chave) {
    return sem("reativar");
  }

  const assinaturaPaga = c.vigente.status === "ativa" && (c.status === "ativa" || c.status === "carencia");
  if (!assinaturaPaga) return sem("assinar");

  if (destino.chave === c.atual.chave) {
    // Renovar antes da janela emendaria um ciclo pago sobre outro sem necessidade.
    const naJanela = c.status === "carencia" || c.diasRestantes <= ANTECEDENCIA_RENOVACAO_DIAS_PADRAO;
    return sem(naJanela ? "renovar" : "atual");
  }

  if (destino.nivel < c.atual.nivel) return sem("downgrade");

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
  const diasRestantes = diasRestantesAte(vigente.venceEm, agora);
  const contexto: Contexto = {
    vigente,
    atual: atual as PlanoDoCatalogo,
    status,
    diasRestantes,
    agora,
    valorMinimoCentavos: valorMinimoDoAmbiente(),
  };

  const planos: PlanoDaTela[] = publicos.map((p) => ({
    chave: p.chave,
    nome: p.nome,
    precoCentavos: p.precoCentavos,
    cicloDias: p.cicloDias,
    limites: descreverLimitesDoPlano(p.permissoes),
    ehAtual: p.chave === contexto.atual.chave,
    ...decidirAcao(p, contexto),
  }));

  // Teste gratuito e planos internos não são vendidos, mas o cliente precisa se ver na lista.
  if (!planos.some((p) => p.ehAtual)) {
    planos.unshift({
      chave: contexto.atual.chave,
      nome: contexto.atual.chave === "trial" ? "Teste gratuito" : contexto.atual.nome,
      precoCentavos: contexto.atual.precoCentavos,
      cicloDias: contexto.atual.cicloDias,
      limites: descreverLimitesDoPlano(await buscarLimitesDoPlano(contexto.atual.id)),
      ehAtual: true,
      acao: "atual",
      valorUpgradeCentavos: null,
    });
  }

  return {
    assinatura: {
      planoNome: contexto.atual.nome,
      ehTrial: contexto.atual.chave === "trial",
      status,
      venceEm: vigente.venceEm.toISOString(),
      diasRestantes,
      podeCancelar: podeCancelarAssinatura(vigente, agora),
    },
    planos,
  };
}
