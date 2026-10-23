import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { criarCenario, limparCenarios } from "@/lib/pagamentos/__tests__/helpers/cenario";
import { semearCatalogoNoBancoDeTeste } from "@/db/__tests__/helpers/semear-catalogo";
import { buscarProviderClienteId, salvarProviderClienteId } from "../cliente-gateway";

describe("cliente do gateway", () => {
  beforeEach(async () => {
    await semearCatalogoNoBancoDeTeste();
    await limparCenarios();
  });
  afterEach(limparCenarios);

  it("devolve null quando a empresa ainda não tem cliente no provider", async () => {
    const { empresaId } = await criarCenario();

    expect(await buscarProviderClienteId(empresaId, "asaas")).toBeNull();
  });

  it("guarda e devolve o id do cliente, por provider", async () => {
    const { empresaId } = await criarCenario();

    await salvarProviderClienteId(empresaId, "asaas", "cus_1");

    expect(await buscarProviderClienteId(empresaId, "asaas")).toBe("cus_1");
    expect(await buscarProviderClienteId(empresaId, "outro")).toBeNull();
  });

  it("não sobrescreve um cliente já guardado", async () => {
    const { empresaId } = await criarCenario();
    await salvarProviderClienteId(empresaId, "asaas", "cus_1");

    await salvarProviderClienteId(empresaId, "asaas", "cus_2");

    expect(await buscarProviderClienteId(empresaId, "asaas")).toBe("cus_1");
  });
});
