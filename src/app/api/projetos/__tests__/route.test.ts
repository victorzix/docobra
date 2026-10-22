import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { db } from "@/db";
import { consumo, empresa, projeto, usuario } from "@/db/schema";
import { criarAssinatura } from "@/db/queries/assinatura";
import { semearCatalogoNoBancoDeTeste } from "@/db/__tests__/helpers/semear-catalogo";
import { assinarToken } from "@/lib/auth/jwt";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";
import { GET, POST } from "@/app/api/projetos/route";

async function limparBanco() {
  await db.delete(projeto);
  await db.delete(usuario);
  await db.delete(empresa);
}

async function criarSessao(planoChave = "escritorio") {
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

  await criarAssinatura(db, {
    empresaId: novaEmpresa.id,
    planoChave,
    status: "ativa",
    origem: "suporte",
  });

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

function criarRequestGet(url: string, token?: string) {
  return new NextRequest(url, {
    headers: token ? { Cookie: `${SESSION_COOKIE_NAME}=${token}` } : {},
  });
}

beforeAll(semearCatalogoNoBancoDeTeste);

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

  it("bloqueia com 403 LIMITE_ATINGIDO quando a cota de projetos do plano acabou", async () => {
    const { token } = await criarSessao("trial");

    expect((await POST(criarRequest({ nome: "Projeto 1", endereco: "Rua A, 1" }, token))).status).toBe(201);
    expect((await POST(criarRequest({ nome: "Projeto 2", endereco: "Rua A, 2" }, token))).status).toBe(201);
    const terceira = await POST(criarRequest({ nome: "Projeto 3", endereco: "Rua A, 3" }, token));

    expect(terceira.status).toBe(403);
    const corpo = await terceira.json();
    expect(corpo.codigo).toBe("LIMITE_ATINGIDO");
    expect(corpo.permissao).toBe("projetos.criar");
    expect(await db.select().from(projeto)).toHaveLength(2);
  });

  it("registra o consumo do projeto criado, com o id do projeto como referência", async () => {
    const { token } = await criarSessao();

    const response = await POST(criarRequest({ nome: "Casa", endereco: "Rua X, 1" }, token));
    const { projeto: criado } = await response.json();

    const consumos = await db.select().from(consumo);
    expect(consumos).toHaveLength(1);
    expect(consumos[0].referencia).toBe(criado.id);
  });

  it("dados inválidos continuam 400 mesmo com a cota esgotada", async () => {
    const { token } = await criarSessao("trial");
    await POST(criarRequest({ nome: "Projeto 1", endereco: "Rua A, 1" }, token));
    await POST(criarRequest({ nome: "Projeto 2", endereco: "Rua A, 2" }, token));

    const response = await POST(criarRequest({}, token));

    expect(response.status).toBe(400);
  });
});

describe("GET /api/projetos", () => {
  beforeEach(limparBanco);
  afterEach(limparBanco);

  it("lista os projetos da empresa no formato padrão { data, page, total }", async () => {
    const { empresaId, token } = await criarSessao();
    await db.insert(projeto).values({ nome: "Casa da Praia", empresaId });

    const response = await GET(criarRequestGet("http://localhost/api/projetos", token));

    expect(response.status).toBe(200);
    const corpo = await response.json();
    expect(corpo.data).toHaveLength(1);
    expect(corpo.data[0].nome).toBe("Casa da Praia");
    expect(typeof corpo.data[0].createdAt).toBe("string");
    expect(corpo.total).toBe(1);
    expect(corpo.page).toBe(1);
  });

  it("devolve nextCursor null quando cabe tudo numa página só, e ecoa o page recebido", async () => {
    const { empresaId, token } = await criarSessao();
    const base = new Date("2026-01-01T00:00:00Z").getTime();
    for (let i = 0; i < 3; i++) {
      await db
        .insert(projeto)
        .values({ nome: `Projeto ${i + 1}`, empresaId, createdAt: new Date(base + i * 1000) });
    }

    const response = await GET(criarRequestGet("http://localhost/api/projetos?page=2", token));
    expect(response.status).toBe(200);
    const corpo = await response.json();
    expect(corpo.data).toHaveLength(3);
    expect(corpo.total).toBe(3);
    expect(corpo.page).toBe(2);
    expect(corpo.nextCursor).toBeNull();
  });

  it("rejeita request sem sessão com 401", async () => {
    const response = await GET(criarRequestGet("http://localhost/api/projetos"));

    expect(response.status).toBe(401);
  });
});
