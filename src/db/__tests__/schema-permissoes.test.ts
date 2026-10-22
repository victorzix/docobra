import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import {
  assinatura,
  assinaturaTrecho,
  consumo,
  empresa,
  empresaPermissao,
  permissao,
  plano,
  planoPermissao,
} from "@/db/schema";

const CHAVE_PERMISSAO = "teste.schema.permissao";
const CHAVE_PLANO = "teste-schema-plano";

async function limpar() {
  await db.delete(empresa);
  await db.delete(permissao).where(eq(permissao.chave, CHAVE_PERMISSAO));
  await db.delete(plano).where(eq(plano.chave, CHAVE_PLANO));
}

async function criarBase() {
  const [novaEmpresa] = await db.insert(empresa).values({ nome: "Empresa Teste" }).returning();
  const [novaPermissao] = await db
    .insert(permissao)
    .values({ chave: CHAVE_PERMISSAO, tipo: "limite" })
    .returning();
  const [novoPlano] = await db
    .insert(plano)
    .values({ chave: CHAVE_PLANO, nome: "Plano Teste", cicloDias: 30 })
    .returning();
  return { novaEmpresa, novaPermissao, novoPlano };
}

describe("schema de permissões", () => {
  beforeEach(limpar);
  afterEach(limpar);

  it("rejeita duas permissões com a mesma chave", async () => {
    await db.insert(permissao).values({ chave: CHAVE_PERMISSAO, tipo: "limite" });

    await expect(
      db.insert(permissao).values({ chave: CHAVE_PERMISSAO, tipo: "booleana" }),
    ).rejects.toThrow();
  });

  it("rejeita consumo repetido da mesma referência", async () => {
    const { novaEmpresa, novaPermissao } = await criarBase();
    const linha = {
      empresaId: novaEmpresa.id,
      permissaoId: novaPermissao.id,
      referencia: "item-1",
    };

    await db.insert(consumo).values(linha);

    await expect(db.insert(consumo).values(linha)).rejects.toThrow();
  });

  it("rejeita um segundo trecho vigente na mesma assinatura", async () => {
    const { novaEmpresa, novoPlano } = await criarBase();
    const [novaAssinatura] = await db
      .insert(assinatura)
      .values({ empresaId: novaEmpresa.id, venceEm: new Date("2027-01-01T00:00:00Z") })
      .returning();
    const trecho = { assinaturaId: novaAssinatura.id, planoId: novoPlano.id };

    await db.insert(assinaturaTrecho).values(trecho);

    await expect(db.insert(assinaturaTrecho).values(trecho)).rejects.toThrow();
  });

  it("rejeita vínculo com valor mas sem janela", async () => {
    const { novaPermissao, novoPlano } = await criarBase();

    await expect(
      db.insert(planoPermissao).values({
        planoId: novoPlano.id,
        permissaoId: novaPermissao.id,
        valor: 5,
        janelaDias: null,
      }),
    ).rejects.toThrow();
  });

  it("rejeita janela do vínculo do plano igual a zero", async () => {
    const { novaPermissao, novoPlano } = await criarBase();

    await expect(
      db.insert(planoPermissao).values({
        planoId: novoPlano.id,
        permissaoId: novaPermissao.id,
        valor: 5,
        janelaDias: 0,
      }),
    ).rejects.toThrow();
  });

  it("rejeita janela da sobrescrita da empresa igual a zero", async () => {
    const { novaEmpresa, novaPermissao } = await criarBase();

    await expect(
      db.insert(empresaPermissao).values({
        empresaId: novaEmpresa.id,
        permissaoId: novaPermissao.id,
        valor: 5,
        janelaDias: 0,
      }),
    ).rejects.toThrow();
  });
});
