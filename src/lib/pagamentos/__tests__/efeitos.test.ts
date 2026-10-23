import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { semearCatalogoNoBancoDeTeste } from "@/db/__tests__/helpers/semear-catalogo";
import { assinatura, assinaturaTrecho, cobranca, plano } from "@/db/schema";
import { MS_POR_DIA } from "@/lib/permissoes/janela";
import { aplicarPagamento } from "../efeitos";
import { AGORA, criarCenario, inserirCobranca, limparCenarios } from "./helpers/cenario";

const emDias = (dias: number) => new Date(AGORA.getTime() + dias * MS_POR_DIA);

async function assinaturaDe(assinaturaId: string) {
  const [linha] = await db.select().from(assinatura).where(eq(assinatura.id, assinaturaId));
  return linha;
}

async function trechosDe(assinaturaId: string) {
  return db
    .select({
      plano: plano.chave,
      inicio: assinaturaTrecho.inicio,
      fim: assinaturaTrecho.fim,
      origem: assinaturaTrecho.origem,
    })
    .from(assinaturaTrecho)
    .innerJoin(plano, eq(plano.id, assinaturaTrecho.planoId))
    .where(eq(assinaturaTrecho.assinaturaId, assinaturaId));
}

async function cobrancaDe(id: string) {
  const [linha] = await db.select().from(cobranca).where(eq(cobranca.id, id));
  return linha;
}

describe("aplicarPagamento", () => {
  beforeAll(semearCatalogoNoBancoDeTeste);
  beforeEach(limparCenarios);
  afterEach(limparCenarios);

  it("assinatura: reinicia o dia 0, ativa e troca o trecho para o plano pago", async () => {
    const cenario = await criarCenario({ inicio: emDias(-10) });
    const paga = await inserirCobranca(cenario, { tipo: "assinatura", planoChave: "essencial" });

    await aplicarPagamento(db, paga, AGORA);

    const depois = await assinaturaDe(cenario.assinaturaId);
    expect(depois.status).toBe("ativa");
    expect(depois.inicio).toEqual(AGORA);
    expect(depois.venceEm).toEqual(emDias(30));
    const trechos = await trechosDe(cenario.assinaturaId);
    expect(trechos).toHaveLength(2);
    expect(trechos.find((t) => t.plano === "trial")?.fim).toEqual(AGORA);
    expect(trechos.find((t) => t.plano === "essencial")).toMatchObject({ fim: null, origem: "autoatendimento" });
    expect((await cobrancaDe(paga.id)).status).toBe("paga");
    expect((await cobrancaDe(paga.id)).pagaEm).toEqual(AGORA);
  });

  it("upgrade: troca o trecho e mantém o dia 0 e o vencimento", async () => {
    const inicio = emDias(-10);
    const venceEm = emDias(20);
    const cenario = await criarCenario({ planoChave: "essencial", status: "ativa", inicio, venceEm });
    const paga = await inserirCobranca(cenario, { tipo: "upgrade", planoChave: "escritorio" });

    await aplicarPagamento(db, paga, AGORA);

    const depois = await assinaturaDe(cenario.assinaturaId);
    expect(depois.inicio).toEqual(inicio);
    expect(depois.venceEm).toEqual(venceEm);
    expect(depois.status).toBe("ativa");
    const trechos = await trechosDe(cenario.assinaturaId);
    expect(trechos.find((t) => t.plano === "essencial")?.fim).toEqual(AGORA);
    expect(trechos.find((t) => t.plano === "escritorio")).toMatchObject({ fim: null, origem: "autoatendimento" });
  });

  it("renovação: avança o vencimento um ciclo a partir do vencimento antigo (não da data do pagamento)", async () => {
    const venceEm = emDias(-3);
    const cenario = await criarCenario({ planoChave: "essencial", status: "ativa", inicio: emDias(-33), venceEm });
    const paga = await inserirCobranca(cenario, { tipo: "renovacao", planoChave: "essencial" });

    await aplicarPagamento(db, paga, AGORA);

    const depois = await assinaturaDe(cenario.assinaturaId);
    expect(depois.venceEm).toEqual(new Date(venceEm.getTime() + 30 * MS_POR_DIA));
    expect(depois.status).toBe("ativa");
    expect(depois.inicio).toEqual(emDias(-33));
    expect(await trechosDe(cenario.assinaturaId)).toHaveLength(1);
  });

  it("cancela as outras cobranças pendentes ou vencidas e devolve as que estão no gateway", async () => {
    const cenario = await criarCenario({ planoChave: "essencial", status: "ativa", venceEm: emDias(5) });
    const paga = await inserirCobranca(cenario, { tipo: "upgrade", planoChave: "escritorio", providerChargeId: "pay_paga" });
    const pendente = await inserirCobranca(cenario, { tipo: "renovacao", providerChargeId: "pay_pendente" });
    const vencida = await inserirCobranca(cenario, { tipo: "renovacao", status: "vencida", providerChargeId: "pay_vencida" });
    const semGateway = await inserirCobranca(cenario, { provider: null, providerChargeId: null });
    const jaPaga = await inserirCobranca(cenario, { status: "paga", providerChargeId: "pay_antiga" });

    const cancelar = await aplicarPagamento(db, paga, AGORA);

    expect((await cobrancaDe(pendente.id)).status).toBe("cancelada");
    expect((await cobrancaDe(vencida.id)).status).toBe("cancelada");
    expect((await cobrancaDe(semGateway.id)).status).toBe("cancelada");
    expect((await cobrancaDe(jaPaga.id)).status).toBe("paga");
    expect(cancelar).toHaveLength(2);
    expect(cancelar).toEqual(
      expect.arrayContaining([
        { provider: "asaas", providerChargeId: "pay_pendente" },
        { provider: "asaas", providerChargeId: "pay_vencida" },
      ]),
    );
  });
});
