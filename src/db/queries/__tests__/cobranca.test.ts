import { eq } from "drizzle-orm";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { db } from "@/db";
import { cobranca } from "@/db/schema";
import { semearCatalogoNoBancoDeTeste } from "@/db/__tests__/helpers/semear-catalogo";
import { MS_POR_DIA } from "@/lib/permissoes/janela";
import {
  AGORA,
  criarCenario,
  idDoPlano,
  inserirCobranca,
  limparCenarios,
} from "@/lib/pagamentos/__tests__/helpers/cenario";
import {
  buscarCobrancaDaEmpresa,
  buscarCobrancaPendenteReutilizavel,
  buscarCobrancaPorId,
  cancelarCobrancasPendentesObsoletas,
  criarCobrancaPendente,
  criarCobrancaPendenteSeLivre,
  registrarCobrancaNoGateway,
} from "../cobranca";

describe("queries de cobrança", () => {
  beforeAll(semearCatalogoNoBancoDeTeste);
  beforeEach(limparCenarios);
  afterEach(limparCenarios);

  it("cria uma cobrança pendente sem dados do gateway", async () => {
    const cenario = await criarCenario();

    const criada = await criarCobrancaPendente({
      assinaturaId: cenario.assinaturaId,
      empresaId: cenario.empresaId,
      tipo: "assinatura",
      planoDestinoId: await idDoPlano("essencial"),
      valorCentavos: 9900,
      venceEm: new Date(AGORA.getTime() + 3 * MS_POR_DIA),
    });

    expect(criada).toMatchObject({ status: "pendente", valorCentavos: 9900, tipo: "assinatura", provider: null });
  });

  it("busca por id e por empresa (outra empresa não enxerga)", async () => {
    const cenario = await criarCenario();
    const outra = await criarCenario({ email: "outra@cobranca.com" });
    const criada = await inserirCobranca(cenario);

    expect((await buscarCobrancaPorId(criada.id))?.id).toBe(criada.id);
    expect((await buscarCobrancaDaEmpresa(criada.id, cenario.empresaId))?.id).toBe(criada.id);
    expect(await buscarCobrancaDaEmpresa(criada.id, outra.empresaId)).toBeNull();
    expect(await buscarCobrancaPorId("00000000-0000-0000-0000-000000000000")).toBeNull();
  });

  it("registra no gateway o provider, o id e o Pix", async () => {
    const cenario = await criarCenario();
    const criada = await inserirCobranca(cenario, { provider: null, providerChargeId: null });
    const expiraEm = new Date("2026-06-18T23:59:59-03:00");

    const atualizada = await registrarCobrancaNoGateway(criada.id, {
      provider: "asaas",
      providerChargeId: "pay_9",
      pix: { copiaECola: "copia-e-cola", qrCodeBase64: "qr", expiraEm },
    });

    expect(atualizada).toMatchObject({
      provider: "asaas",
      providerChargeId: "pay_9",
      pixCopiaECola: "copia-e-cola",
      pixQrCodeBase64: "qr",
    });
    expect(atualizada.pixExpiraEm).toEqual(expiraEm);
  });

  describe("buscarCobrancaPendenteReutilizavel", () => {
    it("devolve a pendente do mesmo tipo e plano que ainda não venceu", async () => {
      const cenario = await criarCenario();
      await inserirCobranca(cenario, { status: "cancelada" });
      const maisRecente = await inserirCobranca(cenario);

      const achada = await buscarCobrancaPendenteReutilizavel({
        assinaturaId: cenario.assinaturaId,
        tipo: "assinatura",
        planoDestinoId: await idDoPlano("essencial"),
        valorCentavos: 9900,
        agora: AGORA,
      });

      expect(achada?.id).toBe(maisRecente.id);
    });

    it("ignora outro tipo, outro plano, outro status e cobrança vencida", async () => {
      const cenario = await criarCenario();
      await inserirCobranca(cenario, { tipo: "upgrade" });
      await inserirCobranca(cenario, { planoChave: "escritorio" });
      await inserirCobranca(cenario, { status: "paga" });
      await inserirCobranca(cenario, { venceEm: new Date(AGORA.getTime() - MS_POR_DIA) });

      const achada = await buscarCobrancaPendenteReutilizavel({
        assinaturaId: cenario.assinaturaId,
        tipo: "assinatura",
        planoDestinoId: await idDoPlano("essencial"),
        valorCentavos: 9900,
        agora: AGORA,
      });

      expect(achada).toBeNull();
    });

    it("ignora pendente com valor diferente ou com Pix já expirado, mas aceita Pix ainda válido", async () => {
      const cenario = await criarCenario();
      const filtro = async () =>
        buscarCobrancaPendenteReutilizavel({
          assinaturaId: cenario.assinaturaId,
          tipo: "assinatura",
          planoDestinoId: await idDoPlano("essencial"),
          valorCentavos: 9900,
          agora: AGORA,
        });

      const outroValor = await inserirCobranca(cenario, { valorCentavos: 5000 });
      expect(await filtro()).toBeNull();
      await db.delete(cobranca).where(eq(cobranca.id, outroValor.id));

      const expirada = await inserirCobranca(cenario, { pixExpiraEm: new Date(AGORA.getTime() - 1000) });
      expect(await filtro()).toBeNull();
      await db.delete(cobranca).where(eq(cobranca.id, expirada.id));

      const valida = await inserirCobranca(cenario, { pixExpiraEm: new Date(AGORA.getTime() + 1000) });
      expect((await filtro())?.id).toBe(valida.id);
    });
  });

  describe("cancelarCobrancasPendentesObsoletas e criarCobrancaPendenteSeLivre", () => {
    it("cancela só as pendentes não reutilizáveis da mesma chave e devolve as canceladas", async () => {
      const cenario = await criarCenario();
      const planoDestinoId = await idDoPlano("essencial");
      const velha = await inserirCobranca(cenario, { valorCentavos: 5000 });
      const outroTipo = await inserirCobranca(cenario, { tipo: "upgrade", valorCentavos: 5000 });

      const canceladas = await cancelarCobrancasPendentesObsoletas({
        assinaturaId: cenario.assinaturaId,
        tipo: "assinatura",
        planoDestinoId,
        valorCentavos: 9900,
        agora: AGORA,
      });

      expect(canceladas.map((c) => c.id)).toEqual([velha.id]);
      expect((await buscarCobrancaPorId(velha.id))?.status).toBe("cancelada");
      expect((await buscarCobrancaPorId(outroTipo.id))?.status).toBe("pendente");
    });

    it("não cria segunda pendente para a mesma chave", async () => {
      const cenario = await criarCenario();
      const dados = {
        assinaturaId: cenario.assinaturaId,
        empresaId: cenario.empresaId,
        tipo: "assinatura" as const,
        planoDestinoId: await idDoPlano("essencial"),
        valorCentavos: 9900,
        venceEm: new Date(AGORA.getTime() + 3 * MS_POR_DIA),
      };

      expect(await criarCobrancaPendenteSeLivre(dados)).not.toBeNull();
      expect(await criarCobrancaPendenteSeLivre(dados)).toBeNull();
    });
  });
});