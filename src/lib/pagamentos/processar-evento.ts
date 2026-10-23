import { and, eq } from "drizzle-orm";

import { pagamentoRouter } from "@/core/payments";
import type { PaymentRouter } from "@/core/payments/router";
import type { EventoPagamento } from "@/core/payments/types";
import { db } from "@/db";
import type { Cobranca } from "@/db/queries/cobranca";
import type { ExecutorDb } from "@/db/queries/executor";
import { cobranca, eventoPagamento } from "@/db/schema";
import { aplicarPagamento, type CobrancaParaCancelarNoGateway } from "./efeitos";

export type ResultadoEvento = "processado" | "ignorado" | "duplicado" | "sem_cobranca" | "pagamento_sem_efeito";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function acharCobranca(tx: ExecutorDb, provider: string, evento: EventoPagamento): Promise<Cobranca | null> {
  if (evento.referencia && UUID.test(evento.referencia)) {
    const [porReferencia] = await tx.select().from(cobranca).where(eq(cobranca.id, evento.referencia)).limit(1).for("update");
    if (porReferencia) return porReferencia;
  }
  const [porGateway] = await tx
    .select()
    .from(cobranca)
    .where(and(eq(cobranca.provider, provider), eq(cobranca.providerChargeId, evento.providerChargeId)))
    .limit(1)
    .for("update");
  return porGateway ?? null;
}

export async function processarEventoPagamento(
  providerNome: string,
  evento: EventoPagamento,
  { agora = new Date(), roteador }: { agora?: Date; roteador?: PaymentRouter } = {},
): Promise<ResultadoEvento> {
  // Evento e efeitos na MESMA transação: se algo falhar, o registro do evento volta
  // junto e o reenvio do gateway reprocessa (senão ele cairia como "duplicado").
  const { resultado, paraCancelar } = await db.transaction(async (tx) => {
    const [registrado] = await tx
      .insert(eventoPagamento)
      .values({
        provider: providerNome,
        eventId: evento.eventId,
        tipoOriginal: evento.tipoOriginal,
        providerChargeId: evento.providerChargeId,
        payload: evento.payload,
      })
      .onConflictDoNothing({ target: [eventoPagamento.provider, eventoPagamento.eventId] })
      .returning({ id: eventoPagamento.id });

    if (!registrado) {
      return { resultado: "duplicado" as ResultadoEvento, paraCancelar: [] as CobrancaParaCancelarNoGateway[] };
    }

    let encontrada = await acharCobranca(tx, providerNome, evento);
    // Id do gateway ainda não gravado (registro falhou após timeout): o pagamento é desta cobrança.
    if (encontrada && encontrada.providerChargeId === null) {
      await tx
        .update(cobranca)
        .set({ provider: providerNome, providerChargeId: evento.providerChargeId, updatedAt: agora })
        .where(eq(cobranca.id, encontrada.id));
      encontrada = { ...encontrada, provider: providerNome, providerChargeId: evento.providerChargeId };
    }
    let resultadoDoEvento: ResultadoEvento = "ignorado";
    let cancelar: CobrancaParaCancelarNoGateway[] = [];

    if (!encontrada) {
      resultadoDoEvento = "sem_cobranca";
    } else if (evento.status === "paga") {
      const outraCobranca = encontrada.providerChargeId !== evento.providerChargeId;
      const semEfeito = encontrada.status === "cancelada" || encontrada.status === "estornada";
      if (outraCobranca || semEfeito) {
        resultadoDoEvento = "pagamento_sem_efeito";
      } else if (encontrada.status === "pendente" || encontrada.status === "vencida") {
        cancelar = await aplicarPagamento(tx, encontrada, agora);
        resultadoDoEvento = "processado";
      }
    } else if (evento.status === "vencida") {
      if (encontrada.status === "pendente") {
        await tx.update(cobranca).set({ status: "vencida", updatedAt: agora }).where(eq(cobranca.id, encontrada.id));
        resultadoDoEvento = "processado";
      }
    } else if (evento.status === "cancelada") {
      if (encontrada.status === "pendente" || encontrada.status === "vencida") {
        await tx.update(cobranca).set({ status: "cancelada", updatedAt: agora }).where(eq(cobranca.id, encontrada.id));
        resultadoDoEvento = "processado";
      }
    } else if (evento.status === "estornada") {
      if (encontrada.status === "paga") {
        await tx.update(cobranca).set({ status: "estornada", updatedAt: agora }).where(eq(cobranca.id, encontrada.id));
        resultadoDoEvento = "processado";
      }
    }

    await tx
      .update(eventoPagamento)
      .set({ cobrancaId: encontrada?.id ?? null, resultado: resultadoDoEvento })
      .where(eq(eventoPagamento.id, registrado.id));

    return { resultado: resultadoDoEvento, paraCancelar: cancelar };
  });

  for (const alvo of paraCancelar) {
    try {
      await (roteador ?? pagamentoRouter()).provider(alvo.provider).cancelarCobranca(alvo.providerChargeId);
    } catch (erro) {
      console.error("[pagamentos] não foi possível cancelar a cobrança no gateway", alvo, erro);
    }
  }

  return resultado;
}
