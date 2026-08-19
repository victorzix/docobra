import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { db } from "@/db";
import { empresa, memorialDescritivo, projeto, usuario } from "@/db/schema";
import { assinarToken } from "@/lib/auth/jwt";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";

vi.mock("@/lib/memorial/gerar", () => ({
  regerarMemorial: vi.fn(),
}));

import { regerarMemorial } from "@/lib/memorial/gerar";
import { POST } from "@/app/api/memoriais/[id]/retry/route";

async function limparBanco() {
  await db.delete(memorialDescritivo);
  await db.delete(usuario);
  await db.delete(projeto);
  await db.delete(empresa);
}

async function criarSessaoComRascunho(status: "rascunho" | "gerado" = "rascunho") {
  const [novaEmpresa] = await db.insert(empresa).values({ nome: "Ancar Engenharia" }).returning();
  const [novoUsuario] = await db
    .insert(usuario)
    .values({ nome: "Victor", email: "victor@ancar.com.br", senhaHash: "hash-fake", empresaId: novaEmpresa.id })
    .returning();
  const [novoProjeto] = await db
    .insert(projeto)
    .values({ nome: "Casa da Praia", empresaId: novaEmpresa.id })
    .returning();
  const [rascunho] = await db
    .insert(memorialDescritivo)
    .values({
      projetoId: novoProjeto.id,
      numero: 1,
      status,
      respostasFormularioJson: { tipoConstrucao: "residencial", especificacoes: {} },
    })
    .returning();
  const token = await assinarToken({ userId: novoUsuario.id, empresaId: novaEmpresa.id, papel: novoUsuario.papel });
  return { token, memorialId: rascunho.id };
}

function criarRequest(token?: string) {
  return new NextRequest("http://localhost/api/memoriais/x/retry", {
    method: "POST",
    headers: token ? { Cookie: `${SESSION_COOKIE_NAME}=${token}` } : {},
  });
}

describe("POST /api/memoriais/[id]/retry", () => {
  beforeEach(async () => {
    await limparBanco();
    vi.mocked(regerarMemorial).mockReset();
  });
  afterEach(limparBanco);

  it("rejeita sem sessão com 401", async () => {
    const response = await POST(criarRequest(), { params: Promise.resolve({ id: "x" }) });
    expect(response.status).toBe(401);
  });

  it("retorna 404 pra memorial inexistente", async () => {
    const { token } = await criarSessaoComRascunho();

    const response = await POST(criarRequest(token), {
      params: Promise.resolve({ id: "00000000-0000-0000-0000-000000000000" }),
    });

    expect(response.status).toBe(404);
  });

  it("rejeita memorial já gerado com 400", async () => {
    const { token, memorialId } = await criarSessaoComRascunho("gerado");

    const response = await POST(criarRequest(token), { params: Promise.resolve({ id: memorialId }) });

    expect(response.status).toBe(400);
    expect(regerarMemorial).not.toHaveBeenCalled();
  });

  it("chama regerarMemorial e retorna 200 no sucesso", async () => {
    const { token, memorialId } = await criarSessaoComRascunho();
    vi.mocked(regerarMemorial).mockResolvedValue({
      id: memorialId,
      numero: 1,
      status: "gerado",
      documentoGeradoUrl: `/api/memoriais/${memorialId}/pdf`,
    });

    const response = await POST(criarRequest(token), { params: Promise.resolve({ id: memorialId }) });

    expect(response.status).toBe(200);
    const corpo = await response.json();
    expect(corpo.memorial.status).toBe("gerado");
    expect(regerarMemorial).toHaveBeenCalledOnce();
  });

  it("retorna 500 quando regerarMemorial lança", async () => {
    const { token, memorialId } = await criarSessaoComRascunho();
    vi.mocked(regerarMemorial).mockRejectedValue(new Error("falhou"));

    const response = await POST(criarRequest(token), { params: Promise.resolve({ id: memorialId }) });

    expect(response.status).toBe(500);
  });
});
