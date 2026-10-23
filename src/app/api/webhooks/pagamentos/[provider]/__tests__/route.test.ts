import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";

import { reiniciarPagamentoRouterParaTestes } from "@/core/payments";
import { db } from "@/db";
import { semearCatalogoNoBancoDeTeste } from "@/db/__tests__/helpers/semear-catalogo";
import { assinatura, cobranca, eventoPagamento } from "@/db/schema";
import { criarCenario, inserirCobranca, limparCenarios } from "@/lib/pagamentos/__tests__/helpers/cenario";
import { POST } from "@/app/api/webhooks/pagamentos/[provider]/route";

const TOKEN = "token-do-webhook-de-teste";

function requisicao(corpo: unknown, token: string | null = TOKEN) {
  return new NextRequest("http://localhost/api/webhooks/pagamentos/asaas", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { "asaas-access-token": token } : {}) },
    body: typeof corpo === "string" ? corpo : JSON.stringify(corpo),
  });
}

const chamar = (request: NextRequest, provider = "asaas") => POST(request, { params: Promise.resolve({ provider }) });

function eventoAsaas(evento: string, pagamento: { id: string; externalReference?: string }, id = "evt_1") {
  return { id, event: evento, payment: pagamento };
}

describe("POST /api/webhooks/pagamentos/[provider]", () => {
  beforeAll(semearCatalogoNoBancoDeTeste);
  beforeEach(async () => {
    vi.stubEnv("ASAAS_API_KEY", "chave-de-teste");
    vi.stubEnv("ASAAS_WEBHOOK_TOKEN", TOKEN);
    reiniciarPagamentoRouterParaTestes();
    await limparCenarios();
  });
  afterEach(async () => {
    vi.unstubAllEnvs();
    reiniciarPagamentoRouterParaTestes();
    await limparCenarios();
  });

  it("provider desconhecido: 404", async () => {
    const resposta = await chamar(requisicao({}), "zzz");

    expect(resposta.status).toBe(404);
  });

  it("token errado ou ausente: 401, sem processar", async () => {
    const corpo = eventoAsaas("PAYMENT_RECEIVED", { id: "pay_1" });

    expect((await chamar(requisicao(corpo, "outro"))).status).toBe(401);
    expect((await chamar(requisicao(corpo, null))).status).toBe(401);
    expect(await db.select().from(eventoPagamento)).toHaveLength(0);
  });

  it("corpo que não é JSON (com token certo): 400", async () => {
    const resposta = await chamar(requisicao("não é json"));

    expect(resposta.status).toBe(400);
  });

  it("evento sem ação: 200 e nada é gravado", async () => {
    const resposta = await chamar(requisicao(eventoAsaas("PAYMENT_CREATED", { id: "pay_1" })));

    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toEqual({ ignorado: true });
    expect(await db.select().from(eventoPagamento)).toHaveLength(0);
  });

  it("pagamento recebido: 200, aplica os efeitos e registra o evento", async () => {
    const cenario = await criarCenario();
    const pendente = await inserirCobranca(cenario, { providerChargeId: "pay_1" });

    const resposta = await chamar(
      requisicao(eventoAsaas("PAYMENT_RECEIVED", { id: "pay_1", externalReference: pendente.id })),
    );

    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toEqual({ resultado: "processado" });
    const [depois] = await db.select().from(cobranca).where(eq(cobranca.id, pendente.id));
    expect(depois.status).toBe("paga");
    const [assinaturaDepois] = await db.select().from(assinatura).where(eq(assinatura.id, cenario.assinaturaId));
    expect(assinaturaDepois.status).toBe("ativa");
  });

  it("reenvio do mesmo evento: 200 como duplicado, sem aplicar de novo", async () => {
    const cenario = await criarCenario();
    const pendente = await inserirCobranca(cenario, { providerChargeId: "pay_1" });
    const corpo = eventoAsaas("PAYMENT_RECEIVED", { id: "pay_1", externalReference: pendente.id });
    await chamar(requisicao(corpo));

    const segunda = await chamar(requisicao(corpo));

    expect(segunda.status).toBe(200);
    expect(await segunda.json()).toEqual({ resultado: "duplicado" });
    expect(await db.select().from(eventoPagamento)).toHaveLength(1);
  });
});
