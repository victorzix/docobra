import { describe, expect, it, vi } from "vitest";

import { FalhaIncertaError, RecusaDefinitivaError } from "../erros";
import { PaymentRouter } from "../router";
import { criarProvedorFalso } from "./helpers/provedor-falso";

const ENTRADA = {
  referencia: "cobranca-1",
  valorCentavos: 9900,
  venceEm: new Date("2026-06-18T12:00:00Z"),
  descricao: "DocObra — plano Essencial",
};

const resolverCliente = async (provider: { nome: string }) => `cliente-${provider.nome}`;

describe("PaymentRouter", () => {
  it("exige ao menos um provider", () => {
    expect(() => new PaymentRouter([])).toThrow("ao menos um provider");
  });

  it("cria a cobrança no primeiro provider e informa qual foi", async () => {
    const primeiro = criarProvedorFalso("a");
    const segundo = criarProvedorFalso("b");

    const resultado = await new PaymentRouter([primeiro, segundo]).criarCobranca(ENTRADA, resolverCliente);

    expect(resultado).toMatchObject({ provider: "a", providerChargeId: "cobranca-a" });
    expect(primeiro.criarCobranca).toHaveBeenCalledWith({ ...ENTRADA, clienteId: "cliente-a" });
    expect(segundo.criarCobranca).not.toHaveBeenCalled();
  });

  it("passa para o próximo provider quando o primeiro recusa de forma definitiva", async () => {
    const primeiro = criarProvedorFalso("a", {
      criarCobranca: vi.fn(async () => {
        throw new RecusaDefinitivaError("recusou");
      }),
    });
    const segundo = criarProvedorFalso("b");

    const resultado = await new PaymentRouter([primeiro, segundo]).criarCobranca(ENTRADA, resolverCliente);

    expect(resultado.provider).toBe("b");
  });

  it("resolve o cliente de cada provider tentado", async () => {
    const primeiro = criarProvedorFalso("a", {
      criarCobranca: vi.fn(async () => {
        throw new RecusaDefinitivaError("recusou");
      }),
    });
    const segundo = criarProvedorFalso("b");
    const resolver = vi.fn(resolverCliente);

    await new PaymentRouter([primeiro, segundo]).criarCobranca(ENTRADA, resolver);

    expect(resolver).toHaveBeenCalledTimes(2);
    expect(segundo.criarCobranca).toHaveBeenCalledWith({ ...ENTRADA, clienteId: "cliente-b" });
  });

  it("NÃO troca de provider em falha incerta e anota qual provider falhou", async () => {
    const primeiro = criarProvedorFalso("a", {
      criarCobranca: vi.fn(async () => {
        throw new FalhaIncertaError("timeout");
      }),
    });
    const segundo = criarProvedorFalso("b");

    const erro = await new PaymentRouter([primeiro, segundo])
      .criarCobranca(ENTRADA, resolverCliente)
      .catch((e) => e);

    expect(erro).toBeInstanceOf(FalhaIncertaError);
    expect(erro.provider).toBe("a");
    expect(segundo.criarCobranca).not.toHaveBeenCalled();
  });

  it("falha incerta ao resolver o cliente também não troca de provider", async () => {
    const primeiro = criarProvedorFalso("a");
    const segundo = criarProvedorFalso("b");
    const resolver = async () => {
      throw new FalhaIncertaError("timeout no cliente");
    };

    const erro = await new PaymentRouter([primeiro, segundo]).criarCobranca(ENTRADA, resolver).catch((e) => e);

    expect(erro).toBeInstanceOf(FalhaIncertaError);
    expect(erro.provider).toBe("a");
    expect(segundo.criarCobranca).not.toHaveBeenCalled();
  });

  it("se todos recusam, lança a última recusa", async () => {
    const recusa = (nome: string) =>
      criarProvedorFalso(nome, {
        criarCobranca: vi.fn(async () => {
          throw new RecusaDefinitivaError(`recusa de ${nome}`);
        }),
      });

    const erro = await new PaymentRouter([recusa("a"), recusa("b")])
      .criarCobranca(ENTRADA, resolverCliente)
      .catch((e) => e);

    expect(erro).toBeInstanceOf(RecusaDefinitivaError);
    expect(erro.message).toBe("recusa de b");
  });

  it("provider(nome) devolve o provider ou lança para nome desconhecido", () => {
    const router = new PaymentRouter([criarProvedorFalso("a")]);

    expect(router.provider("a").nome).toBe("a");
    expect(() => router.provider("zzz")).toThrow('Provider de pagamento desconhecido: "zzz"');
  });
});
