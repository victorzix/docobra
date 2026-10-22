import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { criarAssinatura } from "@/db/queries/assinatura";
import { registrarConsumo } from "@/db/queries/consumo";
import { empresa, empresaPermissao, permissao } from "@/db/schema";
import { semearCatalogoNoBancoDeTeste } from "@/db/__tests__/helpers/semear-catalogo";
import { MS_POR_DIA } from "../janela";
import { verificarPermissao } from "../verificar-permissao";

const AGORA = new Date("2026-06-15T12:00:00Z");
const emDias = (dias: number) => new Date(AGORA.getTime() + dias * MS_POR_DIA);
const COM_SUSPENSAO = { suspensaoAtiva: true };

async function limparBanco() {
  await db.delete(empresa);
}

async function novaEmpresa() {
  const [criada] = await db.insert(empresa).values({ nome: "Empresa Teste" }).returning();
  return criada.id;
}

async function assinar(
  empresaId: string,
  planoChave: string,
  opcoes: { status?: "trial" | "ativa" | "cancelada"; inicio?: Date; venceEm?: Date } = {},
) {
  await criarAssinatura(db, {
    empresaId,
    planoChave,
    status: opcoes.status ?? "ativa",
    origem: "suporte",
    inicio: opcoes.inicio ?? AGORA,
    venceEm: opcoes.venceEm ?? emDias(30),
  });
}

async function idDaPermissao(chave: string) {
  const [linha] = await db.select({ id: permissao.id }).from(permissao).where(eq(permissao.chave, chave));
  return linha.id;
}

