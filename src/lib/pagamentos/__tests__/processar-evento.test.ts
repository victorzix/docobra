import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

import { PaymentRouter } from "@/core/payments";
import { criarProvedorFalso } from "@/core/payments/__tests__/helpers/provedor-falso";
import type { EventoPagamento, StatusEvento } from "@/core/payments/types";
import { db } from "@/db";
import { semearCatalogoNoBancoDeTeste } from "@/db/__tests__/helpers/semear-catalogo";
import { assinatura, cobranca, eventoPagamento, plano } from "@/db/schema";
import { proximoVencimento } from "@/core/billing/renovacao";
import { processarEventoPagamento } from "../processar-evento";
import { AGORA, criarCenario, inserirCobranca, limparCenarios } from "./helpers/cenario";

function evento(
  cobrancaRow: { id: string; providerChargeId: string | null },
  status: StatusEvento,
  sobrescritas: Partial<EventoPagamento> = {},
): EventoPagamento {
  return {
    eventId: `evt_${status}_${cobrancaRow.id}`,
    tipoOriginal: "PAYMENT_RECEIVED",
    status,
    providerChargeId: cobrancaRow.providerChargeId as string,
    referencia: cobrancaRow.id,
    payload: { id: "evt" },
    ...sobrescritas,
  };
}

async function cobrancaDe(id: string) {
  const [linha] = await db.select().from(cobranca).where(eq(cobranca.id, id));
  return linha;
}

async function assinaturaDe(id: string) {
  const [linha] = await db.select().from(assinatura).where(eq(assinatura.id, id));
  return linha;
}

