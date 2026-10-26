import { pagamentoRouter } from "@/core/payments";
import type { PaymentRouter } from "@/core/payments/router";
import { buscarCobrancaPorId, cancelarCobrancaPendente, type Cobranca } from "@/db/queries/cobranca";

// Cancela no gateway antes de marcar: se o Pix foi pago no último instante o cancelamento é
// recusado, a cobrança continua pendente e o webhook do pagamento é quem decide o resultado.
export async function expirarSeVencida(
  cobranca: Cobranca,
  agora: Date = new Date(),
  roteador?: PaymentRouter,
): Promise<Cobranca> {
  if (cobranca.status !== "pendente" || !cobranca.pixExpiraEm || cobranca.pixExpiraEm > agora) return cobranca;

  if (cobranca.provider && cobranca.providerChargeId) {
    try {
      await (roteador ?? pagamentoRouter()).provider(cobranca.provider).cancelarCobranca(cobranca.providerChargeId);
    } catch (erro) {
      console.error("[pagamentos] não foi possível cancelar a cobrança expirada no gateway", cobranca.id, erro);
      return cobranca;
    }
  }

  return (await cancelarCobrancaPendente(cobranca.id, agora)) ?? (await buscarCobrancaPorId(cobranca.id)) ?? cobranca;
}
