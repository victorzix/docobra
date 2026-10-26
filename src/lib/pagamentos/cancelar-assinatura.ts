import { and, eq, inArray } from "drizzle-orm";

import { pagamentoRouter } from "@/core/payments";
import type { PaymentRouter } from "@/core/payments/router";
import { db } from "@/db";
import { buscarAssinaturaVigente, type AssinaturaVigente } from "@/db/queries/assinatura";
import { assinatura, cobranca } from "@/db/schema";
import { derivarStatus } from "@/lib/permissoes/status-assinatura";

export class AssinaturaNaoCancelavelError extends Error {
  constructor() {
    super("Só é possível cancelar uma assinatura paga e dentro do ciclo vigente.");
    this.name = "AssinaturaNaoCancelavelError";
  }
}

// Em carência o acesso já é de tolerância: cancelar ali o encerraria na hora, então fica de fora.
export function podeCancelarAssinatura(vigente: Pick<AssinaturaVigente, "status" | "venceEm">, agora: Date): boolean {
  return vigente.status === "ativa" && derivarStatus(vigente, agora) === "ativa";
}

export async function cancelarAssinatura(
  empresaId: string,
  agora: Date = new Date(),
  roteador?: PaymentRouter,
): Promise<void> {
  const vigente = await buscarAssinaturaVigente(empresaId);
  if (!vigente || !podeCancelarAssinatura(vigente, agora)) throw new AssinaturaNaoCancelavelError();

  const emAberto = await db.transaction(async (tx) => {
    const [alterada] = await tx
      .update(assinatura)
      .set({ status: "cancelada", updatedAt: agora })
      .where(and(eq(assinatura.id, vigente.id), eq(assinatura.status, "ativa")))
      .returning({ id: assinatura.id });
    if (!alterada) throw new AssinaturaNaoCancelavelError();

    return tx
      .update(cobranca)
      .set({ status: "cancelada", updatedAt: agora })
      .where(and(eq(cobranca.assinaturaId, vigente.id), inArray(cobranca.status, ["pendente", "vencida"])))
      .returning({ provider: cobranca.provider, providerChargeId: cobranca.providerChargeId });
  });

  // Rede fora da transação, como em aplicarPagamento: o cancelamento vale mesmo se o gateway falhar.
  for (const { provider, providerChargeId } of emAberto) {
    if (!provider || !providerChargeId) continue;
    try {
      await (roteador ?? pagamentoRouter()).provider(provider).cancelarCobranca(providerChargeId);
    } catch (erro) {
      console.error("[pagamentos] não foi possível cancelar a cobrança no gateway", providerChargeId, erro);
    }
  }
}
