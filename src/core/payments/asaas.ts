import { timingSafeEqual } from "node:crypto";

import {
  FalhaIncertaError,
  RecusaDefinitivaError,
  WebhookInvalidoError,
  WebhookNaoAutenticadoError,
} from "./erros";
import { centavosParaReais, dataIso } from "./formatos";
import type {
  CobrancaCriada,
  CriarCobrancaInput,
  DadosCliente,
  EventoPagamento,
  PaymentProvider,
  StatusEvento,
} from "./types";

export interface OpcoesAsaas {
  apiKey: string;
  baseUrl: string;
  webhookToken: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

const STATUS_POR_EVENTO: Record<string, StatusEvento> = {
  PAYMENT_RECEIVED: "paga",
  PAYMENT_CONFIRMED: "paga",
  PAYMENT_OVERDUE: "vencida",
  PAYMENT_DELETED: "cancelada",
  PAYMENT_REFUNDED: "estornada",
};

const TIMEOUT_PADRAO_MS = 15_000;

interface ErroAsaas {
  errors?: { code?: string; description?: string }[];
}

interface PagamentoAsaas {
  id: string;
  deleted?: boolean;
}

interface QrCodeAsaas {
  encodedImage: string;
  payload: string;
  expirationDate?: string;
}

interface CorpoWebhookAsaas {
  id?: unknown;
  event?: unknown;
  payment?: { id?: unknown; externalReference?: unknown };
}

// "2026-06-18 23:59:59" vem sem fuso: é horário de Brasília.
function dataDoAsaas(texto: string): Date {
  return new Date(texto.includes("T") ? texto : `${texto.replace(" ", "T")}-03:00`);
}

function tokensIguais(recebido: string, esperado: string): boolean {
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

export class AsaasProvider implements PaymentProvider {
  readonly nome = "asaas";

  constructor(private readonly opcoes: OpcoesAsaas) {}

  private async requisitar<T>(metodo: string, caminho: string, corpo?: unknown): Promise<T> {
    const fetchImpl = this.opcoes.fetchImpl ?? fetch;

    let resposta: Response;
    try {
      resposta = await fetchImpl(`${this.opcoes.baseUrl}${caminho}`, {
        method: metodo,
        headers: {
          access_token: this.opcoes.apiKey,
          "Content-Type": "application/json",
          "User-Agent": "docobra",
        },
        body: corpo === undefined ? undefined : JSON.stringify(corpo),
        signal: AbortSignal.timeout(this.opcoes.timeoutMs ?? TIMEOUT_PADRAO_MS),
      });
    } catch (erro) {
      throw new FalhaIncertaError("Falha de rede ao falar com o Asaas.", erro);
    }

    if (resposta.status >= 500 || resposta.status === 408 || resposta.status === 429) {
      throw new FalhaIncertaError(`O Asaas respondeu ${resposta.status}.`);
    }

    if (!resposta.ok) {
      const detalhe = (await resposta.json().catch(() => null)) as ErroAsaas | null;
      const primeiro = detalhe?.errors?.[0];
      throw new RecusaDefinitivaError(
        primeiro?.description ?? `O Asaas recusou a requisição (${resposta.status}).`,
        primeiro?.code,
        resposta.status,
      );
    }

    return (await resposta.json()) as T;
  }

  async criarCliente(dados: DadosCliente, referencia: string): Promise<string> {
    const cliente = await this.requisitar<{ id: string }>("POST", "/v3/customers", {
      name: dados.nome,
      cpfCnpj: dados.documento,
      ...(dados.email ? { email: dados.email } : {}),
      externalReference: referencia,
    });
    return cliente.id;
  }

  private async buscarQrCode(pagamentoId: string): Promise<CobrancaCriada> {
    const qr = await this.requisitar<QrCodeAsaas>("GET", `/v3/payments/${pagamentoId}/pixQrCode`);
    return {
      providerChargeId: pagamentoId,
      pix: {
        copiaECola: qr.payload,
        qrCodeBase64: qr.encodedImage,
        expiraEm: qr.expirationDate ? dataDoAsaas(qr.expirationDate) : null,
      },
    };
  }

  async criarCobranca(input: CriarCobrancaInput): Promise<CobrancaCriada> {
    const pagamento = await this.requisitar<PagamentoAsaas>("POST", "/v3/payments", {
      customer: input.clienteId,
      billingType: "PIX",
      value: centavosParaReais(input.valorCentavos),
      dueDate: dataIso(input.venceEm),
      externalReference: input.referencia,
      description: input.descricao,
    });
    return this.buscarQrCode(pagamento.id);
  }

  async buscarCobrancaPorReferencia(referencia: string): Promise<CobrancaCriada | null> {
    const lista = await this.requisitar<{ data: PagamentoAsaas[] }>(
      "GET",
      `/v3/payments?externalReference=${encodeURIComponent(referencia)}&limit=10`,
    );
    const existente = lista.data.find((pagamento) => !pagamento.deleted);
    return existente ? this.buscarQrCode(existente.id) : null;
  }

  async cancelarCobranca(providerChargeId: string): Promise<void> {
    try {
      await this.requisitar("DELETE", `/v3/payments/${providerChargeId}`);
    } catch (erro) {
      if (erro instanceof RecusaDefinitivaError && erro.status === 404) return;
      throw erro;
    }
  }

  lerWebhook(headers: Headers, corpoCru: string): EventoPagamento | null {
    if (!tokensIguais(headers.get("asaas-access-token") ?? "", this.opcoes.webhookToken)) {
      throw new WebhookNaoAutenticadoError();
    }

    let corpo: CorpoWebhookAsaas;
    try {
      corpo = JSON.parse(corpoCru) as CorpoWebhookAsaas;
    } catch {
      throw new WebhookInvalidoError("O corpo do webhook não é um JSON válido.");
    }

    const status = typeof corpo.event === "string" ? STATUS_POR_EVENTO[corpo.event] : undefined;
    if (!status) return null;

    if (typeof corpo.id !== "string" || typeof corpo.payment?.id !== "string") {
      throw new WebhookInvalidoError("Evento sem id ou sem pagamento.");
    }

    return {
      eventId: corpo.id,
      tipoOriginal: corpo.event as string,
      status,
      providerChargeId: corpo.payment.id,
      referencia: typeof corpo.payment.externalReference === "string" ? corpo.payment.externalReference : null,
      payload: corpo,
    };
  }
}
