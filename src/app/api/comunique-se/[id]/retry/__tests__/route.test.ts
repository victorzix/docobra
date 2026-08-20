import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { db } from "@/db";
import { comuniqueSe, empresa, projeto, usuario } from "@/db/schema";
import { assinarToken } from "@/lib/auth/jwt";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";

vi.mock("@/lib/comunique-se/processar", () => ({
  reprocessarComuniqueSe: vi.fn(),
}));

import { reprocessarComuniqueSe } from "@/lib/comunique-se/processar";
import { POST } from "@/app/api/comunique-se/[id]/retry/route";

async function limparBanco() {
  await db.delete(comuniqueSe);
  await db.delete(usuario);
  await db.delete(projeto);
  await db.delete(empresa);
}

async function criarSessaoComLinha(status: "processando" | "erro" | "pronto" = "erro") {
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
    .values({ projetoId: novoProjeto.id, numero: 1, status, pdfOriginalUrl: "/x" })
    .returning();
  const token = await assinarToken({ userId: novoUsuario.id, empresaId: novaEmpresa.id, papel: novoUsuario.papel });
  return { token, comuniqueSeId: linha.id };
}

function criarRequest(token?: string) {
  return new NextRequest("http://localhost/api/comunique-se/x/retry", {
    method: "POST",
    headers: token ? { Cookie: `${SESSION_COOKIE_NAME}=${token}` } : {},
  });
}

describe("POST /api/comunique-se/[id]/retry", () => {
  beforeEach(async () => {
    await limparBanco();
    vi.mocked(reprocessarComuniqueSe).mockReset();
  });
  afterEach(limparBanco);

  it("rejeita sem sessão com 401", async () => {
    const response = await POST(criarRequest(), { params: Promise.resolve({ id: "x" }) });
    expect(response.status).toBe(401);
  });

  it("retorna 404 pra Comunique-se inexistente", async () => {
    const { token } = await criarSessaoComLinha();

    const response = await POST(criarRequest(token), {
      params: Promise.resolve({ id: "00000000-0000-0000-0000-000000000000" }),
    });

    expect(response.status).toBe(404);
  });

  it("rejeita Comunique-se já pronto com 400", async () => {
    const { token, comuniqueSeId } = await criarSessaoComLinha("pronto");

    const response = await POST(criarRequest(token), { params: Promise.resolve({ id: comuniqueSeId }) });

    expect(response.status).toBe(400);
    expect(reprocessarComuniqueSe).not.toHaveBeenCalled();
  });

  it("chama reprocessarComuniqueSe e retorna 200 no sucesso", async () => {
    const { token, comuniqueSeId } = await criarSessaoComLinha("erro");
    vi.mocked(reprocessarComuniqueSe).mockResolvedValue({
      id: comuniqueSeId,
      numero: 1,
      status: "pronto",
      pdfOriginalUrl: "/x",
    });

    const response = await POST(criarRequest(token), { params: Promise.resolve({ id: comuniqueSeId }) });

    expect(response.status).toBe(200);
    const corpo = await response.json();
    expect(corpo.comuniqueSe.status).toBe("pronto");
  });

  it("retorna 500 quando reprocessarComuniqueSe lança", async () => {
    const { token, comuniqueSeId } = await criarSessaoComLinha("erro");
    vi.mocked(reprocessarComuniqueSe).mockRejectedValue(new Error("falhou"));

    const response = await POST(criarRequest(token), { params: Promise.resolve({ id: comuniqueSeId }) });

    expect(response.status).toBe(500);
  });
});
