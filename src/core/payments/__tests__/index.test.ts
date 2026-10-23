import { describe, expect, it } from "vitest";

import { AsaasProvider, criarPagamentoRouterDoAmbiente, pagamentoRouter, reiniciarPagamentoRouterParaTestes } from "..";

const ENV_COMPLETO = {
  ASAAS_API_KEY: "chave",
  ASAAS_WEBHOOK_TOKEN: "token",
} as unknown as NodeJS.ProcessEnv;

describe("criarPagamentoRouterDoAmbiente", () => {
  it("usa o asaas por padrão", () => {
    const router = criarPagamentoRouterDoAmbiente(ENV_COMPLETO);

    expect(router.provider("asaas")).toBeInstanceOf(AsaasProvider);
  });

  it("respeita PAGAMENTOS_ORDEM (e ignora espaços e vazios)", () => {
    const router = criarPagamentoRouterDoAmbiente({ ...ENV_COMPLETO, PAGAMENTOS_ORDEM: " asaas , " });

    expect(router.provider("asaas").nome).toBe("asaas");
  });

  it("falha com mensagem clara sem a chave do Asaas", () => {
    expect(() => criarPagamentoRouterDoAmbiente({} as unknown as NodeJS.ProcessEnv)).toThrow("ASAAS_API_KEY");
    expect(() => criarPagamentoRouterDoAmbiente({ ASAAS_API_KEY: "chave" } as unknown as NodeJS.ProcessEnv)).toThrow(
      "ASAAS_WEBHOOK_TOKEN",
    );
  });

  it("falha para provider desconhecido", () => {
    expect(() => criarPagamentoRouterDoAmbiente({ ...ENV_COMPLETO, PAGAMENTOS_ORDEM: "zzz" })).toThrow(
      'Provider de pagamento desconhecido: "zzz"',
    );
  });
});

describe("pagamentoRouter", () => {
  it("monta uma vez e reaproveita; reiniciar recria", () => {
    const original = { chave: process.env.ASAAS_API_KEY, token: process.env.ASAAS_WEBHOOK_TOKEN };
    process.env.ASAAS_API_KEY = "chave";
    process.env.ASAAS_WEBHOOK_TOKEN = "token";
    try {
      reiniciarPagamentoRouterParaTestes();
      const primeiro = pagamentoRouter();

      expect(pagamentoRouter()).toBe(primeiro);

      reiniciarPagamentoRouterParaTestes();
      expect(pagamentoRouter()).not.toBe(primeiro);
    } finally {
      process.env.ASAAS_API_KEY = original.chave;
      process.env.ASAAS_WEBHOOK_TOKEN = original.token;
      if (original.chave === undefined) delete process.env.ASAAS_API_KEY;
      if (original.token === undefined) delete process.env.ASAAS_WEBHOOK_TOKEN;
      reiniciarPagamentoRouterParaTestes();
    }
  });
});
