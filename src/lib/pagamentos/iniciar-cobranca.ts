import { and, asc, eq } from "drizzle-orm";

import { simularUpgrade, type MotivoRecusaUpgrade } from "@/core/billing/upgrade";
import { pagamentoRouter } from "@/core/payments";
import { FalhaIncertaError } from "@/core/payments/erros";
import type { PaymentRouter } from "@/core/payments/router";
import type { PaymentProvider } from "@/core/payments/types";
import { db } from "@/db";
import { buscarAssinaturaVigente, type AssinaturaVigente } from "@/db/queries/assinatura";
import { buscarProviderClienteId, salvarProviderClienteId } from "@/db/queries/cliente-gateway";
import {
  buscarCobrancaPendenteReutilizavel,
  criarCobrancaPendente,
  registrarCobrancaNoGateway,
  type Cobranca,
} from "@/db/queries/cobranca";
import { buscarPlanoDoCatalogo, type PlanoDoCatalogo } from "@/db/queries/plano";
import { empresa, usuario, type TipoCobranca } from "@/db/schema";
import { MS_POR_DIA } from "@/lib/permissoes/janela";
import { derivarStatus, type StatusEfetivo } from "@/lib/permissoes/status-assinatura";

export const VENCIMENTO_DIAS_ASSINATURA_E_UPGRADE = 3;
export const VALOR_MINIMO_PADRAO_CENTAVOS = 500;

const ROTULO_DO_TIPO: Record<TipoCobranca, string> = {
  assinatura: "assinatura",
  upgrade: "upgrade",
  renovacao: "renovação",
};

const MENSAGEM_DO_MOTIVO: Record<MotivoRecusaUpgrade | "ciclo_vencido", string> = {
  mesmo_plano: "Você já está nesse plano.",
  periodicidade_diferente: "A troca entre plano mensal e anual é feita pelo suporte.",
  mesmo_nivel_ou_menor: "Só é possível trocar para um plano de nível maior; para reduzir, fale com o suporte.",
  preco_nao_maior: "Esse plano não custa mais que o atual; fale com o suporte para a troca.",
  ciclo_vencido: "Seu ciclo venceu: renove antes de trocar de plano.",
};

export class DocumentoAusenteError extends Error {
  constructor() {
    super("Informe o CPF ou CNPJ da empresa antes de gerar a cobrança.");
    this.name = "DocumentoAusenteError";
  }
}

export class CobrancaNaoPermitidaError extends Error {
  constructor(
    public readonly motivo: string,
    mensagem: string,
  ) {
    super(mensagem);
    this.name = "CobrancaNaoPermitidaError";
  }
}

export function valorMinimoDoAmbiente(env: NodeJS.ProcessEnv = process.env): number {
  const bruto = Number(env.PAGAMENTO_VALOR_MINIMO_CENTAVOS);
  return Number.isInteger(bruto) && bruto > 0 ? bruto : VALOR_MINIMO_PADRAO_CENTAVOS;
}

const emDias = (base: Date, dias: number) => new Date(base.getTime() + dias * MS_POR_DIA);

interface Contexto {
  vigente: AssinaturaVigente;
  atual: PlanoDoCatalogo;
  statusEfetivo: StatusEfetivo;
  destinoSolicitado: PlanoDoCatalogo | null;
  agora: Date;
  valorMinimoCentavos: number;
}

interface Planejamento {
  destino: PlanoDoCatalogo;
  valorCentavos: number;
  venceEm: Date;
}

function exigirPlanoPublico(destino: PlanoDoCatalogo | null): PlanoDoCatalogo {
  if (!destino) throw new CobrancaNaoPermitidaError("plano_inexistente", "Plano não encontrado.");
  if (!destino.ativo || destino.interno || destino.precoCentavos <= 0) {
    throw new CobrancaNaoPermitidaError("plano_indisponivel", "Esse plano não está disponível para contratação.");
  }
  return destino;
}

function planejar(tipo: TipoCobranca, c: Contexto): Planejamento {
  if (tipo === "renovacao") {
    const renovavel =
      c.vigente.status === "ativa" && (c.statusEfetivo === "ativa" || c.statusEfetivo === "carencia");
    if (!renovavel) {
      throw new CobrancaNaoPermitidaError("renovacao_indisponivel", "Esta assinatura não está em período de renovação.");
    }
    const venceEm =
      c.vigente.venceEm.getTime() > c.agora.getTime()
        ? c.vigente.venceEm
        : emDias(c.agora, VENCIMENTO_DIAS_ASSINATURA_E_UPGRADE);
    return { destino: c.atual, valorCentavos: c.atual.precoCentavos, venceEm };
  }

  const destino = exigirPlanoPublico(c.destinoSolicitado);

  if (tipo === "assinatura") {
    const livre =
      c.vigente.status === "trial" || c.vigente.status === "cancelada" || c.statusEfetivo === "suspensa";
    if (!livre) {
      throw new CobrancaNaoPermitidaError(
        "assinatura_vigente",
        "A empresa já tem uma assinatura vigente: use renovação ou upgrade.",
      );
    }
    return {
      destino,
      valorCentavos: destino.precoCentavos,
      venceEm: emDias(c.agora, VENCIMENTO_DIAS_ASSINATURA_E_UPGRADE),
    };
  }

  if (!(c.vigente.status === "ativa" && c.statusEfetivo === "ativa")) {
    throw new CobrancaNaoPermitidaError(
      "upgrade_indisponivel",
      "O upgrade só está disponível para assinaturas ativas e dentro do ciclo.",
    );
  }
  const simulacao = simularUpgrade({ atual: c.atual, destino, venceEm: c.vigente.venceEm, agora: c.agora });
  if (!simulacao.ok) {
    throw new CobrancaNaoPermitidaError(simulacao.motivo, MENSAGEM_DO_MOTIVO[simulacao.motivo]);
  }
  return {
    destino,
    valorCentavos: Math.max(simulacao.valorCentavos, c.valorMinimoCentavos),
    venceEm: emDias(c.agora, VENCIMENTO_DIAS_ASSINATURA_E_UPGRADE),
  };
}

