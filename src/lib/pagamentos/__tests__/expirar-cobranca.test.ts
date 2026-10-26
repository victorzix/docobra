import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

import { PaymentRouter } from "@/core/payments";
import { criarProvedorFalso } from "@/core/payments/__tests__/helpers/provedor-falso";
import { db } from "@/db";
import { semearCatalogoNoBancoDeTeste } from "@/db/__tests__/helpers/semear-catalogo";
import { cobranca } from "@/db/schema";
import { expirarSeVencida } from "../expirar-cobranca";
import { AGORA, criarCenario, inserirCobranca, limparCenarios } from "./helpers/cenario";

const minutos = (n: number) => new Date(AGORA.getTime() + n * 60_000);

async function statusDe(id: string) {
  const [linha] = await db.select({ status: cobranca.status }).from(cobranca).where(eq(cobranca.id, id));
  return linha.status;
}

describe("expirarSeVencida", () => {
  beforeAll(semearCatalogoNoBancoDeTeste);
  beforeEach(limparCenarios);
  afterEach(limparCenarios);

  it("dentro do prazo ou sem prazo: não mexe em nada", async () => {
    const cenario = await criarCenario();
    const provedor = criarProvedorFalso("asaas");
    const noPrazo = await inserirCobranca(cenario, { pixExpiraEm: minutos(5) });
    const semPrazo = await inserirCobranca(cenario, { tipo: "renovacao", pixExpiraEm: null });

    const roteador = new PaymentRouter([provedor]);
    expect((await expirarSeVencida(noPrazo, AGORA, roteador)).status).toBe("pendente");
    expect((await expirarSeVencida(semPrazo, AGORA, roteador)).status).toBe("pendente");
    expect(provedor.cancelarCobranca).not.toHaveBeenCalled();
  });

  it("depois do prazo: cancela no gateway e marca como cancelada", async () => {
    const cenario = await criarCenario();
    const provedor = criarProvedorFalso("asaas");
    const vencida = await inserirCobranca(cenario, { pixExpiraEm: minutos(-1), providerChargeId: "pay_1" });

    const resultado = await expirarSeVencida(vencida, AGORA, new PaymentRouter([provedor]));

    expect(resultado.status).toBe("cancelada");
    expect(await statusDe(vencida.id)).toBe("cancelada");
    expect(provedor.cancelarCobranca).toHaveBeenCalledWith("pay_1");
  });

  it("gateway recusa o cancelamento (ex.: acabou de ser paga): continua pendente", async () => {
    const cenario = await criarCenario();
    const provedor = criarProvedorFalso("asaas");
    vi.mocked(provedor.cancelarCobranca).mockRejectedValue(new Error("já recebida"));
    const vencida = await inserirCobranca(cenario, { pixExpiraEm: minutos(-1) });
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const resultado = await expirarSeVencida(vencida, AGORA, new PaymentRouter([provedor]));

    expect(resultado.status).toBe("pendente");
    expect(await statusDe(vencida.id)).toBe("pendente");
  });

  it("cobrança que já não está pendente: devolve como está", async () => {
    const cenario = await criarCenario();
    const provedor = criarProvedorFalso("asaas");
    const paga = await inserirCobranca(cenario, { status: "paga", pixExpiraEm: minutos(-1) });

    expect((await expirarSeVencida(paga, AGORA, new PaymentRouter([provedor]))).status).toBe("paga");
    expect(provedor.cancelarCobranca).not.toHaveBeenCalled();
  });
});
