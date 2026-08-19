import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { db } from "@/db";
import { empresa, projeto } from "@/db/schema";
import {
  buscarProjetoDaEmpresa,
  contarProjetos,
  criarProjeto,
  listarProjetos,
  listarProjetosPaginado,
} from "../projeto";

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

describe("listarProjetosPaginado", () => {
  beforeEach(limparBanco);
  afterEach(limparBanco);

  async function criarVariosProjetos(empresaId: string, quantidade: number) {
    const base = new Date("2026-01-01T00:00:00Z").getTime();
    for (let i = 0; i < quantidade; i++) {
      await db.insert(projeto).values({
        nome: `Projeto ${i + 1}`,
        empresaId,
        createdAt: new Date(base + i * 1000),
      });
    }
  }

  it("respeita o limite e informa nextCursor quando há mais páginas", async () => {
    const [novaEmpresa] = await db.insert(empresa).values({ nome: "Ancar Engenharia" }).returning();
    await criarVariosProjetos(novaEmpresa.id, 5);

    const pagina = await listarProjetosPaginado(novaEmpresa.id, { limite: 3 });

    expect(pagina.itens).toHaveLength(3);
    expect(pagina.itens.map((p) => p.nome)).toEqual(["Projeto 5", "Projeto 4", "Projeto 3"]);
    expect(pagina.nextCursor).not.toBeNull();
  });

  it("a segunda página, usando o cursor, traz os itens restantes sem repetir", async () => {
    const [novaEmpresa] = await db.insert(empresa).values({ nome: "Ancar Engenharia" }).returning();
    await criarVariosProjetos(novaEmpresa.id, 5);

    const primeira = await listarProjetosPaginado(novaEmpresa.id, { limite: 3 });
    const segunda = await listarProjetosPaginado(novaEmpresa.id, {
      limite: 3,
      cursor: primeira.nextCursor ?? undefined,
    });

    expect(segunda.itens.map((p) => p.nome)).toEqual(["Projeto 2", "Projeto 1"]);
    expect(segunda.nextCursor).toBeNull();
  });

  it("nextCursor é null quando não há mais páginas", async () => {
    const [novaEmpresa] = await db.insert(empresa).values({ nome: "Ancar Engenharia" }).returning();
    await criarVariosProjetos(novaEmpresa.id, 2);

    const pagina = await listarProjetosPaginado(novaEmpresa.id, { limite: 5 });

    expect(pagina.itens).toHaveLength(2);
    expect(pagina.nextCursor).toBeNull();
  });
});

describe("contarProjetos", () => {
  beforeEach(limparBanco);
  afterEach(limparBanco);

  it("conta só os projetos da empresa pedida", async () => {
    const [empresaA] = await db.insert(empresa).values({ nome: "Empresa A" }).returning();
    const [empresaB] = await db.insert(empresa).values({ nome: "Empresa B" }).returning();
    await db.insert(projeto).values({ nome: "Projeto A1", empresaId: empresaA.id });
    await db.insert(projeto).values({ nome: "Projeto A2", empresaId: empresaA.id });
    await db.insert(projeto).values({ nome: "Projeto B1", empresaId: empresaB.id });

    expect(await contarProjetos(empresaA.id)).toBe(2);
    expect(await contarProjetos(empresaB.id)).toBe(1);
  });
});

describe("buscarProjetoDaEmpresa", () => {
  beforeEach(limparBanco);
  afterEach(limparBanco);

  it("retorna o projeto quando pertence à empresa", async () => {
    const [novaEmpresa] = await db.insert(empresa).values({ nome: "Ancar Engenharia" }).returning();
    const criado = await criarProjeto({ nome: "Casa da Praia", empresaId: novaEmpresa.id });

    const resultado = await buscarProjetoDaEmpresa(criado.id, novaEmpresa.id);

    expect(resultado?.id).toBe(criado.id);
  });

  it("retorna null quando o projeto é de outra empresa", async () => {
    const [empresaA] = await db.insert(empresa).values({ nome: "Empresa A" }).returning();
    const [empresaB] = await db.insert(empresa).values({ nome: "Empresa B" }).returning();
    const criado = await criarProjeto({ nome: "Casa da Praia", empresaId: empresaA.id });

    const resultado = await buscarProjetoDaEmpresa(criado.id, empresaB.id);

    expect(resultado).toBeNull();
  });
});
