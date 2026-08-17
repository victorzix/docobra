import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { db } from "@/db";
import { empresa, projeto, usuario } from "@/db/schema";
import { assinarToken } from "@/lib/auth/jwt";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";

vi.mock("@/lib/memorial/gerar", () => ({
  gerarMemorial: vi.fn(),
}));

import { gerarMemorial } from "@/lib/memorial/gerar";
import { POST } from "@/app/api/memoriais/route";

async function limparBanco() {
  await db.delete(projeto);
  await db.delete(usuario);
  await db.delete(empresa);
}

async function criarSessaoComProjeto() {
  const [novaEmpresa] = await db.insert(empresa).values({ nome: "Ancar Engenharia" }).returning();
  const [novoUsuario] = await db
    .insert(usuario)
    .values({ nome: "Victor", email: "victor@ancar.com.br", senhaHash: "hash-fake", empresaId: novaEmpresa.id })
    .returning();
  const [novoProjeto] = await db
    .insert(projeto)
    .values({ nome: "Casa da Praia", empresaId: novaEmpresa.id })
    .returning();
  const token = await assinarToken({ userId: novoUsuario.id, empresaId: novaEmpresa.id, papel: novoUsuario.papel });
  return { token, projetoId: novoProjeto.id };
}

function criarRequest(body: unknown, token?: string) {
  return new NextRequest("http://localhost/api/memoriais", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Cookie: `${SESSION_COOKIE_NAME}=${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/memoriais", () => {
  beforeEach(limparBanco);
  afterEach(limparBanco);

  it("rejeita sem sessão com 401", async () => {
    const response = await POST(criarRequest({}));
    expect(response.status).toBe(401);
  });

  it("rejeita dados inválidos com 400", async () => {
    const { token } = await criarSessaoComProjeto();

    const response = await POST(criarRequest({ modoEspecificacoes: "texto" }, token));

    expect(response.status).toBe(400);
  });

  it("rejeita projetoId que não é um uuid válido com 400", async () => {
    const { token } = await criarSessaoComProjeto();

    const response = await POST(
      criarRequest({ projetoId: "abc", tipoConstrucao: "residencial", modoEspecificacoes: "texto" }, token),
    );

    expect(response.status).toBe(400);
  });

  it("rejeita corpo com JSON malformado com 400", async () => {
    const { token } = await criarSessaoComProjeto();

    const request = new NextRequest("http://localhost/api/memoriais", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `${SESSION_COOKIE_NAME}=${token}`,
      },
      body: "{isso não é json",
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
  });

  it("rejeita projeto de outra empresa (ou inexistente) com 404", async () => {
    const { token } = await criarSessaoComProjeto();

    const response = await POST(
      criarRequest(
        {
          projetoId: "00000000-0000-0000-0000-000000000000",
          tipoConstrucao: "residencial",
          modoEspecificacoes: "texto",
        },
        token,
      ),
    );

    expect(response.status).toBe(404);
  });

  it("chama gerarMemorial e retorna 201 no sucesso", async () => {
    const { token, projetoId } = await criarSessaoComProjeto();
    vi.mocked(gerarMemorial).mockResolvedValue({
      id: "abc",
      numero: 1,
      status: "gerado",
      documentoGeradoUrl: "/api/memoriais/abc/pdf",
    });

    const response = await POST(
      criarRequest({ projetoId, tipoConstrucao: "residencial", modoEspecificacoes: "texto" }, token),
    );

    expect(response.status).toBe(201);
    const corpo = await response.json();
    expect(corpo.memorial.status).toBe("gerado");
  });

  it("retorna 500 quando gerarMemorial lança", async () => {
    const { token, projetoId } = await criarSessaoComProjeto();
    vi.mocked(gerarMemorial).mockRejectedValue(new Error("falhou"));

    const response = await POST(
      criarRequest({ projetoId, tipoConstrucao: "residencial", modoEspecificacoes: "texto" }, token),
    );

    expect(response.status).toBe(500);
  });
});
