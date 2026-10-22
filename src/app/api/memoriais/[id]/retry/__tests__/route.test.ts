import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { criarAssinatura } from "@/db/queries/assinatura";
import { registrarConsumo } from "@/db/queries/consumo";
import { criarMemorialRascunho } from "@/db/queries/memorial";
import { consumo, empresa, memorialDescritivo, projeto, usuario } from "@/db/schema";
import { semearCatalogoNoBancoDeTeste } from "@/db/__tests__/helpers/semear-catalogo";
import { assinarToken } from "@/lib/auth/jwt";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";

vi.mock("@/lib/memorial/gerar", () => ({
  regerarMemorial: vi.fn(),
}));

import { regerarMemorial } from "@/lib/memorial/gerar";
import { POST } from "@/app/api/memoriais/[id]/retry/route";

async function limparBanco() {
  await db.delete(memorialDescritivo);
  await db.delete(projeto);
  await db.delete(usuario);
  await db.delete(empresa);
}

async function criarMemorialPendente(planoChave: string) {
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
  const memorial = await criarMemorialRascunho({
    projetoId: novoProjeto.id,
    empresaId: novaEmpresa.id,
    respostasFormularioJson: { tipoConstrucao: "residencial" },
  });
  const token = await assinarToken({ userId: novoUsuario.id, empresaId: novaEmpresa.id, papel: novoUsuario.papel });
  return { token, memorialId: memorial.id, empresaId: novaEmpresa.id };
}

function criarRequest(id: string, token: string) {
  return new NextRequest(`http://localhost/api/memoriais/${id}/retry`, {
    method: "POST",
    headers: { Cookie: `${SESSION_COOKIE_NAME}=${token}` },
  });
}

describe("POST /api/memoriais/[id]/retry", () => {
  beforeAll(semearCatalogoNoBancoDeTeste);
  beforeEach(async () => {
    await limparBanco();
    vi.mocked(regerarMemorial).mockReset();
  });
  afterEach(limparBanco);

  it("rejeita sem sessão com 401", async () => {
    const response = await POST(new NextRequest("http://localhost/api/memoriais/x/retry", { method: "POST" }), {
      params: Promise.resolve({ id: "x" }),
    });
    expect(response.status).toBe(401);
  });

  it("retorna 404 pra memorial inexistente", async () => {
    const { token } = await criarMemorialPendente("escritorio");
    const id = "00000000-0000-0000-0000-000000000000";

    const response = await POST(criarRequest(id, token), { params: Promise.resolve({ id }) });

    expect(response.status).toBe(404);
  });

  it("rejeita memorial já gerado com 400", async () => {
    const { token, memorialId } = await criarMemorialPendente("escritorio");
    await db.update(memorialDescritivo).set({ status: "gerado" }).where(eq(memorialDescritivo.id, memorialId));

    const response = await POST(criarRequest(memorialId, token), { params: Promise.resolve({ id: memorialId }) });

    expect(response.status).toBe(400);
    expect(regerarMemorial).not.toHaveBeenCalled();
  });

  it("bloqueia com 403 LIMITE_ATINGIDO e não chama a IA quando a cota acabou", async () => {
    const { token, memorialId, empresaId } = await criarMemorialPendente("trial");
    for (const referencia of ["a", "b", "c"]) {
      await registrarConsumo(empresaId, "memorial.gerar", referencia);
    }

    const response = await POST(criarRequest(memorialId, token), { params: Promise.resolve({ id: memorialId }) });

    expect(response.status).toBe(403);
    expect((await response.json()).codigo).toBe("LIMITE_ATINGIDO");
    expect(regerarMemorial).not.toHaveBeenCalled();
  });

  it("registra o consumo com o id do memorial quando o retry dá certo", async () => {
    const { token, memorialId } = await criarMemorialPendente("escritorio");
    vi.mocked(regerarMemorial).mockResolvedValue({
      id: memorialId,
      numero: 1,
      status: "gerado",
      documentoGeradoUrl: `/api/memoriais/${memorialId}/pdf`,
    });

    const response = await POST(criarRequest(memorialId, token), { params: Promise.resolve({ id: memorialId }) });

    expect(response.status).toBe(200);
    const consumos = await db.select().from(consumo);
    expect(consumos).toHaveLength(1);
    expect(consumos[0].referencia).toBe(memorialId);
  });

  it("não consome quando o retry falha", async () => {
    const { token, memorialId } = await criarMemorialPendente("escritorio");
    vi.mocked(regerarMemorial).mockRejectedValue(new Error("falhou"));

    const response = await POST(criarRequest(memorialId, token), { params: Promise.resolve({ id: memorialId }) });

    expect(response.status).toBe(500);
    expect(await db.select().from(consumo)).toHaveLength(0);
  });
});
