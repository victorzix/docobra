import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { eq } from "drizzle-orm";

import { PaymentRouter } from "@/core/payments";
import { FalhaIncertaError } from "@/core/payments/erros";
import { criarProvedorFalso } from "@/core/payments/__tests__/helpers/provedor-falso";
import { db } from "@/db";
import { semearCatalogoNoBancoDeTeste } from "@/db/__tests__/helpers/semear-catalogo";
import { assinaturaTrecho, cobranca, plano } from "@/db/schema";
import { MS_POR_DIA } from "@/lib/permissoes/janela";
import { gerarRenovacoes } from "../gerar-renovacoes";
import { AGORA, criarCenario, idDoPlano, limparCenarios } from "./helpers/cenario";

const emDias = (dias: number) => new Date(AGORA.getTime() + dias * MS_POR_DIA);

const ativaVencendoEm = (dias: number, email: string, documento: string | null = "12345678000199") =>
  criarCenario({ planoChave: "essencial", status: "ativa", inicio: emDias(dias - 30), venceEm: emDias(dias), email, documento });

describe("gerarRenovacoes", () => {
  beforeAll(semearCatalogoNoBancoDeTeste);
  beforeEach(limparCenarios);
  afterEach(limparCenarios);

  it("gera a cobrança de renovação de quem vence dentro da antecedência", async () => {
    const cenario = await ativaVencendoEm(3, "a@x.com");
    const provedor = criarProvedorFalso("asaas");

    const resumo = await gerarRenovacoes({ agora: AGORA, roteador: new PaymentRouter([provedor]) });

    expect(resumo).toEqual({ garantidas: 1, semDocumento: 0, falhas: 0 });
    const [criada] = await db.select().from(cobranca);
    expect(criada).toMatchObject({
      empresaId: cenario.empresaId,
      tipo: "renovacao",
      valorCentavos: 9900,
      providerChargeId: "cobranca-asaas",
    });
    expect(criada.venceEm).toEqual(emDias(3));
  });

  it("é idempotente: rodar de novo no mesmo ciclo não cria outra cobrança", async () => {
    await ativaVencendoEm(3, "a@x.com");
    const provedor = criarProvedorFalso("asaas");
    const roteador = new PaymentRouter([provedor]);

    await gerarRenovacoes({ agora: AGORA, roteador });
    const segunda = await gerarRenovacoes({ agora: AGORA, roteador });

    expect(segunda.garantidas).toBe(1);
    expect(await db.select().from(cobranca)).toHaveLength(1);
    expect(provedor.criarCobranca).toHaveBeenCalledTimes(1);
  });

  it("também cobre quem está em carência (venceu há menos de 5 dias)", async () => {
    await ativaVencendoEm(-2, "a@x.com");

    const resumo = await gerarRenovacoes({ agora: AGORA, roteador: new PaymentRouter([criarProvedorFalso("asaas")]) });

    expect(resumo.garantidas).toBe(1);
  });

  it("ignora quem vence depois da antecedência, quem já está suspenso, trial e cancelada", async () => {
    await ativaVencendoEm(12, "longe@x.com");
    await ativaVencendoEm(-8, "suspensa@x.com");
    await criarCenario({ email: "trial@x.com" });
    await criarCenario({ planoChave: "essencial", status: "cancelada", inicio: emDias(-27), venceEm: emDias(3), email: "cancelada@x.com" });
    const provedor = criarProvedorFalso("asaas");

    const resumo = await gerarRenovacoes({ agora: AGORA, roteador: new PaymentRouter([provedor]) });

    expect(resumo).toEqual({ garantidas: 0, semDocumento: 0, falhas: 0 });
    expect(provedor.criarCobranca).not.toHaveBeenCalled();
  });

  it("respeita uma antecedência customizada", async () => {
    await ativaVencendoEm(12, "a@x.com");
    const roteador = new PaymentRouter([criarProvedorFalso("asaas")]);

    expect((await gerarRenovacoes({ agora: AGORA, roteador })).garantidas).toBe(0);
    expect((await gerarRenovacoes({ agora: AGORA, roteador, antecedenciaDias: 15 })).garantidas).toBe(1);
  });

  it("conta empresas sem CPF/CNPJ e segue com as outras", async () => {
    await ativaVencendoEm(3, "sem@x.com", null);
    await ativaVencendoEm(3, "com@x.com");

    const resumo = await gerarRenovacoes({ agora: AGORA, roteador: new PaymentRouter([criarProvedorFalso("asaas")]) });

    expect(resumo).toEqual({ garantidas: 1, semDocumento: 1, falhas: 0 });
  });

  it("falha do gateway numa empresa conta como falha e não derruba o lote", async () => {
    await ativaVencendoEm(3, "a@x.com");
    await ativaVencendoEm(3, "b@x.com");
    const provedor = criarProvedorFalso("asaas");
    vi.mocked(provedor.criarCobranca).mockRejectedValueOnce(new FalhaIncertaError("timeout"));
    const erroNoConsole = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const resumo = await gerarRenovacoes({ agora: AGORA, roteador: new PaymentRouter([provedor]) });

    expect(resumo).toEqual({ garantidas: 1, semDocumento: 0, falhas: 1 });
    erroNoConsole.mockRestore();
  });

  it("ignora assinatura de plano que não é mensal", async () => {
    const cenario = await ativaVencendoEm(3, "anual@x.com");
    const provedor = criarProvedorFalso("asaas");
    try {
      await db.insert(plano).values({
        chave: "anual-teste",
        nome: "Anual teste",
        nivel: 5,
        cicloDias: 360,
        precoCentavos: 90000,
        ativo: true,
        interno: false,
      });
      const [anual] = await db.select().from(plano).where(eq(plano.chave, "anual-teste"));
      await db.update(assinaturaTrecho).set({ planoId: anual.id }).where(eq(assinaturaTrecho.assinaturaId, cenario.assinaturaId));

      const resumo = await gerarRenovacoes({ agora: AGORA, roteador: new PaymentRouter([provedor]) });

      expect(resumo).toEqual({ garantidas: 0, semDocumento: 0, falhas: 0 });
      expect(provedor.criarCobranca).not.toHaveBeenCalled();
    } finally {
      await db.update(assinaturaTrecho).set({ planoId: await idDoPlano("essencial") }).where(eq(assinaturaTrecho.assinaturaId, cenario.assinaturaId));
      const [anual] = await db.select({ id: plano.id }).from(plano).where(eq(plano.chave, "anual-teste"));
      if (anual) await db.delete(cobranca).where(eq(cobranca.planoDestinoId, anual.id));
      await db.delete(plano).where(eq(plano.chave, "anual-teste"));
    }
  });
});
