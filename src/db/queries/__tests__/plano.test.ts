import { beforeAll, describe, expect, it } from "vitest";

import { semearCatalogoNoBancoDeTeste } from "@/db/__tests__/helpers/semear-catalogo";
import { buscarPlanoDoCatalogo, buscarPlanoDoCatalogoPorId } from "../plano";

describe("plano do catálogo", () => {
  beforeAll(semearCatalogoNoBancoDeTeste);

  it("busca por chave com os campos de cobrança", async () => {
    const essencial = await buscarPlanoDoCatalogo("essencial");

    expect(essencial).toMatchObject({
      chave: "essencial",
      nome: "Essencial",
      nivel: 1,
      cicloDias: 30,
      precoCentavos: 9900,
      ativo: true,
      interno: false,
    });
  });

  it("marca os planos internos", async () => {
    expect((await buscarPlanoDoCatalogo("trial"))?.interno).toBe(true);
    expect((await buscarPlanoDoCatalogo("suspenso"))?.interno).toBe(true);
  });

  it("busca por id e devolve null quando não existe", async () => {
    const essencial = await buscarPlanoDoCatalogo("essencial");

    expect((await buscarPlanoDoCatalogoPorId(essencial!.id))?.chave).toBe("essencial");
    expect(await buscarPlanoDoCatalogo("nao-existe")).toBeNull();
    expect(await buscarPlanoDoCatalogoPorId("00000000-0000-0000-0000-000000000000")).toBeNull();
  });
});
