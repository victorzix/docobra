import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { db } from "@/db";
import { empresa, projeto, usuario } from "@/db/schema";
import { assinarToken } from "@/lib/auth/jwt";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";
import { POST } from "@/app/api/projetos/route";

async function limparBanco() {
  await db.delete(projeto);
  await db.delete(usuario);
  await db.delete(empresa);
}

async function criarSessao() {
  const [novaEmpresa] = await db.insert(empresa).values({ nome: "Ancar Engenharia" }).returning();
  const [novoUsuario] = await db
    .insert(usuario)
    .values({
      nome: "Victor",
      email: "victor@ancar.com.br",
      senhaHash: "hash-fake",
      empresaId: novaEmpresa.id,
    })
    .returning();

  const token = await assinarToken({
    userId: novoUsuario.id,
    empresaId: novaEmpresa.id,
    papel: novoUsuario.papel,
  });

  return { empresaId: novaEmpresa.id, token };
}

function criarRequest(body: unknown, token?: string) {
  return new NextRequest("http://localhost/api/projetos", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Cookie: `${SESSION_COOKIE_NAME}=${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/projetos", () => {
  beforeEach(limparBanco);
  afterEach(limparBanco);

  it("cria um projeto escopado à empresa da sessão e retorna 201", async () => {
    const { empresaId, token } = await criarSessao();

    const response = await POST(
      criarRequest({ nome: "Casa da Praia", endereco: "Rua X, 123" }, token),
    );

    expect(response.status).toBe(201);
    const corpo = await response.json();
    expect(corpo.projeto.nome).toBe("Casa da Praia");

    const projetos = await db.select().from(projeto);
    expect(projetos).toHaveLength(1);
    expect(projetos[0].empresaId).toBe(empresaId);
  });

  it("rejeita nome vazio com 400", async () => {
    const { token } = await criarSessao();

    const response = await POST(criarRequest({ nome: "" }, token));

    expect(response.status).toBe(400);
  });

  it("rejeita request sem sessão com 401", async () => {
    const response = await POST(criarRequest({ nome: "Casa da Praia" }));

    expect(response.status).toBe(401);
  });
});
