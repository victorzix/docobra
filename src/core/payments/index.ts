import { AsaasProvider } from "./asaas";
import { PaymentRouter } from "./router";
import type { PaymentProvider } from "./types";

export * from "./types";
export { AsaasProvider, PaymentRouter };

const BASE_URL_SANDBOX_ASAAS = "https://api-sandbox.asaas.com";

function exigir(valor: string | undefined, nome: string): string {
  if (!valor) throw new Error(`Variável de ambiente ${nome} não definida.`);
  return valor;
}

function montarProvider(nome: string, env: NodeJS.ProcessEnv): PaymentProvider {
  if (nome === "asaas") {
    return new AsaasProvider({
      apiKey: exigir(env.ASAAS_API_KEY, "ASAAS_API_KEY"),
      baseUrl: env.ASAAS_BASE_URL || BASE_URL_SANDBOX_ASAAS,
      webhookToken: exigir(env.ASAAS_WEBHOOK_TOKEN, "ASAAS_WEBHOOK_TOKEN"),
    });
  }
  throw new Error(`Provider de pagamento desconhecido: "${nome}".`);
}

export function criarPagamentoRouterDoAmbiente(env: NodeJS.ProcessEnv = process.env): PaymentRouter {
  const ordem = (env.PAGAMENTOS_ORDEM || "asaas")
    .split(",")
    .map((nome) => nome.trim())
    .filter(Boolean);
  return new PaymentRouter(ordem.map((nome) => montarProvider(nome, env)));
}

// Preguiçoso de propósito: sem as chaves o app (e os testes) sobem normalmente.
let instancia: PaymentRouter | null = null;

export function pagamentoRouter(): PaymentRouter {
  instancia ??= criarPagamentoRouterDoAmbiente();
  return instancia;
}

export function reiniciarPagamentoRouterParaTestes(): void {
  instancia = null;
}
