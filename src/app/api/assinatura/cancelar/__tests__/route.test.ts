import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { semearCatalogoNoBancoDeTeste } from "@/db/__tests__/helpers/semear-catalogo";
import { assinatura, usuario } from "@/db/schema";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";
import { assinarToken } from "@/lib/auth/jwt";
import { criarCenario, limparCenarios } from "@/lib/pagamentos/__tests__/helpers/cenario";
import { POST } from "@/app/api/assinatura/cancelar/route";

async function tokenDaEmpresa(empresaId: string) {
  const [admin] = await db.select().from(usuario).where(eq(usuario.empresaId, empresaId));
  return assinarToken({ userId: admin.id, empresaId, papel: admin.papel });
}

function requisicao(token?: string) {
  return new NextRequest("http://localhost/api/assinatura/cancelar", {
    method: "POST",
    headers: token ? { Cookie: `${SESSION_COOKIE_NAME}=${token}` } : {},
  });
}

describe("POST /api/assinatura/cancelar", () => {
  beforeAll(semearCatalogoNoBancoDeTeste);
  beforeEach(limparCenarios);
  afterEach(limparCenarios);

  it("sem sessão: 401", async () => {
    expect((await POST(requisicao())).status).toBe(401);
  });

  it("ativa no ciclo: 200 e assinatura cancelada", async () => {
    const cenario = await criarCenario({
      planoChave: "essencial",
      status: "ativa",
      venceEm: new Date(Date.now() + 10 * 86_400_000),
    });
    const token = await tokenDaEmpresa(cenario.empresaId);

    const resposta = await POST(requisicao(token));

    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toEqual({ ok: true });
    const [linha] = await db.select({ status: assinatura.status }).from(assinatura).where(eq(assinatura.id, cenario.assinaturaId));
    expect(linha.status).toBe("cancelada");
  });

  it("trial: 409 ASSINATURA_NAO_CANCELAVEL", async () => {
    const cenario = await criarCenario({
      planoChave: "essencial",
      status: "trial",
      venceEm: new Date(Date.now() + 5 * 86_400_000),
    });
    const token = await tokenDaEmpresa(cenario.empresaId);

    const resposta = await POST(requisicao(token));

    expect(resposta.status).toBe(409);
    expect((await resposta.json()).codigo).toBe("ASSINATURA_NAO_CANCELAVEL");
  });
});
