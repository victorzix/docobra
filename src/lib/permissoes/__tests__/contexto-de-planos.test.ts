import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "@/db";
import { criarAssinatura } from "@/db/queries/assinatura";
import { empresa, usuario } from "@/db/schema";
import { semearCatalogoNoBancoDeTeste } from "@/db/__tests__/helpers/semear-catalogo";
import { carregarContextoDePlanos } from "../contexto-de-planos";

async function limparBanco() {
  await db.delete(usuario);
  await db.delete(empresa);
}

async function criarSessao() {
  const [novaEmpresa] = await db.insert(empresa).values({ nome: "Ancar Engenharia" }).returning();
  const [novoUsuario] = await db
    .insert(usuario)
    .values({ nome: "Victor", email: "victor@ancar.com.br", senhaHash: "hash-fake", empresaId: novaEmpresa.id })
    .returning();
  await criarAssinatura(db, { empresaId: novaEmpresa.id, planoChave: "trial", status: "trial", origem: "suporte" });
  return { userId: novoUsuario.id, empresaId: novaEmpresa.id };
}

describe("carregarContextoDePlanos", () => {
  beforeAll(semearCatalogoNoBancoDeTeste);
  beforeEach(limparBanco);
  afterEach(async () => {
    vi.unstubAllEnvs();
    await limparBanco();
  });

  it("junta as permissões e os dados de contato do suporte", async () => {
    vi.stubEnv("SUPORTE_EMAIL", "suporte@docobra.com");
    const sessao = await criarSessao();

    const contexto = await carregarContextoDePlanos(sessao);

    expect(contexto.permissoes["memorial.gerar"].limite).toBe(3);
    expect(contexto.contatoSuporte).toEqual({
      email: "suporte@docobra.com",
      empresaNome: "Ancar Engenharia",
      planoChave: "trial",
    });
  });

  it("sem SUPORTE_EMAIL definida, o email é null", async () => {
    vi.stubEnv("SUPORTE_EMAIL", "");
    const sessao = await criarSessao();

    const contexto = await carregarContextoDePlanos(sessao);

    expect(contexto.contatoSuporte.email).toBeNull();
  });
});
