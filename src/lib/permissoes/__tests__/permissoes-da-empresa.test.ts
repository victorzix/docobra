import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { db } from "@/db";
import { criarAssinatura } from "@/db/queries/assinatura";
import { registrarConsumo } from "@/db/queries/consumo";
import { empresa } from "@/db/schema";
import { semearCatalogoNoBancoDeTeste } from "@/db/__tests__/helpers/semear-catalogo";
import { MS_POR_DIA } from "../janela";
import { carregarPermissoesDaEmpresa } from "../permissoes-da-empresa";
import { PERMISSOES_DE_USO } from "../permissoes-de-uso";

const AGORA = new Date("2026-06-15T12:00:00Z");

async function limparBanco() {
  await db.delete(empresa);
}

async function novaEmpresa() {
  const [criada] = await db.insert(empresa).values({ nome: "Empresa Teste" }).returning();
  return criada.id;
}

describe("carregarPermissoesDaEmpresa", () => {
  beforeAll(semearCatalogoNoBancoDeTeste);
  beforeEach(limparBanco);
  afterEach(limparBanco);

  it("devolve as quatro permissões de uso, com datas em ISO", async () => {
    const empresaId = await novaEmpresa();
    await criarAssinatura(db, { empresaId, planoChave: "trial", status: "trial", origem: "suporte", inicio: AGORA });
    await registrarConsumo(empresaId, "projetos.criar", "p1", { agora: AGORA });

    const permissoes = await carregarPermissoesDaEmpresa(empresaId, AGORA);

    expect(Object.keys(permissoes).sort()).toEqual([...PERMISSOES_DE_USO].sort());
    expect(permissoes["projetos.criar"]).toEqual({
      permitido: true,
      limite: 2,
      usado: 1,
      restante: 1,
      renovaEm: new Date(AGORA.getTime() + 14 * MS_POR_DIA).toISOString(),
    });
    expect(permissoes["memorial.audio"]).toEqual({
      permitido: true,
      limite: null,
      usado: 0,
      restante: null,
      renovaEm: null,
    });
  });

  it("empresa sem assinatura: todas negadas", async () => {
    const empresaId = await novaEmpresa();

    const permissoes = await carregarPermissoesDaEmpresa(empresaId, AGORA);

    for (const chave of PERMISSOES_DE_USO) {
      expect(permissoes[chave].permitido).toBe(false);
    }
  });
});
