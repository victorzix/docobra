import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { db } from "@/db";
import { empresa, memorialDescritivo, projeto, usuario } from "@/db/schema";
import { assinarToken } from "@/lib/auth/jwt";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";

vi.mock("@/lib/memorial/gerar", () => ({
  gerarMemorial: vi.fn(),
}));

import { gerarMemorial } from "@/lib/memorial/gerar";
import { GET, POST } from "@/app/api/memoriais/route";

async function limparBanco() {
  await db.delete(memorialDescritivo);
  await db.delete(projeto);
  await db.delete(usuario);
  await db.delete(empresa);
}

function criarRequestGet(token?: string) {
  return new NextRequest("http://localhost/api/memoriais", {
    headers: token ? { Cookie: `${SESSION_COOKIE_NAME}=${token}` } : {},
  });
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

describe("GET /api/memoriais", () => {
  beforeEach(limparBanco);
  afterEach(limparBanco);

  it("lista os memoriais da empresa no formato padrão { data, page, total }", async () => {
    const { token, projetoId } = await criarSessaoComProjeto();
    await db
      .insert(memorialDescritivo)
      .values({ projetoId, numero: 1, respostasFormularioJson: {}, status: "gerado", documentoGeradoUrl: "/x" });

    const response = await GET(criarRequestGet(token));

    expect(response.status).toBe(200);
    const corpo = await response.json();
    expect(corpo.data).toHaveLength(1);
    expect(corpo.data[0].status).toBe("gerado");
    expect(typeof corpo.data[0].createdAt).toBe("string");
    expect(corpo.total).toBe(1);
    expect(corpo.page).toBe(1);
  });

  it("retorna lista vazia quando a empresa não tem memoriais", async () => {
    const { token } = await criarSessaoComProjeto();

    const response = await GET(criarRequestGet(token));

    expect(response.status).toBe(200);
    const corpo = await response.json();
    expect(corpo.data).toEqual([]);
    expect(corpo.total).toBe(0);
  });

  it("rejeita request sem sessão com 401", async () => {
    const response = await GET(criarRequestGet());

    expect(response.status).toBe(401);
  });
});
