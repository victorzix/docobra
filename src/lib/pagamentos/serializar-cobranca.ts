import type { Cobranca } from "@/db/queries/cobranca";
import type { CobrancaResponse } from "@/lib/validations/cobranca/response.schema";

export function serializarCobranca(c: Cobranca): CobrancaResponse {
  return {
    id: c.id,
    tipo: c.tipo,
    status: c.status,
    valorCentavos: c.valorCentavos,
    venceEm: c.venceEm.toISOString(),
    pix:
      c.pixCopiaECola && c.pixQrCodeBase64
        ? {
            copiaECola: c.pixCopiaECola,
            qrCodeBase64: c.pixQrCodeBase64,
            expiraEm: c.pixExpiraEm ? c.pixExpiraEm.toISOString() : null,
          }
        : null,
  };
}
