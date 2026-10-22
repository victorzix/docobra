import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { db } from "@/db";
import { criarAssinatura } from "@/db/queries/assinatura";
import { registrarConsumo } from "@/db/queries/consumo";
import { empresa, usuario } from "@/db/schema";
import { semearCatalogoNoBancoDeTeste } from "@/db/__tests__/helpers/semear-catalogo";
import { assinarToken } from "@/lib/auth/jwt";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";
import { GET } from "@/app/api/permissoes/route";

async function limparBanco() {
  await db.delete(usuario);
  await db.delete(empresa);
}

async function criarEmpresaComSessao(nome: string, email: string) {
  const [novaEmpresa] = await db.insert(empresa).values({ nome }).returning();
  const [novoUsuario] = await db
    .insert(usuario)
    .values({ nome, email, senhaHash: "hash-fake", empresaId: novaEmpresa.id })
    .returning();
  await criarAssinatura(db, { empresaId: novaEmpresa.id, planoChave: "trial", status: "trial", origem: "suporte" });
  const token = await assinarToken({ userId: novoUsuario.id, empresaId: novaEmpresa.id, papel: novoUsuario.papel });
  return { empresaId: novaEmpresa.id, token };
}

function criarRequest(token?: string) {
  return new NextRequest("http://localhost/api/permissoes", {
    headers: token ? { Cookie: `${SESSION_COOKIE_NAME}=${token}` } : {},
  });
}

describe("GET /api/permissoes", () => {
  beforeAll(semearCatalogoNoBancoDeTeste);
  beforeEach(limparBanco);
  afterEach(limparBanco);

  it("rejeita sem sessão com 401", async () => {
    const response = await GET(criarRequest());

    expect(response.status).toBe(401);
  });

  it("devolve só as permissões da empresa da sessão", async () => {
    const { token } = await criarEmpresaComSessao("Empresa A", "a@teste.com");
    const outra = await criarEmpresaComSessao("Empresa B", "b@teste.com");
    for (const referencia of ["x", "y", "z"]) {
      await registrarConsumo(outra.empresaId, "memorial.gerar", referencia);
    }

    const response = await GET(criarRequest(token));

    expect(response.status).toBe(200);
    const corpo = await response.json();
    expect(corpo["memorial.gerar"]).toMatchObject({ permitido: true, limite: 3, usado: 0, restante: 3 });
  });
});
