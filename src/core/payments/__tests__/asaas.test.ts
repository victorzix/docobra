import { describe, expect, it, vi } from "vitest";

import { AsaasProvider } from "../asaas";
import {
  FalhaIncertaError,
  RecusaDefinitivaError,
  WebhookInvalidoError,
  WebhookNaoAutenticadoError,
} from "../erros";

const BASE = "https://api-sandbox.asaas.com";

function resposta(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });
}

function criarProvider(fetchImpl: typeof fetch) {
  return new AsaasProvider({ apiKey: "chave-teste", baseUrl: BASE, webhookToken: "token-do-webhook", fetchImpl });
}

function chamada(fetchMock: ReturnType<typeof vi.fn>, indice: number) {
  const [url, opcoes] = fetchMock.mock.calls[indice] as [string, RequestInit];
  return { url, metodo: opcoes.method, headers: opcoes.headers as Record<string, string>, corpo: opcoes.body };
}

const QR = { encodedImage: "base64-do-qr", payload: "00020126-copia-e-cola", expirationDate: "2026-06-18 23:59:59" };

describe("AsaasProvider.criarCliente", () => {
  it("cadastra o cliente e devolve o id", async () => {
    const fetchMock = vi.fn(async () => resposta({ id: "cus_123" }));

    const id = await criarProvider(fetchMock as unknown as typeof fetch).criarCliente(
      { nome: "Empresa X", documento: "12345678000199", email: "a@b.com" },
      "empresa-1",
    );

    expect(id).toBe("cus_123");
    const c = chamada(fetchMock, 0);
    expect(c.url).toBe(`${BASE}/v3/customers`);
    expect(c.metodo).toBe("POST");
    expect(c.headers.access_token).toBe("chave-teste");
    expect(JSON.parse(c.corpo as string)).toEqual({
      name: "Empresa X",
      cpfCnpj: "12345678000199",
      email: "a@b.com",
      externalReference: "empresa-1",
    });
  });

  it("omite o email quando não há", async () => {
    const fetchMock = vi.fn(async () => resposta({ id: "cus_123" }));

    await criarProvider(fetchMock as unknown as typeof fetch).criarCliente(
      { nome: "Empresa X", documento: "12345678000199", email: null },
      "empresa-1",
    );

    expect(JSON.parse(chamada(fetchMock, 0).corpo as string)).not.toHaveProperty("email");
  });
});

describe("AsaasProvider.criarCobranca", () => {
  it("cria a cobrança Pix e busca o QR Code", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(resposta({ id: "pay_1" }))
      .mockResolvedValueOnce(resposta(QR));

    const criada = await criarProvider(fetchMock as unknown as typeof fetch).criarCobranca({
      clienteId: "cus_123",
      referencia: "cobranca-1",
      valorCentavos: 9900,
      venceEm: new Date("2026-06-18T12:00:00Z"),
      descricao: "DocObra — plano Essencial",
    });

    expect(criada).toEqual({
      providerChargeId: "pay_1",
      pix: {
        copiaECola: "00020126-copia-e-cola",
        qrCodeBase64: "base64-do-qr",
        expiraEm: new Date("2026-06-18T23:59:59-03:00"),
      },
    });
    const criacao = chamada(fetchMock, 0);
    expect(criacao.url).toBe(`${BASE}/v3/payments`);
    expect(criacao.metodo).toBe("POST");
    expect(JSON.parse(criacao.corpo as string)).toEqual({
      customer: "cus_123",
      billingType: "PIX",
      value: 99,
      dueDate: "2026-06-18",
      externalReference: "cobranca-1",
      description: "DocObra — plano Essencial",
    });
    const qr = chamada(fetchMock, 1);
    expect(qr.url).toBe(`${BASE}/v3/payments/pay_1/pixQrCode`);
    expect(qr.metodo).toBe("GET");
  });

  it("aceita expirationDate sem data (expiraEm nulo)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(resposta({ id: "pay_1" }))
      .mockResolvedValueOnce(resposta({ encodedImage: "x", payload: "y" }));

    const criada = await criarProvider(fetchMock as unknown as typeof fetch).criarCobranca({
      clienteId: "cus_123",
      referencia: "cobranca-1",
      valorCentavos: 500,
      venceEm: new Date("2026-06-18T12:00:00Z"),
      descricao: "x",
    });

    expect(criada.pix.expiraEm).toBeNull();
  });
});

