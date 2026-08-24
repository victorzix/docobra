import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { db } from "@/db";
import { comuniqueSe, empresa, projeto, usuario } from "@/db/schema";
import { assinarToken } from "@/lib/auth/jwt";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";
import { PATCH, POST } from "@/app/api/comunique-se/[id]/itens/route";

async function limparBanco() {
  await db.delete(comuniqueSe);
  await db.delete(usuario);
  await db.delete(projeto);
  await db.delete(empresa);
}

async function criarSessaoComChecklist() {
  const [novaEmpresa] = await db.insert(empresa).values({ nome: "Ancar Engenharia" }).returning();
  const [novoUsuario] = await db
    .insert(usuario)
    .values({ nome: "Victor", email: "victor@ancar.com.br", senhaHash: "hash-fake", empresaId: novaEmpresa.id })
    .returning();
  const [novoProjeto] = await db
    .insert(projeto)
    .values({ nome: "Casa da Praia", empresaId: novaEmpresa.id })
    .returning();
  const itemId = "item-1";
  const [linha] = await db
    .insert(comuniqueSe)
    .values({
      projetoId: novoProjeto.id,
      numero: 1,
      status: "pronto",
      pdfOriginalUrl: "/x",
      checklistJson: { itens: [{ id: itemId, descricao: "Apresentar ART", concluida: false }] },
    })
    .returning();
  const token = await assinarToken({ userId: novoUsuario.id, empresaId: novaEmpresa.id, papel: novoUsuario.papel });
  return { token, comuniqueSeId: linha.id, itemId };
}

async function criarSessaoAindaProcessando() {
  const [novaEmpresa] = await db.insert(empresa).values({ nome: "Ancar Engenharia" }).returning();
  const [novoUsuario] = await db
    .insert(usuario)
    .values({ nome: "Victor", email: "victor@ancar.com.br", senhaHash: "hash-fake", empresaId: novaEmpresa.id })
    .returning();
  const [novoProjeto] = await db
    .insert(projeto)
    .values({ nome: "Casa da Praia", empresaId: novaEmpresa.id })
    .returning();
  const [linha] = await db
    .insert(comuniqueSe)
    .values({ projetoId: novoProjeto.id, numero: 1, status: "processando", pdfOriginalUrl: "/x" })
    .returning();
  const token = await assinarToken({ userId: novoUsuario.id, empresaId: novaEmpresa.id, papel: novoUsuario.papel });
  return { token, comuniqueSeId: linha.id };
}

