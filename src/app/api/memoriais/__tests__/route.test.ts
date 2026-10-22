import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { db } from "@/db";
import { eq } from "drizzle-orm";

import { consumo, empresa, memorialDescritivo, plano, planoPermissao, permissao, projeto, usuario } from "@/db/schema";
import { criarAssinatura } from "@/db/queries/assinatura";
import { registrarConsumo } from "@/db/queries/consumo";
import { semearCatalogoNoBancoDeTeste } from "@/db/__tests__/helpers/semear-catalogo";
import { assinarToken } from "@/lib/auth/jwt";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";
import { CriacaoParcialError } from "@/lib/erros/criacao-parcial";

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
  await db.delete(plano).where(eq(plano.chave, "teste-sem-audio"));
}

function criarRequestGet(token?: string) {
  return new NextRequest("http://localhost/api/memoriais", {
    headers: token ? { Cookie: `${SESSION_COOKIE_NAME}=${token}` } : {},
  });
}

async function criarPlanoSemAudio() {
  const [planoCriado] = await db
    .insert(plano)
    .values({ chave: "teste-sem-audio", nome: "Teste sem áudio", cicloDias: 30 })
    .returning();
  const [permissaoGerar] = await db.select().from(permissao).where(eq(permissao.chave, "memorial.gerar"));
  await db
    .insert(planoPermissao)
    .values({ planoId: planoCriado.id, permissaoId: permissaoGerar.id, valor: 10, janelaDias: 30 });
}

async function criarSessaoComProjeto(planoChave = "escritorio") {
  const [novaEmpresa] = await db.insert(empresa).values({ nome: "Ancar Engenharia" }).returning();
  const [novoUsuario] = await db
    .insert(usuario)
    .values({ nome: "Victor", email: "victor@ancar.com.br", senhaHash: "hash-fake", empresaId: novaEmpresa.id })
    .returning();
  const [novoProjeto] = await db
    .insert(projeto)
    .values({ nome: "Casa da Praia", empresaId: novaEmpresa.id })
    .returning();
  await criarAssinatura(db, { empresaId: novaEmpresa.id, planoChave, status: "ativa", origem: "suporte" });
  const token = await assinarToken({ userId: novoUsuario.id, empresaId: novaEmpresa.id, papel: novoUsuario.papel });
  return { token, projetoId: novoProjeto.id, empresaId: novaEmpresa.id };
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

beforeAll(semearCatalogoNoBancoDeTeste);

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

  it("retorna 500 com o id da linha quando gerarMemorial lança CriacaoParcialError", async () => {
    const { token, projetoId } = await criarSessaoComProjeto();
    vi.mocked(gerarMemorial).mockRejectedValue(new CriacaoParcialError("falhou", "memorial-123"));

    const response = await POST(
      criarRequest({ projetoId, tipoConstrucao: "residencial", modoEspecificacoes: "texto" }, token),
    );

    expect(response.status).toBe(500);
    const corpo = await response.json();
    expect(corpo.id).toBe("memorial-123");
  });

  it("bloqueia com 403 LIMITE_ATINGIDO e não chama a IA quando a cota acabou", async () => {
    vi.mocked(gerarMemorial).mockClear();
    const { token, projetoId, empresaId } = await criarSessaoComProjeto("trial");
    for (const referencia of ["a", "b", "c"]) {
      await registrarConsumo(empresaId, "memorial.gerar", referencia);
    }

    const response = await POST(
      criarRequest({ projetoId, tipoConstrucao: "residencial", modoEspecificacoes: "texto" }, token),
    );

    expect(response.status).toBe(403);
    expect((await response.json()).codigo).toBe("LIMITE_ATINGIDO");
    expect(gerarMemorial).not.toHaveBeenCalled();
  });

  it("registra o consumo com o id do memorial gerado", async () => {
    const { token, projetoId } = await criarSessaoComProjeto();
    vi.mocked(gerarMemorial).mockResolvedValue({
      id: "memorial-123",
      numero: 1,
      status: "gerado",
      documentoGeradoUrl: "/api/memoriais/memorial-123/pdf",
    });

    const response = await POST(
      criarRequest({ projetoId, tipoConstrucao: "residencial", modoEspecificacoes: "texto" }, token),
    );

    expect(response.status).toBe(201);
    const consumos = await db.select().from(consumo);
    expect(consumos).toHaveLength(1);
    expect(consumos[0].referencia).toBe("memorial-123");
  });

  it("não consome quando a geração falha", async () => {
    const { token, projetoId } = await criarSessaoComProjeto();
    vi.mocked(gerarMemorial).mockRejectedValue(new CriacaoParcialError("falhou", "memorial-123"));

    await POST(criarRequest({ projetoId, tipoConstrucao: "residencial", modoEspecificacoes: "texto" }, token));

    expect(await db.select().from(consumo)).toHaveLength(0);
  });

  it("modo áudio em plano sem memorial.audio: 403 PERMISSAO_NEGADA e não chama a IA", async () => {
    vi.mocked(gerarMemorial).mockClear();
    await criarPlanoSemAudio();
    const { token, projetoId } = await criarSessaoComProjeto("teste-sem-audio");

    const response = await POST(
      criarRequest(
        {
          projetoId,
          tipoConstrucao: "residencial",
          modoEspecificacoes: "audio",
          audioBase64: "QUJD",
          audioMimeType: "audio/webm",
        },
        token,
      ),
    );

    expect(response.status).toBe(403);
    const corpo = await response.json();
    expect(corpo.codigo).toBe("PERMISSAO_NEGADA");
    expect(corpo.permissao).toBe("memorial.audio");
    expect(gerarMemorial).not.toHaveBeenCalled();
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
