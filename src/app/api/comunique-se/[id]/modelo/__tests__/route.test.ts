import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { db } from "@/db";
import { comuniqueSe, empresa, projeto, usuario } from "@/db/schema";
import { assinarToken } from "@/lib/auth/jwt";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";
import { detectarModeloEmbutido } from "@/lib/comunique-se/modelo-detectar";
import { GET } from "@/app/api/comunique-se/[id]/modelo/route";

async function limparBanco() {
  await db.delete(comuniqueSe);
  await db.delete(usuario);
  await db.delete(projeto);
  await db.delete(empresa);
}

function criarRequest(token?: string) {
  return new NextRequest("http://localhost/api/comunique-se/x/modelo", {
    headers: token ? { Cookie: `${SESSION_COOKIE_NAME}=${token}` } : {},
  });
}

describe("GET /api/comunique-se/[id]/modelo", () => {
  beforeEach(limparBanco);
  afterEach(limparBanco);

  it("retorna 401 sem sessão", async () => {
    const response = await GET(criarRequest(), { params: Promise.resolve({ id: "x" }) });
    expect(response.status).toBe(401);
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

    const response = await GET(criarRequest(tokenB), { params: Promise.resolve({ id: linhaA.id }) });

    expect(response.status).toBe(404);
  });

  it("retorna 400 quando o Comunique-se ainda não está pronto", async () => {
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

    const response = await GET(criarRequest(token), { params: Promise.resolve({ id: linha.id }) });

    expect(response.status).toBe(400);
  });

  it("gera o PDF com o checklist atual anexado", async () => {
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
      .values({
        projetoId: novoProjeto.id,
        numero: 1,
        status: "pronto",
        pdfOriginalUrl: "/x",
        checklistJson: { itens: [{ id: "1", descricao: "Apresentar ART", concluida: true }] },
      })
      .returning();
    const token = await assinarToken({ userId: novoUsuario.id, empresaId: novaEmpresa.id, papel: novoUsuario.papel });

    const response = await GET(criarRequest(token), { params: Promise.resolve({ id: linha.id }) });

    expect(response.status).toBe(200);
    const buffer = Buffer.from(await response.arrayBuffer());
    expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");

    const itensDetectados = await detectarModeloEmbutido(buffer);
    expect(itensDetectados).toEqual([{ descricao: "Apresentar ART", concluida: true }]);
  });
});
