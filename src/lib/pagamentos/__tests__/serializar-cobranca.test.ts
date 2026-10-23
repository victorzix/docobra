import { describe, expect, it } from "vitest";

import type { Cobranca } from "@/db/queries/cobranca";
import { serializarCobranca } from "../serializar-cobranca";

function cobranca(sobrescritas: Partial<Cobranca> = {}): Cobranca {
  return {
    id: "c1",
    assinaturaId: "a1",
    empresaId: "e1",
    tipo: "assinatura",
    planoDestinoId: "p1",
    valorCentavos: 9900,
    status: "pendente",
    venceEm: new Date("2026-06-18T12:00:00Z"),
    provider: "asaas",
    providerChargeId: "pay_1",
    pixCopiaECola: "copia",
    pixQrCodeBase64: "qr",
    pixExpiraEm: new Date("2026-06-19T02:59:59Z"),
    pagaEm: null,
    createdAt: new Date("2026-06-15T12:00:00Z"),
    updatedAt: new Date("2026-06-15T12:00:00Z"),
    ...sobrescritas,
  };
}

describe("serializarCobranca", () => {
  it("expõe só o que a tela precisa, com datas em ISO", () => {
    expect(serializarCobranca(cobranca())).toEqual({
      id: "c1",
      tipo: "assinatura",
      status: "pendente",
      valorCentavos: 9900,
      venceEm: "2026-06-18T12:00:00.000Z",
      pix: { copiaECola: "copia", qrCodeBase64: "qr", expiraEm: "2026-06-19T02:59:59.000Z" },
    });
  });

  it("pix é null enquanto o gateway ainda não devolveu o QR", () => {
    expect(serializarCobranca(cobranca({ pixCopiaECola: null, pixQrCodeBase64: null })).pix).toBeNull();
  });

  it("expiraEm nulo quando o gateway não informa", () => {
    expect(serializarCobranca(cobranca({ pixExpiraEm: null })).pix?.expiraEm).toBeNull();
  });
});
