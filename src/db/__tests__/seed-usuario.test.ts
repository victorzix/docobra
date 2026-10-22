import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { Client } from "pg";

import { db } from "@/db";
import { assinatura, assinaturaTrecho, empresa, plano, usuario } from "@/db/schema";
import { criarUsuarioComEmpresa } from "../../../scripts/seed-usuario.mjs";
import { semearCatalogoNoBancoDeTeste } from "./helpers/semear-catalogo";

let client: Client;

beforeAll(async () => {
  await semearCatalogoNoBancoDeTeste();
  client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
});

afterAll(async () => {
  await client.end();
});

afterEach(async () => {
  await db.delete(usuario);
  await db.delete(empresa);
});

describe("criarUsuarioComEmpresa", () => {
  it("cria empresa, usuário admin e a assinatura ativa do plano escritorio", async () => {
    const { empresaId, usuarioId } = await criarUsuarioComEmpresa(client, {
      nome: "Dev",
      email: "dev-seed@docobra.com",
      senha: "123456",
      nomeEmpresa: "Empresa Dev Seed",
    });

    const [usuarioCriado] = await db.select().from(usuario).where(eq(usuario.id, usuarioId));
    expect(usuarioCriado.empresaId).toBe(empresaId);
    expect(usuarioCriado.papel).toBe("admin");

    const [assinaturaCriada] = await db.select().from(assinatura).where(eq(assinatura.empresaId, empresaId));
    expect(assinaturaCriada.status).toBe("ativa");

    const [trecho] = await db
      .select({ plano: plano.chave, fim: assinaturaTrecho.fim })
      .from(assinaturaTrecho)
      .innerJoin(plano, eq(plano.id, assinaturaTrecho.planoId))
      .where(eq(assinaturaTrecho.assinaturaId, assinaturaCriada.id));
    expect(trecho).toEqual({ plano: "escritorio", fim: null });
  });
});
