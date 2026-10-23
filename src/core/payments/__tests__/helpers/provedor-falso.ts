import { vi } from "vitest";

import type { PaymentProvider } from "../../types";

export function criarProvedorFalso(nome: string, sobrescritas: Partial<PaymentProvider> = {}): PaymentProvider {
  return {
    nome,
    criarCliente: vi.fn(async () => `cliente-${nome}`),
    criarCobranca: vi.fn(async () => ({
      providerChargeId: `cobranca-${nome}`,
      pix: { copiaECola: `pix-${nome}`, qrCodeBase64: "qr-base64", expiraEm: null },
    })),
    buscarCobrancaPorReferencia: vi.fn(async () => null),
    cancelarCobranca: vi.fn(async () => undefined),
    lerWebhook: vi.fn(() => null),
    ...sobrescritas,
  };
}
