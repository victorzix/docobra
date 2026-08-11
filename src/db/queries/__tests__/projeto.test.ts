import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { db } from "@/db";
import { empresa, projeto } from "@/db/schema";
import { criarProjeto, listarProjetos } from "../projeto";

async function limparBanco() {
  await db.delete(projeto);
  await db.delete(empresa);
}

describe("criarProjeto", () => {
  beforeEach(limparBanco);
  afterEach(limparBanco);

  it("cria um projeto com os dados informados", async () => {
    const [novaEmpresa] = await db.insert(empresa).values({ nome: "Ancar Engenharia" }).returning();

    const resultado = await criarProjeto({
      nome: "Casa da Praia",
      endereco: "Rua das Flores, 123",
      empresaId: novaEmpresa.id,
    });

    expect(resultado.nome).toBe("Casa da Praia");
    expect(resultado.endereco).toBe("Rua das Flores, 123");
    expect(resultado.id).toBeDefined();
  });

  it("cria um projeto sem endereço", async () => {
    const [novaEmpresa] = await db.insert(empresa).values({ nome: "Ancar Engenharia" }).returning();

    const resultado = await criarProjeto({ nome: "Casa da Praia", empresaId: novaEmpresa.id });

    expect(resultado.endereco).toBeNull();
  });
});

describe("listarProjetos", () => {
  beforeEach(limparBanco);
  afterEach(limparBanco);

  it("lista só os projetos da empresa pedida, mais recente primeiro", async () => {
    const [novaEmpresa] = await db.insert(empresa).values({ nome: "Ancar Engenharia" }).returning();
    await db.insert(projeto).values({ nome: "Projeto Antigo", empresaId: novaEmpresa.id });
    await db.insert(projeto).values({ nome: "Projeto Novo", empresaId: novaEmpresa.id });

    const resultado = await listarProjetos(novaEmpresa.id);

    expect(resultado).toHaveLength(2);
    expect(resultado[0].nome).toBe("Projeto Novo");
    expect(resultado[1].nome).toBe("Projeto Antigo");
  });

  it("não retorna projetos de outra empresa", async () => {
    const [empresaA] = await db.insert(empresa).values({ nome: "Empresa A" }).returning();
    const [empresaB] = await db.insert(empresa).values({ nome: "Empresa B" }).returning();
    await db.insert(projeto).values({ nome: "Projeto A", empresaId: empresaA.id });
    await db.insert(projeto).values({ nome: "Projeto B", empresaId: empresaB.id });

    const resultado = await listarProjetos(empresaA.id);

    expect(resultado).toHaveLength(1);
    expect(resultado[0].nome).toBe("Projeto A");
  });

  it("retorna lista vazia quando a empresa não tem projetos", async () => {
    const [novaEmpresa] = await db.insert(empresa).values({ nome: "Ancar Engenharia" }).returning();

    const resultado = await listarProjetos(novaEmpresa.id);

    expect(resultado).toEqual([]);
  });
});
