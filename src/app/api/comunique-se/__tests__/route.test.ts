import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { db } from "@/db";
import { comuniqueSe, empresa, projeto, usuario } from "@/db/schema";
import { assinarToken } from "@/lib/auth/jwt";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";
import { CriacaoParcialError } from "@/lib/erros/criacao-parcial";

vi.mock("@/lib/comunique-se/processar", () => ({
  processarComuniqueSe: vi.fn(),
  criarComuniqueSeManual: vi.fn(),
}));

import { criarComuniqueSeManual, processarComuniqueSe } from "@/lib/comunique-se/processar";
import { GET, POST } from "@/app/api/comunique-se/route";

async function limparBanco() {
  await db.delete(comuniqueSe);
  await db.delete(usuario);
  await db.delete(projeto);
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

function criarRequestPost(body: unknown, token?: string) {
  return new NextRequest("http://localhost/api/comunique-se", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Cookie: `${SESSION_COOKIE_NAME}=${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

function criarRequestGet(token?: string) {
  return new NextRequest("http://localhost/api/comunique-se", {
    headers: token ? { Cookie: `${SESSION_COOKIE_NAME}=${token}` } : {},
  });
}

const PDF_BASE64_FAKE = Buffer.from("%PDF-1.4 fake").toString("base64");

describe("POST /api/comunique-se", () => {
  beforeEach(async () => {
    await limparBanco();
    vi.mocked(processarComuniqueSe).mockReset();
    vi.mocked(criarComuniqueSeManual).mockReset();
  });
  afterEach(limparBanco);

  it("rejeita sem sessão com 401", async () => {
    const response = await POST(criarRequestPost({}));
    expect(response.status).toBe(401);
  });

  it("rejeita dados inválidos com 400", async () => {
    const { token } = await criarSessaoComProjeto();

    const response = await POST(criarRequestPost({}, token));

    expect(response.status).toBe(400);
  });

  it("rejeita projeto de outra empresa (ou inexistente) com 404", async () => {
    const { token } = await criarSessaoComProjeto();

    const response = await POST(
      criarRequestPost(
        { modoCriacao: "pdf", projetoId: "00000000-0000-0000-0000-000000000000", pdfBase64: PDF_BASE64_FAKE },
        token,
      ),
    );

    expect(response.status).toBe(404);
  });

  it("rejeita arquivo que não é PDF com 400, sem chamar processarComuniqueSe", async () => {
    const { token, projetoId } = await criarSessaoComProjeto();

    const response = await POST(
      criarRequestPost(
        { modoCriacao: "pdf", projetoId, pdfBase64: Buffer.from("não é pdf").toString("base64") },
        token,
      ),
    );

    expect(response.status).toBe(400);
    expect(processarComuniqueSe).not.toHaveBeenCalled();
  });

  it("rejeita arquivo maior que 10MB com 400, sem chamar processarComuniqueSe", async () => {
    const { token, projetoId } = await criarSessaoComProjeto();
    const bufferGrande = Buffer.concat([Buffer.from("%PDF-1.4"), Buffer.alloc(10 * 1024 * 1024)]);

    const response = await POST(
      criarRequestPost({ modoCriacao: "pdf", projetoId, pdfBase64: bufferGrande.toString("base64") }, token),
    );

    expect(response.status).toBe(400);
    expect(processarComuniqueSe).not.toHaveBeenCalled();
  });

  it("chama processarComuniqueSe e retorna 201 no sucesso", async () => {
    const { token, projetoId } = await criarSessaoComProjeto();
    vi.mocked(processarComuniqueSe).mockResolvedValue({
      id: "abc",
      numero: 1,
      status: "pronto",
      pdfOriginalUrl: "/api/comunique-se/abc/pdf",
    });

    const response = await POST(
      criarRequestPost({ modoCriacao: "pdf", projetoId, pdfBase64: PDF_BASE64_FAKE }, token),
    );

    expect(response.status).toBe(201);
    const corpo = await response.json();
    expect(corpo.comuniqueSe.status).toBe("pronto");
  });

  it("retorna 500 quando processarComuniqueSe lança", async () => {
    const { token, projetoId } = await criarSessaoComProjeto();
    vi.mocked(processarComuniqueSe).mockRejectedValue(new Error("falhou"));

    const response = await POST(
      criarRequestPost({ modoCriacao: "pdf", projetoId, pdfBase64: PDF_BASE64_FAKE }, token),
    );

    expect(response.status).toBe(500);
  });

  it("retorna 500 com o id da linha quando processarComuniqueSe lança CriacaoParcialError", async () => {
    const { token, projetoId } = await criarSessaoComProjeto();
    vi.mocked(processarComuniqueSe).mockRejectedValue(new CriacaoParcialError("falhou", "linha-123"));

    const response = await POST(
      criarRequestPost({ modoCriacao: "pdf", projetoId, pdfBase64: PDF_BASE64_FAKE }, token),
    );

    expect(response.status).toBe(500);
    const corpo = await response.json();
    expect(corpo.id).toBe("linha-123");
  });

  it("modoCriacao manual: rejeita sem nenhum item com 400, sem chamar criarComuniqueSeManual", async () => {
    const { token, projetoId } = await criarSessaoComProjeto();

    const response = await POST(criarRequestPost({ modoCriacao: "manual", projetoId, itens: [] }, token));

    expect(response.status).toBe(400);
    expect(criarComuniqueSeManual).not.toHaveBeenCalled();
  });

  it("modoCriacao manual: chama criarComuniqueSeManual e retorna 201 no sucesso", async () => {
    const { token, projetoId } = await criarSessaoComProjeto();
    vi.mocked(criarComuniqueSeManual).mockResolvedValue({
      id: "abc",
      numero: 1,
      status: "pronto",
      pdfOriginalUrl: null,
    });

    const response = await POST(
      criarRequestPost({ modoCriacao: "manual", projetoId, itens: [{ descricao: "Apresentar ART" }] }, token),
    );

    expect(response.status).toBe(201);
    const corpo = await response.json();
    expect(corpo.comuniqueSe.status).toBe("pronto");
    expect(corpo.comuniqueSe.pdfOriginalUrl).toBeNull();
  });

  it("modoCriacao manual: rejeita projeto de outra empresa com 404", async () => {
    const { token } = await criarSessaoComProjeto();

    const response = await POST(
      criarRequestPost(
        {
          modoCriacao: "manual",
          projetoId: "00000000-0000-0000-0000-000000000000",
          itens: [{ descricao: "Apresentar ART" }],
        },
        token,
      ),
    );

    expect(response.status).toBe(404);
    expect(criarComuniqueSeManual).not.toHaveBeenCalled();
  });
});

describe("GET /api/comunique-se", () => {
  beforeEach(limparBanco);
  afterEach(limparBanco);

  it("lista os Comunique-se da empresa no formato padrão { data, page, total }", async () => {
    const { token, projetoId } = await criarSessaoComProjeto();
    await db
      .insert(comuniqueSe)
      .values({ projetoId, numero: 1, status: "pronto", pdfOriginalUrl: "/x", checklistJson: { itens: [] } });

    const response = await GET(criarRequestGet(token));

    expect(response.status).toBe(200);
    const corpo = await response.json();
    expect(corpo.data).toHaveLength(1);
    expect(corpo.data[0].status).toBe("pronto");
    expect(corpo.total).toBe(1);
  });

  it("retorna lista vazia quando a empresa não tem Comunique-se", async () => {
    const { token } = await criarSessaoComProjeto();

    const response = await GET(criarRequestGet(token));

    expect(response.status).toBe(200);
    const corpo = await response.json();
    expect(corpo.data).toEqual([]);
  });

  it("rejeita request sem sessão com 401", async () => {
    const response = await GET(criarRequestGet());
    expect(response.status).toBe(401);
  });
});