function criarRequest(body: unknown, token?: string) {
  return new NextRequest("http://localhost/api/comunique-se/x/itens", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Cookie: `${SESSION_COOKIE_NAME}=${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/comunique-se/[id]/itens", () => {
  beforeEach(limparBanco);
  afterEach(limparBanco);

  it("rejeita sem sessão com 401", async () => {
    const response = await PATCH(criarRequest({ itemId: "x", concluida: true }), {
      params: Promise.resolve({ id: "x" }),
    });
    expect(response.status).toBe(401);
  });

  it("rejeita corpo inválido com 400", async () => {
    const { token, comuniqueSeId } = await criarSessaoComChecklist();

    const response = await PATCH(criarRequest({}, token), { params: Promise.resolve({ id: comuniqueSeId }) });

    expect(response.status).toBe(400);
  });

  it("retorna 404 pra Comunique-se inexistente", async () => {
    const { token } = await criarSessaoComChecklist();

    const response = await PATCH(criarRequest({ itemId: "x", concluida: true }, token), {
      params: Promise.resolve({ id: "00000000-0000-0000-0000-000000000000" }),
    });

    expect(response.status).toBe(404);
  });

  it("retorna 404 pra Comunique-se de outra empresa", async () => {
    const [empresaA] = await db.insert(empresa).values({ nome: "Empresa A" }).returning();
    const [empresaB] = await db.insert(empresa).values({ nome: "Empresa B" }).returning();
    const [usuarioB] = await db
      .insert(usuario)
      .values({ nome: "B", email: "b@ancar.com.br", senhaHash: "hash-fake", empresaId: empresaB.id })
      .returning();
    const [projetoA] = await db.insert(projeto).values({ nome: "Projeto A", empresaId: empresaA.id }).returning();
    const [linhaA] = await db
      .insert(comuniqueSe)
      .values({
        projetoId: projetoA.id,
        numero: 1,
        status: "pronto",
        pdfOriginalUrl: "/x",
        checklistJson: { itens: [{ id: "item-1", descricao: "Apresentar ART", concluida: false }] },
      })
      .returning();
    const tokenB = await assinarToken({ userId: usuarioB.id, empresaId: empresaB.id, papel: usuarioB.papel });

    const response = await PATCH(criarRequest({ itemId: "item-1", concluida: true }, tokenB), {
      params: Promise.resolve({ id: linhaA.id }),
    });

    expect(response.status).toBe(404);
  });

  it("rejeita alternar item de Comunique-se que ainda não está pronto com 400", async () => {
    const { token, comuniqueSeId } = await criarSessaoAindaProcessando();

    const response = await PATCH(criarRequest({ itemId: "qualquer", concluida: true }, token), {
      params: Promise.resolve({ id: comuniqueSeId }),
    });

    expect(response.status).toBe(400);
  });

  it("retorna 404 pra itemId inexistente no checklist", async () => {
    const { token, comuniqueSeId } = await criarSessaoComChecklist();

    const response = await PATCH(criarRequest({ itemId: "item-fantasma", concluida: true }, token), {
      params: Promise.resolve({ id: comuniqueSeId }),
    });

    expect(response.status).toBe(404);
  });

  it("alterna o item e retorna a lista atualizada com 200", async () => {
    const { token, comuniqueSeId, itemId } = await criarSessaoComChecklist();

    const response = await PATCH(criarRequest({ itemId, concluida: true }, token), {
      params: Promise.resolve({ id: comuniqueSeId }),
    });

    expect(response.status).toBe(200);
    const corpo = await response.json();
    expect(corpo.itens).toEqual([{ id: itemId, descricao: "Apresentar ART", concluida: true }]);
  });
});

describe("POST /api/comunique-se/[id]/itens", () => {
  beforeEach(limparBanco);
  afterEach(limparBanco);

  it("rejeita sem sessão com 401", async () => {
    const response = await POST(criarRequest({ descricao: "x" }), { params: Promise.resolve({ id: "x" }) });
    expect(response.status).toBe(401);
  });

  it("rejeita corpo sem descricao com 400", async () => {
    const { token, comuniqueSeId } = await criarSessaoComChecklist();

    const response = await POST(criarRequest({}, token), { params: Promise.resolve({ id: comuniqueSeId }) });

    expect(response.status).toBe(400);
  });

  it("retorna 404 pra Comunique-se inexistente", async () => {
    const { token } = await criarSessaoComChecklist();

    const response = await POST(criarRequest({ descricao: "Novo item" }, token), {
      params: Promise.resolve({ id: "00000000-0000-0000-0000-000000000000" }),
    });

    expect(response.status).toBe(404);
  });

  it("retorna 404 pra Comunique-se de outra empresa", async () => {
    const [empresaA] = await db.insert(empresa).values({ nome: "Empresa A" }).returning();
    const [empresaB] = await db.insert(empresa).values({ nome: "Empresa B" }).returning();
    const [usuarioB] = await db
      .insert(usuario)
      .values({ nome: "B", email: "b@ancar.com.br", senhaHash: "hash-fake", empresaId: empresaB.id })
      .returning();
    const [projetoA] = await db.insert(projeto).values({ nome: "Projeto A", empresaId: empresaA.id }).returning();
    const [linhaA] = await db
      .insert(comuniqueSe)
      .values({
        projetoId: projetoA.id,
        numero: 1,
        status: "pronto",
        pdfOriginalUrl: "/x",
        checklistJson: { itens: [] },
      })
      .returning();
    const tokenB = await assinarToken({ userId: usuarioB.id, empresaId: empresaB.id, papel: usuarioB.papel });

    const response = await POST(criarRequest({ descricao: "Novo item" }, tokenB), {
      params: Promise.resolve({ id: linhaA.id }),
    });

    expect(response.status).toBe(404);
  });

  it("rejeita adicionar item quando o Comunique-se ainda não está pronto com 400", async () => {
    const { token, comuniqueSeId } = await criarSessaoAindaProcessando();

    const response = await POST(criarRequest({ descricao: "Novo item" }, token), {
      params: Promise.resolve({ id: comuniqueSeId }),
    });

    expect(response.status).toBe(400);
  });

  it("adiciona o item e retorna a lista atualizada com 201", async () => {
    const { token, comuniqueSeId } = await criarSessaoComChecklist();

    const response = await POST(criarRequest({ descricao: "Novo item" }, token), {
      params: Promise.resolve({ id: comuniqueSeId }),
    });

    expect(response.status).toBe(201);
    const corpo = await response.json();
    expect(corpo.itens).toHaveLength(2);
    expect(corpo.itens[1].descricao).toBe("Novo item");
  });
});
