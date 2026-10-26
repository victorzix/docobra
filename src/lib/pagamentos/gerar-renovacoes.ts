import { and, eq, gt, lte } from "drizzle-orm";

import { ANTECEDENCIA_RENOVACAO_DIAS_PADRAO } from "@/core/billing/renovacao";
import type { PaymentRouter } from "@/core/payments/router";
import { db } from "@/db";
import { assinatura } from "@/db/schema";
import { MS_POR_DIA } from "@/lib/permissoes/janela";
import { CARENCIA_DIAS_PADRAO } from "@/lib/permissoes/status-assinatura";
import { CobrancaNaoPermitidaError, DocumentoAusenteError, iniciarCobranca } from "./iniciar-cobranca";

export interface ResumoRenovacoes {
  garantidas: number;
  semDocumento: number;
  falhas: number;
}

// Idempotente: iniciarCobranca reaproveita a renovação pendente do ciclo, então o
// job pode rodar todo dia (e de novo, se alguém disparar a mais) sem duplicar cobrança.
export async function gerarRenovacoes({
  agora = new Date(),
  antecedenciaDias = ANTECEDENCIA_RENOVACAO_DIAS_PADRAO,
  roteador,
}: { agora?: Date; antecedenciaDias?: number; roteador?: PaymentRouter } = {}): Promise<ResumoRenovacoes> {
  const limiteSuperior = new Date(agora.getTime() + antecedenciaDias * MS_POR_DIA);
  const limiteInferior = new Date(agora.getTime() - CARENCIA_DIAS_PADRAO * MS_POR_DIA);

  const candidatas = await db
    .select({ empresaId: assinatura.empresaId })
    .from(assinatura)
    .where(
      and(
        eq(assinatura.status, "ativa"),
        lte(assinatura.venceEm, limiteSuperior),
        gt(assinatura.venceEm, limiteInferior),
      ),
    );

  const resumo: ResumoRenovacoes = { garantidas: 0, semDocumento: 0, falhas: 0 };

  for (const { empresaId } of candidatas) {
    try {
      await iniciarCobranca({ empresaId, tipo: "renovacao", agora, roteador });
      resumo.garantidas += 1;
    } catch (erro) {
      if (erro instanceof CobrancaNaoPermitidaError && erro.motivo === "pix_somente_mensal") continue;
      if (erro instanceof DocumentoAusenteError) {
        resumo.semDocumento += 1;
      } else {
        console.error("[pagamentos] falha ao gerar a renovação", empresaId, erro);
        resumo.falhas += 1;
      }
    }
  }

  return resumo;
}
