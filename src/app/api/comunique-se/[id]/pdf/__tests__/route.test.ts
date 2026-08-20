import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { rm } from "node:fs/promises";
import path from "node:path";
import { NextRequest } from "next/server";

import { db } from "@/db";
import { comuniqueSe, empresa, projeto, usuario } from "@/db/schema";
import { assinarToken } from "@/lib/auth/jwt";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";
import { salvarArquivo } from "@/lib/comunique-se/storage";
import { GET } from "@/app/api/comunique-se/[id]/pdf/route";

const DIR_STORAGE = path.join(process.cwd(), process.env.COMUNIQUE_SE_STORAGE_DIR ?? "storage/comunique-se");

async function limparBanco() {
  await db.delete(comuniqueSe);
  await db.delete(usuario);
  await db.delete(projeto);
  await db.delete(empresa);
}

function criarRequest(token?: string) {
  return new NextRequest("http://localhost/api/comunique-se/x/pdf", {
    headers: token ? { Cookie: `${SESSION_COOKIE_NAME}=${token}` } : {},
  });
}

describe("GET /api/comunique-se/[id]/pdf", () => {
  beforeEach(limparBanco);
  afterEach(async () => {
    await limparBanco();
    await rm(DIR_STORAGE, { recursive: true, force: true });
  });

  it("retorna o PDF quando o Comunique-se pertence à empresa", async () => {
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
      .values({ projetoId: novoProjeto.id, numero: 1, status: "pronto", pdfOriginalUrl: "/x" })
      .returning();
    await salvarArquivo(`${linha.id}.pdf`, Buffer.from("%PDF-fake"));
    const token = await assinarToken({ userId: novoUsuario.id, empresaId: novaEmpresa.id, papel: novoUsuario.papel });

    const response = await GET(criarRequest(token), { params: Promise.resolve({ id: linha.id }) });

    expect(response.status).toBe(200);
    const buffer = Buffer.from(await response.arrayBuffer());
    expect(buffer.toString()).toBe("%PDF-fake");
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
      .values({ projetoId: projetoA.id, numero: 1, status: "pronto", pdfOriginalUrl: "/x" })
      .returning();
    const tokenB = await assinarToken({ userId: usuarioB.id, empresaId: empresaB.id, papel: usuarioB.papel });

    const response = await GET(criarRequest(tokenB), { params: Promise.resolve({ id: linhaA.id }) });

    expect(response.status).toBe(404);
  });

  it("retorna 401 sem sessão", async () => {
    const response = await GET(criarRequest(), { params: Promise.resolve({ id: "x" }) });
    expect(response.status).toBe(401);
  });
});
