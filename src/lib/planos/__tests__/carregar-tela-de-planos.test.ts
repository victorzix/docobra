import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "@/db";
import { semearCatalogoNoBancoDeTeste } from "@/db/__tests__/helpers/semear-catalogo";
import { empresa } from "@/db/schema";
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

  it("lista só os planos públicos, em ordem, com preço, ciclo e limites", async () => {
    const cenario = await criarCenario({ venceEm: emDias(9) });
    const tela = await carregarTelaDePlanos(cenario.empresaId, AGORA);

    expect(tela?.planos.map((p) => p.chave)).toEqual(["essencial", "escritorio"]);
    expect(tela?.planos[0]).toMatchObject({ nome: "Essencial", precoCentavos: 9900, cicloDias: 30 });
    expect(tela?.planos[0].limites).toContain("20 memoriais por mês");
    expect(tela?.planos[1].limites).toContain("Projetos ilimitados");
  });

  it("trial: todos os planos são 'assinar' e o resumo traz os dias restantes", async () => {
    const cenario = await criarCenario({ venceEm: emDias(9) });
    expect(await acoes(cenario.empresaId)).toEqual({ essencial: "assinar", escritorio: "assinar" });

    const tela = await carregarTelaDePlanos(cenario.empresaId, AGORA);
    expect(tela?.assinatura).toEqual({
      planoNome: "Trial",
      status: "trial",
      venceEm: emDias(9).toISOString(),
      diasRestantes: 9,
    });
  });

  it("ativa com mais de 5 dias: plano atual é 'atual' e o de nível maior é upgrade com o valor simulado", async () => {
    const cenario = await criarCenario({ planoChave: "essencial", status: "ativa", venceEm: emDias(20) });
    const tela = await carregarTelaDePlanos(cenario.empresaId, AGORA);

    expect(tela?.planos.find((p) => p.chave === "essencial")).toMatchObject({ acao: "atual", valorUpgradeCentavos: null });
    // (24900 - 9900) * 20 / 30
    expect(tela?.planos.find((p) => p.chave === "escritorio")).toMatchObject({
      acao: "upgrade",
      valorUpgradeCentavos: 10000,
    });
  });

  it("ativa a 5 dias ou menos do vencimento: plano atual vira 'renovar'", async () => {
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

  it("cancelada ainda dentro do ciclo: todos os planos são 'assinar'", async () => {
    const cenario = await criarCenario({ planoChave: "essencial", status: "cancelada", venceEm: emDias(10) });
    expect(await acoes(cenario.empresaId)).toEqual({ essencial: "assinar", escritorio: "assinar" });
  });

  it("no plano mais alto, o de nível menor só pelo suporte", async () => {
    const cenario = await criarCenario({ planoChave: "escritorio", status: "ativa", venceEm: emDias(20) });
    expect(await acoes(cenario.empresaId)).toEqual({ essencial: "suporte", escritorio: "atual" });
  });
});
