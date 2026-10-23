import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { semearCatalogoNoBancoDeTeste } from "@/db/__tests__/helpers/semear-catalogo";
import { usuario } from "@/db/schema";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";
import { assinarToken } from "@/lib/auth/jwt";
import { criarCenario, inserirCobranca, limparCenarios } from "@/lib/pagamentos/__tests__/helpers/cenario";
import { GET } from "@/app/api/cobrancas/[id]/route";

async function tokenDaEmpresa(empresaId: string) {
  const [admin] = await db.select().from(usuario).where(eq(usuario.empresaId, empresaId));
  return assinarToken({ userId: admin.id, empresaId, papel: admin.papel });
}

function requisicao(id: string, token?: string) {
  return new NextRequest(`http://localhost/api/cobrancas/${id}`, {
    headers: token ? { Cookie: `${SESSION_COOKIE_NAME}=${token}` } : {},
  });
}

const chamar = (request: NextRequest, id: string) => GET(request, { params: Promise.resolve({ id }) });

describe("GET /api/cobrancas/[id]", () => {
  beforeAll(semearCatalogoNoBancoDeTeste);
  beforeEach(limparCenarios);
  afterEach(limparCenarios);

  it("sem sessão: 401", async () => {
    expect((await chamar(requisicao("x"), "x")).status).toBe(401);
  });

  it("devolve a cobrança da própria empresa", async () => {
    const cenario = await criarCenario();
    const criada = await inserirCobranca(cenario);
    const token = await tokenDaEmpresa(cenario.empresaId);

    const resposta = await chamar(requisicao(criada.id, token), criada.id);

    expect(resposta.status).toBe(200);
    expect((await resposta.json()).cobranca).toMatchObject({ id: criada.id, status: "pendente", valorCentavos: 9900 });
  });

  it("cobrança de outra empresa ou inexistente: 404", async () => {
    const cenario = await criarCenario();
    const criada = await inserirCobranca(cenario);
    const outra = await criarCenario({ email: "outra@cobranca.com" });
    const tokenDaOutra = await tokenDaEmpresa(outra.empresaId);

    expect((await chamar(requisicao(criada.id, tokenDaOutra), criada.id)).status).toBe(404);
    const inexistente = "00000000-0000-0000-0000-000000000000";
    expect((await chamar(requisicao(inexistente, tokenDaOutra), inexistente)).status).toBe(404);
  });

  it("id que não é UUID: 404 (sem erro de banco)", async () => {
    const cenario = await criarCenario();
    const token = await tokenDaEmpresa(cenario.empresaId);

    expect((await chamar(requisicao("abc", token), "abc")).status).toBe(404);
  });
});
