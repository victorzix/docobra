import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { semearCatalogoNoBancoDeTeste } from "@/db/__tests__/helpers/semear-catalogo";
import { empresa, usuario } from "@/db/schema";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";
import { assinarToken } from "@/lib/auth/jwt";
import { criarCenario, limparCenarios } from "@/lib/pagamentos/__tests__/helpers/cenario";
import { PUT } from "@/app/api/empresa/documento/route";

async function sessao(documento: string | null = null) {
  const cenario = await criarCenario({ documento });
  const [admin] = await db.select().from(usuario);
  const token = await assinarToken({ userId: admin.id, empresaId: cenario.empresaId, papel: admin.papel });
  return { cenario, token };
}

function requisicao(corpo: unknown, token?: string) {
  return new NextRequest("http://localhost/api/empresa/documento", {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...(token ? { Cookie: `${SESSION_COOKIE_NAME}=${token}` } : {}) },
    body: JSON.stringify(corpo),
  });
}

describe("PUT /api/empresa/documento", () => {
  beforeAll(semearCatalogoNoBancoDeTeste);
  beforeEach(limparCenarios);
  afterEach(limparCenarios);

  it("sem sessão: 401", async () => {
    expect((await PUT(requisicao({ documento: "12345678000199" }))).status).toBe(401);
  });

  it("grava só os dígitos de um CNPJ com máscara", async () => {
    const { cenario, token } = await sessao();

    const resposta = await PUT(requisicao({ documento: "12.345.678/0001-99" }, token));

    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toEqual({ documento: "12345678000199" });
    const [salva] = await db.select().from(empresa).where(eq(empresa.id, cenario.empresaId));
    expect(salva.documento).toBe("12345678000199");
  });

  it("aceita CPF (11 dígitos) com máscara", async () => {
    const { token } = await sessao();

    const resposta = await PUT(requisicao({ documento: "123.456.789-09" }, token));

    expect(await resposta.json()).toEqual({ documento: "12345678909" });
  });

  it.each(["", "123", "123456789012", "abcdefghijk", "1234567890123"])("rejeita %j com 400", async (documento) => {
    const { token } = await sessao();

    const resposta = await PUT(requisicao({ documento }, token));

    expect(resposta.status).toBe(400);
  });

  it("corpo sem o campo: 400", async () => {
    const { token } = await sessao();

    expect((await PUT(requisicao({}, token))).status).toBe(400);
  });
});
