import { and, eq, inArray, isNull, ne } from "drizzle-orm";

import { proximoVencimento } from "@/core/billing/renovacao";
import type { Cobranca } from "@/db/queries/cobranca";
import type { ExecutorDb } from "@/db/queries/executor";
import { assinatura, assinaturaTrecho, cobranca, plano } from "@/db/schema";
import { MS_POR_DIA } from "@/lib/permissoes/janela";

export interface CobrancaParaCancelarNoGateway {
  provider: string;
  providerChargeId: string;
}

// Roda dentro da transação do evento. Cancelar no gateway é rede: quem chama faz
// isso depois do commit, com a lista devolvida aqui.
export async function aplicarPagamento(
  tx: ExecutorDb,
  paga: Cobranca,
  agora: Date,
): Promise<CobrancaParaCancelarNoGateway[]> {
  const [destino] = await tx
    .select({ id: plano.id, cicloDias: plano.cicloDias })
    .from(plano)
    .where(eq(plano.id, paga.planoDestinoId));
  const [atual] = await tx.select().from(assinatura).where(eq(assinatura.id, paga.assinaturaId));

  if (paga.tipo === "renovacao") {
    await tx
      .update(assinatura)
      .set({
        status: "ativa",
        venceEm: proximoVencimento(atual.venceEm, destino.cicloDias),
        updatedAt: agora,
      })
      .where(eq(assinatura.id, atual.id));
  } else {
    await tx
      .update(assinaturaTrecho)
      .set({ fim: agora })
      .where(and(eq(assinaturaTrecho.assinaturaId, atual.id), isNull(assinaturaTrecho.fim)));
    await tx
      .insert(assinaturaTrecho)
      .values({ assinaturaId: atual.id, planoId: destino.id, inicio: agora, origem: "autoatendimento" });

    if (paga.tipo === "assinatura") {
      await tx
        .update(assinatura)
        .set({
          inicio: agora,
          status: "ativa",
          venceEm: new Date(agora.getTime() + destino.cicloDias * MS_POR_DIA),
          updatedAt: agora,
        })
        .where(eq(assinatura.id, atual.id));
    }
  }

  await tx
    .update(cobranca)
    .set({ status: "paga", pagaEm: agora, updatedAt: agora })
    .where(eq(cobranca.id, paga.id));

  // Os valores das outras cobranças em aberto foram calculados sobre o estado
  // anterior da assinatura: cancela e deixa o job/o cliente gerar de novo.
  const canceladas = await tx
    .update(cobranca)
    .set({ status: "cancelada", updatedAt: agora })
    .where(
      and(
        eq(cobranca.assinaturaId, atual.id),
        inArray(cobranca.status, ["pendente", "vencida"]),
        ne(cobranca.id, paga.id),
      ),
    )
    .returning({ provider: cobranca.provider, providerChargeId: cobranca.providerChargeId });

  return canceladas.filter(
    (linha): linha is CobrancaParaCancelarNoGateway => linha.provider !== null && linha.providerChargeId !== null,
  );
}