describe("processarEventoPagamento", () => {
  beforeAll(semearCatalogoNoBancoDeTeste);
  beforeEach(limparCenarios);
  afterEach(limparCenarios);

  it("paga: aplica os efeitos, marca a cobrança e registra o evento com o resultado", async () => {
    const cenario = await criarCenario();
    const pendente = await inserirCobranca(cenario);

    const resultado = await processarEventoPagamento("asaas", evento(pendente, "paga"), { agora: AGORA });

    expect(resultado).toBe("processado");
    expect((await cobrancaDe(pendente.id)).status).toBe("paga");
    expect((await assinaturaDe(cenario.assinaturaId)).status).toBe("ativa");
    const [registrado] = await db.select().from(eventoPagamento);
    expect(registrado).toMatchObject({
      provider: "asaas",
      eventId: `evt_paga_${pendente.id}`,
      cobrancaId: pendente.id,
      resultado: "processado",
    });
  });

  it("evento repetido (mesmo id) vira duplicado e não aplica nada de novo", async () => {
    const cenario = await criarCenario();
    const pendente = await inserirCobranca(cenario);
    const dados = evento(pendente, "paga");
    await processarEventoPagamento("asaas", dados, { agora: AGORA });
    const depoisDoPrimeiro = await assinaturaDe(cenario.assinaturaId);

    const segundo = await processarEventoPagamento("asaas", dados, { agora: new Date(AGORA.getTime() + 86_400_000) });

    expect(segundo).toBe("duplicado");
    expect(await assinaturaDe(cenario.assinaturaId)).toEqual(depoisDoPrimeiro);
    expect(await db.select().from(eventoPagamento)).toHaveLength(1);
  });

  it("outro evento de pagamento da mesma cobrança já paga é ignorado (ex.: CONFIRMED depois de RECEIVED)", async () => {
    const cenario = await criarCenario();
    const pendente = await inserirCobranca(cenario);
    await processarEventoPagamento("asaas", evento(pendente, "paga"), { agora: AGORA });

    const resultado = await processarEventoPagamento("asaas", evento(pendente, "paga", { eventId: "evt_outro" }), {
      agora: AGORA,
    });

    expect(resultado).toBe("ignorado");
  });

  it("paga cobrança que já tinha vencido: aplica", async () => {
    const cenario = await criarCenario();
    const vencida = await inserirCobranca(cenario, { status: "vencida" });

    const resultado = await processarEventoPagamento("asaas", evento(vencida, "paga"), { agora: AGORA });

    expect(resultado).toBe("processado");
    expect((await cobrancaDe(vencida.id)).status).toBe("paga");
  });

  it("pagamento de outra cobrança do mesmo pedido (charge id diferente) não tem efeito", async () => {
    const cenario = await criarCenario();
    const pendente = await inserirCobranca(cenario, { providerChargeId: "pay_registrada" });

    const resultado = await processarEventoPagamento(
      "asaas",
      evento(pendente, "paga", { providerChargeId: "pay_duplicada" }),
      { agora: AGORA },
    );

    expect(resultado).toBe("pagamento_sem_efeito");
    expect((await cobrancaDe(pendente.id)).status).toBe("pendente");
    expect((await assinaturaDe(cenario.assinaturaId)).status).toBe("trial");
    const [registrado] = await db.select().from(eventoPagamento);
    expect(registrado.resultado).toBe("pagamento_sem_efeito");
  });

  it("pagamento de cobrança já cancelada não tem efeito (dinheiro entrou, o suporte resolve)", async () => {
    const cenario = await criarCenario();
    const cancelada = await inserirCobranca(cenario, { status: "cancelada" });

    const resultado = await processarEventoPagamento("asaas", evento(cancelada, "paga"), { agora: AGORA });

    expect(resultado).toBe("pagamento_sem_efeito");
    expect((await cobrancaDe(cancelada.id)).status).toBe("cancelada");
    expect((await assinaturaDe(cenario.assinaturaId)).status).toBe("trial");
  });

  it("vencida: marca só a pendente; cancelada: marca pendente ou vencida", async () => {
    const cenario = await criarCenario();
    const aVencer = await inserirCobranca(cenario);
    const aCancelar = await inserirCobranca(cenario, { status: "vencida" });
    const jaPaga = await inserirCobranca(cenario, { status: "paga" });

    expect(await processarEventoPagamento("asaas", evento(aVencer, "vencida"), { agora: AGORA })).toBe("processado");
    expect(await processarEventoPagamento("asaas", evento(aCancelar, "cancelada"), { agora: AGORA })).toBe("processado");
    expect(await processarEventoPagamento("asaas", evento(jaPaga, "vencida"), { agora: AGORA })).toBe("ignorado");
    expect(await processarEventoPagamento("asaas", evento(jaPaga, "cancelada"), { agora: AGORA })).toBe("ignorado");

    expect((await cobrancaDe(aVencer.id)).status).toBe("vencida");
    expect((await cobrancaDe(aCancelar.id)).status).toBe("cancelada");
    expect((await cobrancaDe(jaPaga.id)).status).toBe("paga");
  });

  it("estornada: marca a cobrança paga como estornada sem desfazer a assinatura", async () => {
    const cenario = await criarCenario();
    const pendente = await inserirCobranca(cenario);
    await processarEventoPagamento("asaas", evento(pendente, "paga"), { agora: AGORA });

    const resultado = await processarEventoPagamento("asaas", evento(pendente, "estornada"), { agora: AGORA });

    expect(resultado).toBe("processado");
    expect((await cobrancaDe(pendente.id)).status).toBe("estornada");
    expect((await assinaturaDe(cenario.assinaturaId)).status).toBe("ativa");
  });

  it("sem cobrança correspondente: registra o evento como sem_cobranca", async () => {
    const resultado = await processarEventoPagamento(
      "asaas",
      {
        eventId: "evt_orfao",
        tipoOriginal: "PAYMENT_RECEIVED",
        status: "paga",
        providerChargeId: "pay_que_nao_conhecemos",
        referencia: "00000000-0000-0000-0000-000000000000",
        payload: {},
      },
      { agora: AGORA },
    );

    expect(resultado).toBe("sem_cobranca");
    const [registrado] = await db.select().from(eventoPagamento);
    expect(registrado).toMatchObject({ eventId: "evt_orfao", cobrancaId: null, resultado: "sem_cobranca" });
  });

  it("sem referência válida, acha a cobrança pelo id do gateway", async () => {
    const cenario = await criarCenario();
    const pendente = await inserirCobranca(cenario, { providerChargeId: "pay_achada" });

    const resultado = await processarEventoPagamento(
      "asaas",
      evento(pendente, "paga", { referencia: null, providerChargeId: "pay_achada" }),
      { agora: AGORA },
    );

    expect(resultado).toBe("processado");
  });

  it("depois do commit, cancela no gateway as outras cobranças em aberto (falha de rede não derruba)", async () => {
    const cenario = await criarCenario();
    const paga = await inserirCobranca(cenario, { providerChargeId: "pay_paga" });
    await inserirCobranca(cenario, { tipo: "renovacao", providerChargeId: "pay_outra" });
    const provedor = criarProvedorFalso("asaas", {
      cancelarCobranca: vi.fn(async () => {
        throw new Error("rede caiu");
      }),
    });
    const erroNoConsole = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const resultado = await processarEventoPagamento("asaas", evento(paga, "paga"), {
      agora: AGORA,
      roteador: new PaymentRouter([provedor]),
    });

    expect(resultado).toBe("processado");
    expect(provedor.cancelarCobranca).toHaveBeenCalledWith("pay_outra");
    expect(erroNoConsole).toHaveBeenCalled();
    erroNoConsole.mockRestore();
  });

  it("dois eventos distintos da mesma cobrança em paralelo: aplica uma vez só", async () => {
    const cenario = await criarCenario({
      planoChave: "essencial",
      status: "ativa",
      venceEm: new Date("2026-07-01T00:00:00Z"),
    });
    const pendente = await inserirCobranca(cenario, { tipo: "renovacao" });
    const [antes] = await db.select().from(assinatura).where(eq(assinatura.id, cenario.assinaturaId));
    const [destino] = await db.select({ cicloDias: plano.cicloDias }).from(plano).where(eq(plano.chave, "essencial"));

    const resultados = await Promise.all([
      processarEventoPagamento("asaas", evento(pendente, "paga", { eventId: "evt_received" }), { agora: AGORA }),
      processarEventoPagamento("asaas", evento(pendente, "paga", { eventId: "evt_confirmed" }), { agora: AGORA }),
    ]);

    expect([...resultados].sort()).toEqual(["ignorado", "processado"]);
    const depois = await assinaturaDe(cenario.assinaturaId);
    expect(depois.venceEm).toEqual(proximoVencimento(antes.venceEm, destino.cicloDias));
  });
});
