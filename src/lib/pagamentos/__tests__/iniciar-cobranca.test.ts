import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

import { PaymentRouter } from "@/core/payments";
import { FalhaIncertaError, RecusaDefinitivaError } from "@/core/payments/erros";
import { criarProvedorFalso } from "@/core/payments/__tests__/helpers/provedor-falso";
import { db } from "@/db";
import { semearCatalogoNoBancoDeTeste } from "@/db/__tests__/helpers/semear-catalogo";
import { buscarProviderClienteId } from "@/db/queries/cliente-gateway";
import { cobranca } from "@/db/schema";
import { MS_POR_DIA } from "@/lib/permissoes/janela";
import {
  CobrancaNaoPermitidaError,
  DocumentoAusenteError,
  iniciarCobranca,
  valorMinimoDoAmbiente,
} from "../iniciar-cobranca";
import { AGORA, criarCenario, limparCenarios } from "./helpers/cenario";

const emDias = (dias: number) => new Date(AGORA.getTime() + dias * MS_POR_DIA);

async function todasAsCobrancas() {
  return db.select().from(cobranca);
}

describe("valorMinimoDoAmbiente", () => {
  it("usa o padrão sem variável ou com valor inválido, e a variável quando válida", () => {
    expect(valorMinimoDoAmbiente({} as unknown as NodeJS.ProcessEnv)).toBe(500);
    expect(valorMinimoDoAmbiente({ PAGAMENTO_VALOR_MINIMO_CENTAVOS: "abc" } as unknown as NodeJS.ProcessEnv)).toBe(500);
    expect(valorMinimoDoAmbiente({ PAGAMENTO_VALOR_MINIMO_CENTAVOS: "-10" } as unknown as NodeJS.ProcessEnv)).toBe(500);
    expect(valorMinimoDoAmbiente({ PAGAMENTO_VALOR_MINIMO_CENTAVOS: "1000" } as unknown as NodeJS.ProcessEnv)).toBe(1000);
  });
});