describe("verificarPermissao", () => {
  beforeAll(semearCatalogoNoBancoDeTeste);
  beforeEach(limparBanco);
  afterEach(limparBanco);

  it("nega quando a empresa não tem assinatura", async () => {
    const empresaId = await novaEmpresa();

    const resultado = await verificarPermissao(empresaId, "memorial.gerar", AGORA);

    expect(resultado.permitido).toBe(false);
  });

  it("lança erro para uma chave que não existe no catálogo", async () => {
    const empresaId = await novaEmpresa();

    await expect(verificarPermissao(empresaId, "nao.existe", AGORA)).rejects.toThrow(
      'Permissão desconhecida: "nao.existe"',
    );
  });

  it("limite: mostra o que resta e a janela, e bloqueia ao esgotar", async () => {
    const empresaId = await novaEmpresa();
    await assinar(empresaId, "trial", { status: "trial", venceEm: emDias(14) });

    const antes = await verificarPermissao(empresaId, "memorial.gerar", AGORA);
    expect(antes).toMatchObject({ permitido: true, limite: 3, usado: 0, restante: 3 });
    expect(antes.janela).toEqual({ inicio: AGORA, fim: emDias(14) });

    for (const referencia of ["a", "b", "c"]) {
      await registrarConsumo(empresaId, "memorial.gerar", referencia, { agora: AGORA });
    }

    const depois = await verificarPermissao(empresaId, "memorial.gerar", AGORA);
    expect(depois).toMatchObject({ permitido: false, usado: 3, restante: 0 });
  });

  it("limite: consumo de uma janela anterior não conta na atual", async () => {
    const empresaId = await novaEmpresa();
    await assinar(empresaId, "essencial", { inicio: emDias(-40), venceEm: emDias(100) });

    await registrarConsumo(empresaId, "memorial.gerar", "velho-1", { agora: emDias(-35) });
    await registrarConsumo(empresaId, "memorial.gerar", "velho-2", { agora: emDias(-35) });
    await registrarConsumo(empresaId, "memorial.gerar", "novo-1", { agora: emDias(-2) });

    const resultado = await verificarPermissao(empresaId, "memorial.gerar", AGORA);

    expect(resultado).toMatchObject({ permitido: true, limite: 20, usado: 1, restante: 19 });
    expect(resultado.janela).toEqual({ inicio: emDias(-10), fim: emDias(20) });
  });

  it("limite sem valor é ilimitado", async () => {
    const empresaId = await novaEmpresa();
    await assinar(empresaId, "escritorio");

    const resultado = await verificarPermissao(empresaId, "projetos.criar", AGORA);

    expect(resultado).toEqual({ permitido: true, limite: null, usado: 0, restante: null, janela: null });
  });

  it("booleana: concede ou nega conforme o plano", async () => {
    const empresaId = await novaEmpresa();
    await assinar(empresaId, "trial", { status: "trial", venceEm: emDias(14) });

    expect((await verificarPermissao(empresaId, "memorial.audio", AGORA)).permitido).toBe(true);
  });

  it("carência: ainda usa o plano normal", async () => {
    const empresaId = await novaEmpresa();
    await assinar(empresaId, "essencial", { venceEm: emDias(-2) });

    expect((await verificarPermissao(empresaId, "memorial.gerar", AGORA)).permitido).toBe(true);
  });

  it("suspensa (suspensão ligada): resolve pelo plano suspenso (só lista o acervo)", async () => {
    const empresaId = await novaEmpresa();
    await assinar(empresaId, "escritorio", { venceEm: emDias(-10) });

    expect((await verificarPermissao(empresaId, "acervo.listar", AGORA, COM_SUSPENSAO)).permitido).toBe(true);
    expect((await verificarPermissao(empresaId, "acervo.abrir", AGORA, COM_SUSPENSAO)).permitido).toBe(false);
    expect((await verificarPermissao(empresaId, "acervo.baixar", AGORA, COM_SUSPENSAO)).permitido).toBe(false);
    expect((await verificarPermissao(empresaId, "memorial.gerar", AGORA, COM_SUSPENSAO)).permitido).toBe(false);
  });

  it("com a suspensão desligada (padrão), a empresa vencida segue com o plano normal", async () => {
    const empresaId = await novaEmpresa();
    await assinar(empresaId, "escritorio", { venceEm: emDias(-10) });

    expect((await verificarPermissao(empresaId, "memorial.gerar", AGORA)).permitido).toBe(true);
    expect((await verificarPermissao(empresaId, "acervo.abrir", AGORA)).permitido).toBe(true);
  });

  it("a variável ASSINATURA_SUSPENSAO_ATIVA liga a suspensão quando a opção não é passada", async () => {
    vi.stubEnv("ASSINATURA_SUSPENSAO_ATIVA", "true");
    try {
      const empresaId = await novaEmpresa();
      await assinar(empresaId, "escritorio", { venceEm: emDias(-10) });

      expect((await verificarPermissao(empresaId, "memorial.gerar", AGORA)).permitido).toBe(false);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("sobrescrita da empresa vence o plano e usa o próprio início como âncora", async () => {
    const empresaId = await novaEmpresa();
    await assinar(empresaId, "trial", { status: "trial", venceEm: emDias(14) });
    await db.insert(empresaPermissao).values({
      empresaId,
      permissaoId: await idDaPermissao("memorial.gerar"),
      valor: 50,
      janelaDias: 30,
      inicio: emDias(-1),
      motivo: "piloto",
    });

    const resultado = await verificarPermissao(empresaId, "memorial.gerar", AGORA);

    expect(resultado).toMatchObject({ permitido: true, limite: 50, restante: 50 });
    expect(resultado.janela).toEqual({ inicio: emDias(-1), fim: emDias(29) });
  });

  it("sobrescrita expirada ou ainda não iniciada é ignorada", async () => {
    const empresaId = await novaEmpresa();
    await assinar(empresaId, "trial", { status: "trial", venceEm: emDias(14) });
    const permissaoId = await idDaPermissao("memorial.gerar");
    await db.insert(empresaPermissao).values({
      empresaId,
      permissaoId,
      valor: 50,
      janelaDias: 30,
      inicio: emDias(-10),
      expiraEm: emDias(-1),
    });

    expect((await verificarPermissao(empresaId, "memorial.gerar", AGORA)).limite).toBe(3);

    await db
      .update(empresaPermissao)
      .set({ inicio: emDias(5), expiraEm: null })
      .where(eq(empresaPermissao.empresaId, empresaId));

    expect((await verificarPermissao(empresaId, "memorial.gerar", AGORA)).limite).toBe(3);
  });

  it("sobrescrita também vale para empresa suspensa", async () => {
    const empresaId = await novaEmpresa();
    await assinar(empresaId, "escritorio", { venceEm: emDias(-10) });
    await db.insert(empresaPermissao).values({
      empresaId,
      permissaoId: await idDaPermissao("memorial.gerar"),
      valor: 5,
      janelaDias: 30,
      inicio: emDias(-1),
    });

    expect((await verificarPermissao(empresaId, "memorial.gerar", AGORA, COM_SUSPENSAO)).permitido).toBe(true);
  });
});

describe("registrarConsumo", () => {
  beforeAll(semearCatalogoNoBancoDeTeste);
  beforeEach(limparBanco);
  afterEach(limparBanco);

  it("é idempotente por referência", async () => {
    const empresaId = await novaEmpresa();
    await assinar(empresaId, "essencial");

    const primeira = await registrarConsumo(empresaId, "memorial.gerar", "item-1", { agora: AGORA });
    const repetida = await registrarConsumo(empresaId, "memorial.gerar", "item-1", { agora: AGORA });

    expect(primeira).toBe(true);
    expect(repetida).toBe(false);
    expect((await verificarPermissao(empresaId, "memorial.gerar", AGORA)).usado).toBe(1);
  });

  it("soma a quantidade informada", async () => {
    const empresaId = await novaEmpresa();
    await assinar(empresaId, "essencial");

    await registrarConsumo(empresaId, "memorial.gerar", "item-1", { quantidade: 3, agora: AGORA });

    expect((await verificarPermissao(empresaId, "memorial.gerar", AGORA)).usado).toBe(3);
  });

  it("lança erro para uma chave desconhecida", async () => {
    const empresaId = await novaEmpresa();

    await expect(registrarConsumo(empresaId, "nao.existe", "x")).rejects.toThrow(
      'Permissão desconhecida: "nao.existe"',
    );
  });
});
