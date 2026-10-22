import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { db } from "@/db";
import { criarAssinatura } from "@/db/queries/assinatura";
import { registrarConsumo } from "@/db/queries/consumo";
import { empresa } from "@/db/schema";
import { semearCatalogoNoBancoDeTeste } from "@/db/__tests__/helpers/semear-catalogo";
import { exigirPermissao } from "../exigir-permissao";
import { MS_POR_DIA } from "../janela";

const AGORA = new Date("2026-06-15T12:00:00Z");

async function limparBanco() {
  await db.delete(empresa);
}

async function novaEmpresa() {
  const [criada] = await db.insert(empresa).values({ nome: "Empresa Teste" }).returning();
  return criada.id;
}

describe("exigirPermissao", () => {
  beforeAll(semearCatalogoNoBancoDeTeste);
  beforeEach(limparBanco);
  afterEach(limparBanco);

  it("devolve null quando a permissão é concedida", async () => {
    const empresaId = await novaEmpresa();
    await criarAssinatura(db, { empresaId, planoChave: "escritorio", status: "ativa", origem: "suporte", inicio: AGORA });

    expect(await exigirPermissao(empresaId, "projetos.criar", AGORA)).toBeNull();
  });

  it("limite esgotado: 403 LIMITE_ATINGIDO com a data de renovação", async () => {
    const empresaId = await novaEmpresa();
    await criarAssinatura(db, { empresaId, planoChave: "trial", status: "trial", origem: "suporte", inicio: AGORA });
    for (const referencia of ["a", "b", "c"]) {
      await registrarConsumo(empresaId, "memorial.gerar", referencia, { agora: AGORA });
    }

    const resposta = await exigirPermissao(empresaId, "memorial.gerar", AGORA);

    expect(resposta?.status).toBe(403);
    expect(await resposta?.json()).toEqual({
      error: "Você atingiu o limite do seu plano para gerar memoriais. A cota renova em 29/06/2026.",
      codigo: "LIMITE_ATINGIDO",
      permissao: "memorial.gerar",
      renovaEm: new Date(AGORA.getTime() + 14 * MS_POR_DIA).toISOString(),
    });
  });

  it("permissão fora do plano (sem assinatura): 403 PERMISSAO_NEGADA sem renovaEm", async () => {
    const empresaId = await novaEmpresa();

    const resposta = await exigirPermissao(empresaId, "memorial.gerar", AGORA);

    expect(resposta?.status).toBe(403);
    expect(await resposta?.json()).toEqual({
      error: "Seu plano não inclui gerar memoriais.",
      codigo: "PERMISSAO_NEGADA",
      permissao: "memorial.gerar",
      renovaEm: null,
    });
  });
});
