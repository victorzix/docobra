import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

import { PaymentRouter } from "@/core/payments";
import { criarProvedorFalso } from "@/core/payments/__tests__/helpers/provedor-falso";
import { db } from "@/db";
import { semearCatalogoNoBancoDeTeste } from "@/db/__tests__/helpers/semear-catalogo";
import { assinatura, cobranca } from "@/db/schema";
import { MS_POR_DIA } from "@/lib/permissoes/janela";
import { AssinaturaNaoCancelavelError, cancelarAssinatura } from "../cancelar-assinatura";
import { AGORA, criarCenario, inserirCobranca, limparCenarios } from "./helpers/cenario";

const emDias = (dias: number) => new Date(AGORA.getTime() + dias * MS_POR_DIA);

async function statusDaAssinatura(id: string) {
  const [linha] = await db.select({ status: assinatura.status, venceEm: assinatura.venceEm }).from(assinatura).where(eq(assinatura.id, id));
  return linha;
}

describe("cancelarAssinatura", () => {
  beforeAll(semearCatalogoNoBancoDeTeste);
  beforeEach(limparCenarios);
  afterEach(limparCenarios);

  it("assinatura ativa no ciclo: marca como cancelada e mantém o vencimento", async () => {
    const venceEm = emDias(10);
    const cenario = await criarCenario({ planoChave: "essencial", status: "ativa", venceEm });

    await cancelarAssinatura(cenario.empresaId, AGORA, new PaymentRouter([criarProvedorFalso("asaas")]));

    expect(await statusDaAssinatura(cenario.assinaturaId)).toEqual({ status: "cancelada", venceEm });
  });

  it("cancela as cobranças em aberto, no banco e no gateway", async () => {
    const cenario = await criarCenario({ planoChave: "essencial", status: "ativa", venceEm: emDias(5) });
    const pendente = await inserirCobranca(cenario, { tipo: "renovacao", providerChargeId: "pay_pendente" });
    const paga = await inserirCobranca(cenario, { tipo: "upgrade", planoChave: "escritorio", status: "paga", providerChargeId: "pay_paga" });
    const provedor = criarProvedorFalso("asaas");

    await cancelarAssinatura(cenario.empresaId, AGORA, new PaymentRouter([provedor]));

    const [depoisPendente] = await db.select().from(cobranca).where(eq(cobranca.id, pendente.id));
    const [depoisPaga] = await db.select().from(cobranca).where(eq(cobranca.id, paga.id));
    expect(depoisPendente.status).toBe("cancelada");
    expect(depoisPaga.status).toBe("paga");
    expect(provedor.cancelarCobranca).toHaveBeenCalledTimes(1);
    expect(provedor.cancelarCobranca).toHaveBeenCalledWith("pay_pendente");
  });

  it("falha ao cancelar no gateway não desfaz o cancelamento", async () => {
    const cenario = await criarCenario({ planoChave: "essencial", status: "ativa", venceEm: emDias(5) });
    await inserirCobranca(cenario, { tipo: "renovacao" });
    const provedor = criarProvedorFalso("asaas");
    vi.mocked(provedor.cancelarCobranca).mockRejectedValue(new Error("fora do ar"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await cancelarAssinatura(cenario.empresaId, AGORA, new PaymentRouter([provedor]));

    expect((await statusDaAssinatura(cenario.assinaturaId)).status).toBe("cancelada");
  });

  it.each([
    ["trial", { status: "trial" as const, venceEm: emDias(5) }],
    ["em carência", { status: "ativa" as const, venceEm: emDias(-2) }],
    ["suspensa", { status: "ativa" as const, venceEm: emDias(-10) }],
    ["já cancelada", { status: "cancelada" as const, venceEm: emDias(5) }],
  ])("recusa assinatura %s", async (_nome, opcoes) => {
    const cenario = await criarCenario({ planoChave: "essencial", ...opcoes });

    await expect(
      cancelarAssinatura(cenario.empresaId, AGORA, new PaymentRouter([criarProvedorFalso("asaas")])),
    ).rejects.toBeInstanceOf(AssinaturaNaoCancelavelError);
  });
});