describe("iniciarCobranca", () => {
  beforeAll(semearCatalogoNoBancoDeTeste);
  beforeEach(limparCenarios);
  afterEach(limparCenarios);

  describe("assinatura", () => {
    it("trial → plano pago: grava a cobrança antes do gateway, cadastra o cliente e guarda o Pix", async () => {
      const cenario = await criarCenario();
      const provedor = criarProvedorFalso("asaas");
      vi.mocked(provedor.criarCobranca).mockImplementation(async () => {
        // Neste ponto a cobrança já tem que existir no banco (é o externalReference).
        expect(await todasAsCobrancas()).toHaveLength(1);
        return { providerChargeId: "pay_1", pix: { copiaECola: "copia", qrCodeBase64: "qr", expiraEm: null } };
      });

      const criada = await iniciarCobranca({
        empresaId: cenario.empresaId,
        tipo: "assinatura",
        planoDestinoChave: "essencial",
        agora: AGORA,
        roteador: new PaymentRouter([provedor]),
      });

      expect(criada).toMatchObject({
        tipo: "assinatura",
        status: "pendente",
        valorCentavos: 9900,
        provider: "asaas",
        providerChargeId: "pay_1",
        pixCopiaECola: "copia",
        pixQrCodeBase64: "qr",
      });
      expect(criada.venceEm).toEqual(emDias(3));
      expect(provedor.criarCliente).toHaveBeenCalledWith(
        { nome: "Empresa Cobranca", documento: "12345678000199", email: "admin@cobranca.com" },
        cenario.empresaId,
      );
      expect(provedor.criarCobranca).toHaveBeenCalledWith({
        clienteId: "cliente-asaas",
        referencia: criada.id,
        valorCentavos: 9900,
        venceEm: emDias(3),
        descricao: "DocObra — plano Essencial (assinatura)",
      });
      expect(await buscarProviderClienteId(cenario.empresaId, "asaas")).toBe("cliente-asaas");
    });

    it("reaproveita a cobrança pendente igual, sem falar de novo com o gateway", async () => {
      const cenario = await criarCenario();
      const provedor = criarProvedorFalso("asaas");
      const roteador = new PaymentRouter([provedor]);
      const dados = {
        empresaId: cenario.empresaId,
        tipo: "assinatura" as const,
        planoDestinoChave: "essencial",
        agora: AGORA,
        roteador,
      };

      const primeira = await iniciarCobranca(dados);
      const segunda = await iniciarCobranca(dados);

      expect(segunda.id).toBe(primeira.id);
      expect(provedor.criarCobranca).toHaveBeenCalledTimes(1);
      expect(await todasAsCobrancas()).toHaveLength(1);
    });

    it("cadastra o cliente do gateway uma vez só", async () => {
      const cenario = await criarCenario();
      const provedor = criarProvedorFalso("asaas");
      let contador = 0;
      vi.mocked(provedor.criarCobranca).mockImplementation(async () => ({
        providerChargeId: `pay_${++contador}`,
        pix: { copiaECola: "copia", qrCodeBase64: "qr", expiraEm: null },
      }));
      const roteador = new PaymentRouter([provedor]);

      await iniciarCobranca({ empresaId: cenario.empresaId, tipo: "assinatura", planoDestinoChave: "essencial", agora: AGORA, roteador });
      await iniciarCobranca({ empresaId: cenario.empresaId, tipo: "assinatura", planoDestinoChave: "escritorio", agora: AGORA, roteador });

      expect(provedor.criarCliente).toHaveBeenCalledTimes(1);
      expect(provedor.criarCobranca).toHaveBeenCalledTimes(2);
    });

    it("sem CPF/CNPJ: lança DocumentoAusenteError e não cria nada", async () => {
      const cenario = await criarCenario({ documento: null });
      const provedor = criarProvedorFalso("asaas");

      await expect(
        iniciarCobranca({
          empresaId: cenario.empresaId,
          tipo: "assinatura",
          planoDestinoChave: "essencial",
          agora: AGORA,
          roteador: new PaymentRouter([provedor]),
        }),
      ).rejects.toBeInstanceOf(DocumentoAusenteError);

      expect(await todasAsCobrancas()).toHaveLength(0);
      expect(provedor.criarCliente).not.toHaveBeenCalled();
    });

    it("não permite assinar com assinatura ativa e vigente", async () => {
      const cenario = await criarCenario({ planoChave: "essencial", status: "ativa", venceEm: emDias(10) });

      const erro = await iniciarCobranca({
        empresaId: cenario.empresaId,
        tipo: "assinatura",
        planoDestinoChave: "escritorio",
        agora: AGORA,
        roteador: new PaymentRouter([criarProvedorFalso("asaas")]),
      }).catch((e) => e);

      expect(erro).toBeInstanceOf(CobrancaNaoPermitidaError);
      expect(erro.motivo).toBe("assinatura_vigente");
    });

    it("permite assinar quando a assinatura está suspensa (vencida além da carência)", async () => {
      const cenario = await criarCenario({ planoChave: "essencial", status: "ativa", inicio: emDias(-60), venceEm: emDias(-20) });

      const criada = await iniciarCobranca({
        empresaId: cenario.empresaId,
        tipo: "assinatura",
        planoDestinoChave: "essencial",
        agora: AGORA,
        roteador: new PaymentRouter([criarProvedorFalso("asaas")]),
      });

      expect(criada.tipo).toBe("assinatura");
    });

    it.each([
      ["inexistente", "nao-existe"],
      ["interno", "trial"],
      ["interno de leitura limitada", "suspenso"],
    ])("recusa plano %s", async (_descricao, chave) => {
      const cenario = await criarCenario();

      const erro = await iniciarCobranca({
        empresaId: cenario.empresaId,
        tipo: "assinatura",
        planoDestinoChave: chave,
        agora: AGORA,
        roteador: new PaymentRouter([criarProvedorFalso("asaas")]),
      }).catch((e) => e);

      expect(erro).toBeInstanceOf(CobrancaNaoPermitidaError);
    });
  });

  describe("upgrade", () => {
    const ativaEssencial = () =>
      criarCenario({ planoChave: "essencial", status: "ativa", inicio: emDias(-10), venceEm: emDias(20) });

    it("cobra a diferença proporcional aos dias restantes (Fase 3) e mantém o vencimento de 3 dias", async () => {
      const cenario = await ativaEssencial();

      const criada = await iniciarCobranca({
        empresaId: cenario.empresaId,
        tipo: "upgrade",
        planoDestinoChave: "escritorio",
        agora: AGORA,
        roteador: new PaymentRouter([criarProvedorFalso("asaas")]),
      });

      // (24900 − 9900) × 20 dias restantes ÷ 30 = 10000
      expect(criada.valorCentavos).toBe(10000);
      expect(criada.venceEm).toEqual(emDias(3));
    });

    it("aplica o valor mínimo quando a diferença é menor", async () => {
      const cenario = await criarCenario({ planoChave: "essencial", status: "ativa", inicio: emDias(-29), venceEm: new Date(AGORA.getTime() + 60 * 60 * 1000) });

      const criada = await iniciarCobranca({
        empresaId: cenario.empresaId,
        tipo: "upgrade",
        planoDestinoChave: "escritorio",
        agora: AGORA,
        roteador: new PaymentRouter([criarProvedorFalso("asaas")]),
        valorMinimoCentavos: 2000,
      });

      // Último dia: (24900 − 9900) × 1 ÷ 30 = 500, abaixo do mínimo de 2000.
      expect(criada.valorCentavos).toBe(2000);
    });

    it("recusa com o motivo da política (Fase 3) e mensagem em português", async () => {
      const cenario = await criarCenario({ planoChave: "escritorio", status: "ativa", inicio: emDias(-10), venceEm: emDias(20) });

      const erro = await iniciarCobranca({
        empresaId: cenario.empresaId,
        tipo: "upgrade",
        planoDestinoChave: "essencial",
        agora: AGORA,
        roteador: new PaymentRouter([criarProvedorFalso("asaas")]),
      }).catch((e) => e);

      expect(erro).toBeInstanceOf(CobrancaNaoPermitidaError);
      expect(erro.motivo).toBe("mesmo_nivel_ou_menor");
      expect(erro.message).toContain("nível maior");
    });

    it("não permite upgrade em trial nem com o ciclo vencido", async () => {
      const trial = await criarCenario();
      const erroTrial = await iniciarCobranca({
        empresaId: trial.empresaId,
        tipo: "upgrade",
        planoDestinoChave: "essencial",
        agora: AGORA,
        roteador: new PaymentRouter([criarProvedorFalso("asaas")]),
      }).catch((e) => e);
      expect(erroTrial.motivo).toBe("upgrade_indisponivel");

      const vencida = await criarCenario({ planoChave: "essencial", status: "ativa", inicio: emDias(-40), venceEm: emDias(-2), email: "venc@cobranca.com" });
      const erroVencida = await iniciarCobranca({
        empresaId: vencida.empresaId,
        tipo: "upgrade",
        planoDestinoChave: "escritorio",
        agora: AGORA,
        roteador: new PaymentRouter([criarProvedorFalso("asaas")]),
      }).catch((e) => e);
      expect(erroVencida.motivo).toBe("upgrade_indisponivel");
    });
  });

  describe("renovação", () => {
    it("cobra o preço cheio do plano atual, vencendo no fim do ciclo", async () => {
      const venceEm = emDias(3);
      const cenario = await criarCenario({ planoChave: "essencial", status: "ativa", inicio: emDias(-27), venceEm });

      const criada = await iniciarCobranca({
        empresaId: cenario.empresaId,
        tipo: "renovacao",
        agora: AGORA,
        roteador: new PaymentRouter([criarProvedorFalso("asaas")]),
      });

      expect(criada).toMatchObject({ tipo: "renovacao", valorCentavos: 9900 });
      expect(criada.venceEm).toEqual(venceEm);
    });

    it("em carência (ciclo já vencido) vence em 3 dias, não no passado", async () => {
      const cenario = await criarCenario({ planoChave: "essencial", status: "ativa", inicio: emDias(-32), venceEm: emDias(-2) });

      const criada = await iniciarCobranca({
        empresaId: cenario.empresaId,
        tipo: "renovacao",
        agora: AGORA,
        roteador: new PaymentRouter([criarProvedorFalso("asaas")]),
      });

      expect(criada.venceEm).toEqual(emDias(3));
    });

    it("não permite renovar trial", async () => {
      const cenario = await criarCenario();

      const erro = await iniciarCobranca({
        empresaId: cenario.empresaId,
        tipo: "renovacao",
        agora: AGORA,
        roteador: new PaymentRouter([criarProvedorFalso("asaas")]),
      }).catch((e) => e);

      expect(erro).toBeInstanceOf(CobrancaNaoPermitidaError);
      expect(erro.motivo).toBe("renovacao_indisponivel");
    });
  });

  describe("falhas do gateway", () => {
    it("falha incerta: consulta por referência e adota a cobrança que já existia no gateway", async () => {
      const cenario = await criarCenario();
      const provedor = criarProvedorFalso("asaas", {
        criarCobranca: vi.fn(async () => {
          throw new FalhaIncertaError("timeout");
        }),
        buscarCobrancaPorReferencia: vi.fn(async () => ({
          providerChargeId: "pay_existente",
          pix: { copiaECola: "copia-existente", qrCodeBase64: "qr-existente", expiraEm: null },
        })),
      });

      const criada = await iniciarCobranca({
        empresaId: cenario.empresaId,
        tipo: "assinatura",
        planoDestinoChave: "essencial",
        agora: AGORA,
        roteador: new PaymentRouter([provedor]),
      });

      expect(criada).toMatchObject({ provider: "asaas", providerChargeId: "pay_existente", pixCopiaECola: "copia-existente" });
      expect(provedor.buscarCobrancaPorReferencia).toHaveBeenCalledWith(criada.id);
    });

    it("falha incerta sem cobrança no gateway: propaga o erro, mantém a cobrança e a próxima chamada a reaproveita", async () => {
      const cenario = await criarCenario();
      const provedor = criarProvedorFalso("asaas");
      vi.mocked(provedor.criarCobranca).mockRejectedValueOnce(new FalhaIncertaError("timeout"));
      const dados = {
        empresaId: cenario.empresaId,
        tipo: "assinatura" as const,
        planoDestinoChave: "essencial",
        agora: AGORA,
        roteador: new PaymentRouter([provedor]),
      };

      await expect(iniciarCobranca(dados)).rejects.toBeInstanceOf(FalhaIncertaError);
      const [pendente] = await todasAsCobrancas();
      expect(pendente.providerChargeId).toBeNull();

      const retomada = await iniciarCobranca(dados);

      expect(retomada.id).toBe(pendente.id);
      expect(retomada.providerChargeId).toBe("cobranca-asaas");
      expect(await todasAsCobrancas()).toHaveLength(1);
    });

    it("recusa definitiva no primeiro provider cai para o segundo", async () => {
      const cenario = await criarCenario();
      const primeiro = criarProvedorFalso("a", {
        criarCobranca: vi.fn(async () => {
          throw new RecusaDefinitivaError("recusou");
        }),
      });
      const segundo = criarProvedorFalso("b");

      const criada = await iniciarCobranca({
        empresaId: cenario.empresaId,
        tipo: "assinatura",
        planoDestinoChave: "essencial",
        agora: AGORA,
        roteador: new PaymentRouter([primeiro, segundo]),
      });

      expect(criada.provider).toBe("b");
      expect(await buscarProviderClienteId(cenario.empresaId, "b")).toBe("cliente-b");
    });

    it("a cobrança fica gravada mesmo quando o gateway recusa tudo", async () => {
      const cenario = await criarCenario();
      const provedor = criarProvedorFalso("asaas", {
        criarCobranca: vi.fn(async () => {
          throw new RecusaDefinitivaError("recusou");
        }),
      });

      await expect(
        iniciarCobranca({
          empresaId: cenario.empresaId,
          tipo: "assinatura",
          planoDestinoChave: "essencial",
          agora: AGORA,
          roteador: new PaymentRouter([provedor]),
        }),
      ).rejects.toBeInstanceOf(RecusaDefinitivaError);

      const [guardada] = await db.select().from(cobranca).where(eq(cobranca.empresaId, cenario.empresaId));
      expect(guardada.status).toBe("pendente");
      expect(guardada.providerChargeId).toBeNull();
    });

    it("falha incerta e a consulta por referência também falha: relança o erro original", async () => {
      const cenario = await criarCenario();
      const original = new FalhaIncertaError("timeout");
      const provedor = criarProvedorFalso("asaas", {
        criarCobranca: vi.fn(async () => {
          throw original;
        }),
        buscarCobrancaPorReferencia: vi.fn(async () => {
          throw new Error("consulta fora do ar");
        }),
      });

      const erro = await iniciarCobranca({
        empresaId: cenario.empresaId,
        tipo: "assinatura",
        planoDestinoChave: "essencial",
        agora: AGORA,
        roteador: new PaymentRouter([provedor]),
      }).catch((e) => e);

      expect(erro).toBe(original);
    });
  });

  describe("reaproveitamento e concorrência", () => {
    function provedorComIdsDistintos(pixExpiraEm: Date | null = null) {
      const provedor = criarProvedorFalso("asaas");
      let contador = 0;
      vi.mocked(provedor.criarCobranca).mockImplementation(async () => ({
        providerChargeId: `pay_${++contador}`,
        pix: { copiaECola: "copia", qrCodeBase64: "qr", expiraEm: pixExpiraEm },
      }));
      return provedor;
    }

    it("Pix expirado (com a cobrança ainda no prazo): cria outra, cancela a velha local e no gateway", async () => {
      const cenario = await criarCenario();
      const provedor = provedorComIdsDistintos(new Date(AGORA.getTime() - 60 * 60 * 1000));
      const dados = {
        empresaId: cenario.empresaId,
        tipo: "assinatura" as const,
        planoDestinoChave: "essencial",
        agora: AGORA,
        roteador: new PaymentRouter([provedor]),
      };

      const velha = await iniciarCobranca(dados);
      const nova = await iniciarCobranca(dados);

      expect(nova.id).not.toBe(velha.id);
      const linhas = await todasAsCobrancas();
      expect(linhas.find((c) => c.id === velha.id)?.status).toBe("cancelada");
      expect(linhas.find((c) => c.id === nova.id)?.status).toBe("pendente");
      expect(provedor.cancelarCobranca).toHaveBeenCalledWith("pay_1");
    });

    it("pendente com valor diferente não é reaproveitada: a velha é cancelada e nasce outra", async () => {
      const cenario = await criarCenario({ planoChave: "essencial", status: "ativa", inicio: emDias(-10), venceEm: emDias(20) });
      const provedor = provedorComIdsDistintos();
      const dados = {
        empresaId: cenario.empresaId,
        tipo: "upgrade" as const,
        planoDestinoChave: "escritorio",
        agora: AGORA,
        roteador: new PaymentRouter([provedor]),
      };

      const velha = await iniciarCobranca({ ...dados, valorMinimoCentavos: 500 });
      const nova = await iniciarCobranca({ ...dados, valorMinimoCentavos: 20000 });

      expect(velha.valorCentavos).toBe(10000);
      expect(nova.valorCentavos).toBe(20000);
      expect(nova.id).not.toBe(velha.id);
      expect((await todasAsCobrancas()).filter((c) => c.status === "pendente")).toHaveLength(1);
    });

    it("falha ao cancelar no gateway não derruba a requisição", async () => {
      const cenario = await criarCenario();
      const provedor = provedorComIdsDistintos(new Date(AGORA.getTime() - 1000));
      vi.mocked(provedor.cancelarCobranca).mockRejectedValue(new Error("gateway fora"));
      const erroLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
      const dados = {
        empresaId: cenario.empresaId,
        tipo: "assinatura" as const,
        planoDestinoChave: "essencial",
        agora: AGORA,
        roteador: new PaymentRouter([provedor]),
      };

      await iniciarCobranca(dados);
      const nova = await iniciarCobranca(dados);

      expect(nova.status).toBe("pendente");
      expect(erroLog).toHaveBeenCalled();
      erroLog.mockRestore();
    });

    it("duas chamadas concorrentes terminam com uma única pendente para a chave", async () => {
      const cenario = await criarCenario();
      const dados = {
        empresaId: cenario.empresaId,
        tipo: "assinatura" as const,
        planoDestinoChave: "essencial",
        agora: AGORA,
        roteador: new PaymentRouter([provedorComIdsDistintos()]),
      };

      await Promise.allSettled([iniciarCobranca(dados), iniciarCobranca(dados)]);

      const pendentes = (await todasAsCobrancas()).filter((c) => c.status === "pendente");
      expect(pendentes).toHaveLength(1);
    });
  });
});
