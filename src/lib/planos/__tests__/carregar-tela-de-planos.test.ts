import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "@/db";
import { semearCatalogoNoBancoDeTeste } from "@/db/__tests__/helpers/semear-catalogo";
import { eq } from "drizzle-orm";

import { cobranca, empresa, plano } from "@/db/schema";
import { MS_POR_DIA } from "@/lib/permissoes/janela";
import { AGORA, criarCenario, limparCenarios } from "@/lib/pagamentos/__tests__/helpers/cenario";
import { carregarTelaDePlanos } from "../carregar-tela-de-planos";

const emDias = (dias: number) => new Date(AGORA.getTime() + dias * MS_POR_DIA);

async function acoes(empresaId: string) {
  const tela = await carregarTelaDePlanos(empresaId, AGORA);
  return Object.fromEntries((tela?.planos ?? []).map((p) => [p.chave, p.acao]));
}

describe("carregarTelaDePlanos", () => {
  beforeAll(semearCatalogoNoBancoDeTeste);
  beforeEach(limparCenarios);
  afterEach(async () => {
    vi.unstubAllEnvs();
    await limparCenarios();
  });

  it("empresa sem assinatura: null", async () => {
    const [semAssinatura] = await db.insert(empresa).values({ nome: "Sem assinatura" }).returning();
    expect(await carregarTelaDePlanos(semAssinatura.id, AGORA)).toBeNull();
  });

  it("lista os planos públicos, em ordem, com preço, ciclo e limites", async () => {
    const cenario = await criarCenario({ planoChave: "essencial", status: "ativa", venceEm: emDias(20) });
    const tela = await carregarTelaDePlanos(cenario.empresaId, AGORA);

    expect(tela?.planos.map((p) => p.chave)).toEqual(["essencial", "escritorio"]);
    expect(tela?.planos[0]).toMatchObject({ nome: "Essencial", precoCentavos: 9900, cicloDias: 30, ehAtual: true });
    expect(tela?.planos[0].limites).toContain("20 memoriais por mês");
    expect(tela?.planos[1]).toMatchObject({ ehAtual: false });
    expect(tela?.planos[1].limites).toContain("Projetos ilimitados");
  });

  it("trial: o teste gratuito aparece primeiro na lista como o plano atual", async () => {
    const cenario = await criarCenario({ venceEm: emDias(9) });
    const tela = await carregarTelaDePlanos(cenario.empresaId, AGORA);

    expect(tela?.planos[0]).toMatchObject({
      chave: "trial",
      nome: "Teste gratuito",
      precoCentavos: 0,
      ehAtual: true,
      acao: "atual",
    });
    expect(tela?.planos[0].limites).toContain("3 memoriais a cada 14 dias");
  });

  it("trial: os planos pagos são 'assinar' e o resumo traz os dias restantes", async () => {
    const cenario = await criarCenario({ venceEm: emDias(9) });
    expect(await acoes(cenario.empresaId)).toEqual({ trial: "atual", essencial: "assinar", escritorio: "assinar" });

    const tela = await carregarTelaDePlanos(cenario.empresaId, AGORA);
    expect(tela?.assinatura).toEqual({
      planoNome: "Trial",
      ehTrial: true,
      status: "trial",
      venceEm: emDias(9).toISOString(),
      diasRestantes: 9,
      podeCancelar: false,
    });
  });

  it("ativa com mais de 10 dias: plano atual é 'atual' e o de nível maior é upgrade com o valor simulado", async () => {
    const cenario = await criarCenario({ planoChave: "essencial", status: "ativa", venceEm: emDias(20) });
    const tela = await carregarTelaDePlanos(cenario.empresaId, AGORA);

    expect(tela?.assinatura.podeCancelar).toBe(true);
    expect(tela?.planos.find((p) => p.chave === "essencial")).toMatchObject({ acao: "atual", valorUpgradeCentavos: null });
    // (24900 - 9900) * 20 / 30
    expect(tela?.planos.find((p) => p.chave === "escritorio")).toMatchObject({
      acao: "upgrade",
      valorUpgradeCentavos: 10000,
    });
  });

  it("ativa a 7 dias do vencimento (dentro da janela de 10): plano atual vira 'renovar'", async () => {
    const cenario = await criarCenario({ planoChave: "essencial", status: "ativa", venceEm: emDias(7) });
    expect((await acoes(cenario.empresaId)).essencial).toBe("renovar");
  });

  it("ativa a 12 dias do vencimento (fora da janela de 10): plano atual continua 'atual'", async () => {
    const cenario = await criarCenario({ planoChave: "essencial", status: "ativa", venceEm: emDias(12) });
    expect((await acoes(cenario.empresaId)).essencial).toBe("atual");
  });

  it("ativa a 10 dias ou menos do vencimento: plano atual vira 'renovar'", async () => {
    const cenario = await criarCenario({ planoChave: "essencial", status: "ativa", venceEm: emDias(3) });
    const tela = await carregarTelaDePlanos(cenario.empresaId, AGORA);

    expect(tela?.planos.find((p) => p.chave === "essencial")?.acao).toBe("renovar");
    // (24900 - 9900) * 3 / 30
    expect(tela?.planos.find((p) => p.chave === "escritorio")).toMatchObject({
      acao: "upgrade",
      valorUpgradeCentavos: 1500,
    });
  });

  it("upgrade abaixo do mínimo do ambiente cobra o mínimo", async () => {
    vi.stubEnv("PAGAMENTO_VALOR_MINIMO_CENTAVOS", "3000");
    const cenario = await criarCenario({ planoChave: "essencial", status: "ativa", venceEm: emDias(3) });
    const tela = await carregarTelaDePlanos(cenario.empresaId, AGORA);

    // simulado: (24900 - 9900) * 3 / 30 = 1500
    expect(tela?.planos.find((p) => p.chave === "escritorio")?.valorUpgradeCentavos).toBe(3000);
  });

  it("carência: renovar o plano atual; outros planos só pelo suporte", async () => {
    const cenario = await criarCenario({ planoChave: "essencial", status: "ativa", venceEm: emDias(-2) });
    expect(await acoes(cenario.empresaId)).toEqual({ essencial: "renovar", escritorio: "suporte" });
  });

  it("suspensa: todos os planos são 'assinar'", async () => {
    const cenario = await criarCenario({ planoChave: "essencial", status: "ativa", venceEm: emDias(-10) });
    expect(await acoes(cenario.empresaId)).toEqual({ essencial: "assinar", escritorio: "assinar" });
    expect((await carregarTelaDePlanos(cenario.empresaId, AGORA))?.assinatura.status).toBe("suspensa");
  });

  it("cancelada ainda dentro do ciclo: o plano atual vira 'reativar' e os outros 'assinar'", async () => {
    const cenario = await criarCenario({ planoChave: "essencial", status: "cancelada", venceEm: emDias(10) });
    expect(await acoes(cenario.empresaId)).toEqual({ essencial: "reativar", escritorio: "assinar" });
  });

  it("plano que não é mensal aparece como 'em_breve' (Pix só mensal)", async () => {
    const cenario = await criarCenario({ planoChave: "essencial", status: "ativa", venceEm: emDias(20) });
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

      const acoesPorPlano = await acoes(cenario.empresaId);

      expect(acoesPorPlano["anual-teste"]).toBe("em_breve");
      expect(acoesPorPlano.escritorio).toBe("upgrade");
    } finally {
      const [anual] = await db.select({ id: plano.id }).from(plano).where(eq(plano.chave, "anual-teste"));
      if (anual) await db.delete(cobranca).where(eq(cobranca.planoDestinoId, anual.id));
      await db.delete(plano).where(eq(plano.chave, "anual-teste"));
    }
  });

  it("no plano mais alto, o de nível menor vira downgrade (pelo suporte)", async () => {
    const cenario = await criarCenario({ planoChave: "escritorio", status: "ativa", venceEm: emDias(20) });
    expect(await acoes(cenario.empresaId)).toEqual({ essencial: "downgrade", escritorio: "atual" });
  });
});
