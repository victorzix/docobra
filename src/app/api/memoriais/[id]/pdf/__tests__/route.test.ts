import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { rm } from "node:fs/promises";
import path from "node:path";
import { NextRequest } from "next/server";

import { db } from "@/db";
import { empresa, memorialDescritivo, projeto, usuario } from "@/db/schema";
import { assinarToken } from "@/lib/auth/jwt";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";
import { salvarArquivo } from "@/lib/memorial/storage";
import { GET } from "@/app/api/memoriais/[id]/pdf/route";

async function limparBanco() {
  await db.delete(memorialDescritivo);
  await db.delete(projeto);
  await db.delete(usuario);
  await db.delete(empresa);
}

function criarRequest(token?: string) {
  return new NextRequest("http://localhost/api/memoriais/x/pdf", {
    headers: token ? { Cookie: `${SESSION_COOKIE_NAME}=${token}` } : {},
  });
}

describe("GET /api/memoriais/[id]/pdf", () => {
  beforeEach(limparBanco);
  afterEach(async () => {
    await limparBanco();
    await rm(path.join(process.cwd(), "storage", "memoriais"), { recursive: true, force: true });
  });

  it("retorna o PDF quando o memorial pertence à empresa e está gerado", async () => {
    const [novaEmpresa] = await db.insert(empresa).values({ nome: "Ancar Engenharia" }).returning();
    const [novoUsuario] = await db
      .insert(usuario)
      .values({ nome: "Victor", email: "victor@ancar.com.br", senhaHash: "hash-fake", empresaId: novaEmpresa.id })
      .returning();
    const [novoProjeto] = await db
      .insert(projeto)
      .values({ nome: "Casa da Praia", empresaId: novaEmpresa.id })
      .returning();
    const [novoMemorial] = await db
      .insert(memorialDescritivo)
      .values({
        projetoId: novoProjeto.id,
        respostasFormularioJson: {},
        status: "gerado",
        documentoGeradoUrl: "/x",
      })
      .returning();
    await salvarArquivo(`${novoMemorial.id}.pdf`, Buffer.from("%PDF-fake"));
    const token = await assinarToken({ userId: novoUsuario.id, empresaId: novaEmpresa.id, papel: novoUsuario.papel });

    const response = await GET(criarRequest(token), { params: Promise.resolve({ id: novoMemorial.id }) });

    expect(response.status).toBe(200);
    const buffer = Buffer.from(await response.arrayBuffer());
    expect(buffer.toString()).toBe("%PDF-fake");
  });

  it("retorna 404 pra memorial de outra empresa", async () => {
    const [empresaA] = await db.insert(empresa).values({ nome: "Empresa A" }).returning();
    const [empresaB] = await db.insert(empresa).values({ nome: "Empresa B" }).returning();
    const [usuarioB] = await db
      .insert(usuario)
      .values({ nome: "B", email: "b@ancar.com.br", senhaHash: "hash-fake", empresaId: empresaB.id })
      .returning();
    const [projetoA] = await db.insert(projeto).values({ nome: "Projeto A", empresaId: empresaA.id }).returning();
    const [memorialA] = await db
      .insert(memorialDescritivo)
      .values({ projetoId: projetoA.id, respostasFormularioJson: {}, status: "gerado", documentoGeradoUrl: "/x" })
      .returning();
    const tokenB = await assinarToken({ userId: usuarioB.id, empresaId: empresaB.id, papel: usuarioB.papel });

    const response = await GET(criarRequest(tokenB), { params: Promise.resolve({ id: memorialA.id }) });

    expect(response.status).toBe(404);
  });

  it("retorna 404 pra memorial ainda em rascunho", async () => {
    const [novaEmpresa] = await db.insert(empresa).values({ nome: "Ancar Engenharia" }).returning();
    const [novoUsuario] = await db
      .insert(usuario)
      .values({ nome: "Victor", email: "victor@ancar.com.br", senhaHash: "hash-fake", empresaId: novaEmpresa.id })
      .returning();
    const [novoProjeto] = await db
      .insert(projeto)
      .values({ nome: "Casa da Praia", empresaId: novaEmpresa.id })
      .returning();
    const [novoMemorial] = await db
      .insert(memorialDescritivo)
      .values({ projetoId: novoProjeto.id, respostasFormularioJson: {} })
      .returning();
    const token = await assinarToken({ userId: novoUsuario.id, empresaId: novaEmpresa.id, papel: novoUsuario.papel });

    const response = await GET(criarRequest(token), { params: Promise.resolve({ id: novoMemorial.id }) });

    expect(response.status).toBe(404);
  });

  it("retorna 401 sem sessão", async () => {
    const response = await GET(criarRequest(), { params: Promise.resolve({ id: "x" }) });

    expect(response.status).toBe(401);
  });
});
