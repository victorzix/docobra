import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { criarAssinatura } from "@/db/queries/assinatura";
import { clienteGateway, cobranca, empresa, eventoPagamento, plano } from "@/db/schema";
import { semearCatalogoNoBancoDeTeste } from "./helpers/semear-catalogo";

async function limpar() {
  await db.delete(eventoPagamento);
  await db.delete(empresa);
}

async function criarBase() {
  const [novaEmpresa] = await db.insert(empresa).values({ nome: "Empresa Teste" }).returning();
  const { id: assinaturaId } = await criarAssinatura(db, {
    empresaId: novaEmpresa.id,
    planoChave: "trial",
    status: "trial",
    origem: "suporte",
  });
  const [essencial] = await db.select().from(plano).where(eq(plano.chave, "essencial"));
  return { empresaId: novaEmpresa.id, assinaturaId, planoId: essencial.id };
}

function dadosDeCobranca(base: { empresaId: string; assinaturaId: string; planoId: string }) {
  return {
    assinaturaId: base.assinaturaId,
    empresaId: base.empresaId,
    tipo: "assinatura" as const,
    planoDestinoId: base.planoId,
    valorCentavos: 9900,
    venceEm: new Date("2026-06-18T12:00:00Z"),
  };
}

describe("schema de pagamentos", () => {
  beforeAll(semearCatalogoNoBancoDeTeste);
  beforeEach(limpar);
  afterEach(limpar);

  it("empresa.documento é opcional e guarda o valor informado", async () => {
    const [semDocumento] = await db.insert(empresa).values({ nome: "Sem Documento" }).returning();
    const [comDocumento] = await db
      .insert(empresa)
      .values({ nome: "Com Documento", documento: "12345678000199" })
      .returning();

    expect(semDocumento.documento).toBeNull();
    expect(comDocumento.documento).toBe("12345678000199");
  });

  it("cobranca nasce pendente e sem dados do gateway", async () => {
    const base = await criarBase();

    const [criada] = await db.insert(cobranca).values(dadosDeCobranca(base)).returning();

    expect(criada.status).toBe("pendente");
    expect(criada.provider).toBeNull();
    expect(criada.providerChargeId).toBeNull();
    expect(criada.pixCopiaECola).toBeNull();
  });

  it("rejeita duas cobranças com o mesmo (provider, provider_charge_id), mas aceita várias sem gateway", async () => {
    const base = await criarBase();
    const comGateway = { ...dadosDeCobranca(base), provider: "asaas", providerChargeId: "pay_1" };

    await db.insert(cobranca).values(comGateway);
    await expect(db.insert(cobranca).values(comGateway)).rejects.toThrow();

    await db.insert(cobranca).values(dadosDeCobranca(base));
    await db.insert(cobranca).values(dadosDeCobranca(base));
  });

  it("cliente_gateway tem uma linha por (empresa, provider)", async () => {
    const base = await criarBase();
    const linha = { empresaId: base.empresaId, provider: "asaas", providerClienteId: "cus_1" };

    await db.insert(clienteGateway).values(linha);

    await expect(db.insert(clienteGateway).values(linha)).rejects.toThrow();
  });

  it("evento_pagamento rejeita o mesmo (provider, event_id) duas vezes", async () => {
    const linha = { provider: "asaas", eventId: "evt_1", tipoOriginal: "PAYMENT_RECEIVED", payload: { id: "evt_1" } };

    await db.insert(eventoPagamento).values(linha);

    await expect(db.insert(eventoPagamento).values(linha)).rejects.toThrow();
  });

  it("apagar a empresa apaga as cobranças e o cliente do gateway", async () => {
    const base = await criarBase();
    await db.insert(cobranca).values(dadosDeCobranca(base));
    await db
      .insert(clienteGateway)
      .values({ empresaId: base.empresaId, provider: "asaas", providerClienteId: "cus_1" });

    await db.delete(empresa).where(eq(empresa.id, base.empresaId));

    expect(await db.select().from(cobranca)).toHaveLength(0);
    expect(await db.select().from(clienteGateway)).toHaveLength(0);
  });
});