export interface IniciarCobrancaInput {
  empresaId: string;
  tipo: TipoCobranca;
  planoDestinoChave?: string;
  agora?: Date;
  roteador?: PaymentRouter;
  valorMinimoCentavos?: number;
}

export async function iniciarCobranca(input: IniciarCobrancaInput): Promise<Cobranca> {
  const {
    empresaId,
    tipo,
    planoDestinoChave,
    agora = new Date(),
    roteador = pagamentoRouter(),
    valorMinimoCentavos = valorMinimoDoAmbiente(),
  } = input;

  const [empresaEncontrada] = await db
    .select({ nome: empresa.nome, documento: empresa.documento })
    .from(empresa)
    .where(eq(empresa.id, empresaId))
    .limit(1);
  if (!empresaEncontrada) throw new Error("Empresa não encontrada.");

  const vigente = await buscarAssinaturaVigente(empresaId);
  if (!vigente) throw new CobrancaNaoPermitidaError("sem_assinatura", "A empresa não tem assinatura.");
  const atual = (await buscarPlanoDoCatalogo(vigente.planoChave)) as PlanoDoCatalogo;

  const planejamento = planejar(tipo, {
    vigente,
    atual,
    statusEfetivo: derivarStatus(vigente, agora),
    destinoSolicitado: planoDestinoChave ? await buscarPlanoDoCatalogo(planoDestinoChave) : null,
    agora,
    valorMinimoCentavos,
  });

  let pendente = await buscarCobrancaPendenteReutilizavel({
    assinaturaId: vigente.id,
    tipo,
    planoDestinoId: planejamento.destino.id,
    agora,
  });

  if (!pendente) {
    if (!empresaEncontrada.documento) throw new DocumentoAusenteError();
    pendente = await criarCobrancaPendente({
      assinaturaId: vigente.id,
      empresaId,
      tipo,
      planoDestinoId: planejamento.destino.id,
      valorCentavos: planejamento.valorCentavos,
      venceEm: planejamento.venceEm,
    });
  }

  if (pendente.providerChargeId) return pendente;
  if (!empresaEncontrada.documento) throw new DocumentoAusenteError();

  const documento = empresaEncontrada.documento;
  const [admin] = await db
    .select({ email: usuario.email })
    .from(usuario)
    .where(and(eq(usuario.empresaId, empresaId), eq(usuario.papel, "admin")))
    .orderBy(asc(usuario.createdAt))
    .limit(1);

  const resolverCliente = async (provider: PaymentProvider): Promise<string> => {
    const existente = await buscarProviderClienteId(empresaId, provider.nome);
    if (existente) return existente;
    const criadoId = await provider.criarCliente(
      { nome: empresaEncontrada.nome, documento, email: admin?.email ?? null },
      empresaId,
    );
    await salvarProviderClienteId(empresaId, provider.nome, criadoId);
    return (await buscarProviderClienteId(empresaId, provider.nome)) ?? criadoId;
  };

  try {
    const criada = await roteador.criarCobranca(
      {
        referencia: pendente.id,
        valorCentavos: pendente.valorCentavos,
        venceEm: pendente.venceEm,
        descricao: `DocObra — plano ${planejamento.destino.nome} (${ROTULO_DO_TIPO[tipo]})`,
      },
      resolverCliente,
    );
    return await registrarCobrancaNoGateway(pendente.id, {
      provider: criada.provider,
      providerChargeId: criada.providerChargeId,
      pix: criada.pix,
    });
  } catch (erro) {
    // Pode ter sido criada no gateway apesar do erro: antes de desistir, adota a que existir.
    if (erro instanceof FalhaIncertaError && erro.provider) {
      const encontrada = await roteador.provider(erro.provider).buscarCobrancaPorReferencia(pendente.id);
      if (encontrada) {
        return registrarCobrancaNoGateway(pendente.id, { provider: erro.provider, ...encontrada });
      }
    }
    throw erro;
  }
}