describe("AsaasProvider: classificação de erros", () => {
  const entrada = {
    clienteId: "cus_123",
    referencia: "cobranca-1",
    valorCentavos: 9900,
    venceEm: new Date("2026-06-18T12:00:00Z"),
    descricao: "x",
  };

  it("4xx vira recusa definitiva, com código, descrição e status", async () => {
    const fetchMock = vi.fn(async () =>
      resposta({ errors: [{ code: "invalid_customer", description: "Cliente inválido" }] }, 400),
    );

    const erro = await criarProvider(fetchMock as unknown as typeof fetch)
      .criarCobranca(entrada)
      .catch((e) => e);

    expect(erro).toBeInstanceOf(RecusaDefinitivaError);
    expect(erro.message).toBe("Cliente inválido");
    expect(erro.codigo).toBe("invalid_customer");
    expect(erro.status).toBe(400);
  });

  it.each([400, 500])("POST ok e QR Code com %i vira falha incerta (a cobrança já existe no Asaas)", async (status) => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(resposta({ id: "pay_1" }))
      .mockResolvedValueOnce(resposta({ errors: [{ code: "x", description: "sem chave Pix" }] }, status));

    const erro = await criarProvider(fetchMock as unknown as typeof fetch)
      .criarCobranca(entrada)
      .catch((e) => e);

    expect(erro).toBeInstanceOf(FalhaIncertaError);
    expect(erro.causa).toBeDefined();
  });

  it("401 também é recusa definitiva", async () => {
    const fetchMock = vi.fn(async () => resposta({ errors: [{ code: "invalid_access_token" }] }, 401));

    const erro = await criarProvider(fetchMock as unknown as typeof fetch)
      .criarCobranca(entrada)
      .catch((e) => e);

    expect(erro).toBeInstanceOf(RecusaDefinitivaError);
    expect(erro.status).toBe(401);
  });

  it.each([500, 502, 408, 429])("%i vira falha incerta", async (status) => {
    const fetchMock = vi.fn(async () => resposta({}, status));

    const erro = await criarProvider(fetchMock as unknown as typeof fetch)
      .criarCobranca(entrada)
      .catch((e) => e);

    expect(erro).toBeInstanceOf(FalhaIncertaError);
  });

  it("erro de rede ou timeout vira falha incerta", async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });

    const erro = await criarProvider(fetchMock as unknown as typeof fetch)
      .criarCobranca(entrada)
      .catch((e) => e);

    expect(erro).toBeInstanceOf(FalhaIncertaError);
  });
});

describe("AsaasProvider.buscarCobrancaPorReferencia", () => {
  it("consulta por externalReference e devolve a cobrança existente com o QR", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(resposta({ data: [{ id: "pay_apagada", deleted: true }, { id: "pay_1", deleted: false }] }))
      .mockResolvedValueOnce(resposta(QR));

    const encontrada = await criarProvider(fetchMock as unknown as typeof fetch).buscarCobrancaPorReferencia(
      "cobranca-1",
    );

    expect(encontrada?.providerChargeId).toBe("pay_1");
    expect(encontrada?.pix.copiaECola).toBe("00020126-copia-e-cola");
    const busca = chamada(fetchMock, 0);
    expect(busca.url).toBe(`${BASE}/v3/payments?externalReference=cobranca-1&limit=10`);
    expect(busca.metodo).toBe("GET");
  });

  it("devolve null quando não há cobrança (ou só apagadas)", async () => {
    const vazio = vi.fn(async () => resposta({ data: [] }));
    const soApagadas = vi.fn(async () => resposta({ data: [{ id: "pay_x", deleted: true }] }));

    expect(await criarProvider(vazio as unknown as typeof fetch).buscarCobrancaPorReferencia("c")).toBeNull();
    expect(await criarProvider(soApagadas as unknown as typeof fetch).buscarCobrancaPorReferencia("c")).toBeNull();
  });
});

describe("AsaasProvider.cancelarCobranca", () => {
  it("apaga a cobrança no Asaas", async () => {
    const fetchMock = vi.fn(async () => resposta({ deleted: true, id: "pay_1" }));

    await criarProvider(fetchMock as unknown as typeof fetch).cancelarCobranca("pay_1");

    const c = chamada(fetchMock, 0);
    expect(c.url).toBe(`${BASE}/v3/payments/pay_1`);
    expect(c.metodo).toBe("DELETE");
  });

  it("trata 404 como já cancelada", async () => {
    const fetchMock = vi.fn(async () => resposta({ errors: [{ code: "not_found" }] }, 404));

    await expect(
      criarProvider(fetchMock as unknown as typeof fetch).cancelarCobranca("pay_1"),
    ).resolves.toBeUndefined();
  });

  it("repassa outros erros", async () => {
    const fetchMock = vi.fn(async () => resposta({ errors: [{ code: "x" }] }, 400));

    await expect(criarProvider(fetchMock as unknown as typeof fetch).cancelarCobranca("pay_1")).rejects.toBeInstanceOf(
      RecusaDefinitivaError,
    );
  });
});

