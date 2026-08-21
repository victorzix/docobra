import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { db } from "@/db";
import { comuniqueSe, empresa, projeto, usuario } from "@/db/schema";
import { assinarToken } from "@/lib/auth/jwt";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";
import { DELETE } from "@/app/api/comunique-se/[id]/itens/[itemId]/route";

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

function criarRequest(token?: string) {
  return new NextRequest("http://localhost/api/comunique-se/x/itens/y", {
    method: "DELETE",
    headers: token ? { Cookie: `${SESSION_COOKIE_NAME}=${token}` } : {},
  });
}

describe("DELETE /api/comunique-se/[id]/itens/[itemId]", () => {
  beforeEach(limparBanco);
  afterEach(limparBanco);

  it("rejeita sem sessão com 401", async () => {
    const response = await DELETE(criarRequest(), { params: Promise.resolve({ id: "x", itemId: "y" }) });
    expect(response.status).toBe(401);
  });

  it("retorna 404 pra Comunique-se inexistente", async () => {
    const { token } = await criarSessaoComChecklist();

    const response = await DELETE(criarRequest(token), {
      params: Promise.resolve({ id: "00000000-0000-0000-0000-000000000000", itemId: "y" }),
    });

    expect(response.status).toBe(404);
  });

  it("retorna 404 pra itemId inexistente", async () => {
    const { token, comuniqueSeId } = await criarSessaoComChecklist();

    const response = await DELETE(criarRequest(token), {
      params: Promise.resolve({ id: comuniqueSeId, itemId: "item-fantasma" }),
    });

    expect(response.status).toBe(404);
  });

  it("rejeita remover item quando o Comunique-se ainda não está pronto com 400", async () => {
    const { token, comuniqueSeId } = await criarSessaoAindaProcessando();

    const response = await DELETE(criarRequest(token), {
      params: Promise.resolve({ id: comuniqueSeId, itemId: "qualquer" }),
    });

    expect(response.status).toBe(400);
  });

  it("remove o item e retorna a lista atualizada com 200", async () => {
    const { token, comuniqueSeId, itemId } = await criarSessaoComChecklist();

    const response = await DELETE(criarRequest(token), {
      params: Promise.resolve({ id: comuniqueSeId, itemId }),
    });

    expect(response.status).toBe(200);
    const corpo = await response.json();
    expect(corpo.itens).toEqual([]);
  });
});