describe("AsaasProvider.lerWebhook", () => {
  const provider = criarProvider(vi.fn() as unknown as typeof fetch);

  function corpo(evento: string) {
    return JSON.stringify({
      id: "evt_1",
      event: evento,
      payment: { id: "pay_1", externalReference: "cobranca-1", status: "RECEIVED" },
    });
  }

  function cabecalhos(token = "token-do-webhook") {
    return new Headers({ "asaas-access-token": token });
  }

  it.each([
    ["PAYMENT_RECEIVED", "paga"],
    ["PAYMENT_CONFIRMED", "paga"],
    ["PAYMENT_OVERDUE", "vencida"],
    ["PAYMENT_DELETED", "cancelada"],
    ["PAYMENT_REFUNDED", "estornada"],
  ])("%s vira %s", (evento, status) => {
    expect(provider.lerWebhook(cabecalhos(), corpo(evento))).toMatchObject({
      eventId: "evt_1",
      tipoOriginal: evento,
      status,
      providerChargeId: "pay_1",
      referencia: "cobranca-1",
    });
  });

  it("evento sem ação devolve null", () => {
    expect(provider.lerWebhook(cabecalhos(), corpo("PAYMENT_CREATED"))).toBeNull();
  });

  it("token errado ou ausente não autentica", () => {
    expect(() => provider.lerWebhook(cabecalhos("outro-token"), corpo("PAYMENT_RECEIVED"))).toThrow(
      WebhookNaoAutenticadoError,
    );
    expect(() => provider.lerWebhook(new Headers(), corpo("PAYMENT_RECEIVED"))).toThrow(WebhookNaoAutenticadoError);
  });

  it("JSON inválido ou evento sem id/pagamento é inválido", () => {
    expect(() => provider.lerWebhook(cabecalhos(), "isso não é json")).toThrow(WebhookInvalidoError);
    expect(() =>
      provider.lerWebhook(cabecalhos(), JSON.stringify({ event: "PAYMENT_RECEIVED", payment: { id: "pay_1" } })),
    ).toThrow(WebhookInvalidoError);
  });

  it("externalReference ausente vira referencia nula", () => {
    const evento = provider.lerWebhook(
      cabecalhos(),
      JSON.stringify({ id: "evt_2", event: "PAYMENT_RECEIVED", payment: { id: "pay_2" } }),
    );

    expect(evento?.referencia).toBeNull();
  });
});

describe("AsaasProvider: configuração obrigatória", () => {
  it("recusa webhookToken vazio ou só com espaços", () => {
    expect(
      () => new AsaasProvider({ apiKey: "chave", baseUrl: BASE, webhookToken: "" }),
    ).toThrow("ASAAS_WEBHOOK_TOKEN não pode ser vazio.");
    expect(
      () => new AsaasProvider({ apiKey: "chave", baseUrl: BASE, webhookToken: "   " }),
    ).toThrow("ASAAS_WEBHOOK_TOKEN não pode ser vazio.");
  });

  it("recusa apiKey vazia", () => {
    expect(
      () => new AsaasProvider({ apiKey: "", baseUrl: BASE, webhookToken: "token" }),
    ).toThrow("ASAAS_API_KEY não pode ser vazia.");
  });
});

describe("AsaasProvider: corpo da resposta", () => {
  const entrada = {
    clienteId: "cus_123",
    referencia: "cobranca-1",
    valorCentavos: 9900,
    venceEm: new Date("2026-06-18T12:00:00Z"),
    descricao: "x",
  };

  it("200 com corpo não-JSON vira falha incerta", async () => {
    const fetchMock = vi.fn(async () => new Response("não é json", { status: 200 }));

    const erro = await criarProvider(fetchMock as unknown as typeof fetch)
      .criarCobranca(entrada)
      .catch((e) => e);

    expect(erro).toBeInstanceOf(FalhaIncertaError);
  });

  it("abort durante a leitura do corpo vira falha incerta", async () => {
    const fetchMock = vi.fn(
      async () =>
        ({
          ok: true,
          status: 200,
          json: async () => {
            throw new DOMException("The operation was aborted", "AbortError");
          },
        }) as unknown as Response,
    );

    const erro = await criarProvider(fetchMock as unknown as typeof fetch)
      .criarCobranca(entrada)
      .catch((e) => e);

    expect(erro).toBeInstanceOf(FalhaIncertaError);
  });

  it("4xx com corpo não-JSON vira recusa com mensagem de fallback", async () => {
    const fetchMock = vi.fn(async () => new Response("<html>bad gateway</html>", { status: 400 }));

    const erro = await criarProvider(fetchMock as unknown as typeof fetch)
      .criarCobranca(entrada)
      .catch((e) => e);

    expect(erro).toBeInstanceOf(RecusaDefinitivaError);
    expect(erro.message).toBe("O Asaas recusou a requisição (400).");
    expect(erro.status).toBe(400);
  });
});
