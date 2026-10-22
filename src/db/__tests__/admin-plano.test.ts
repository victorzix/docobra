import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { Client } from "pg";

import { db } from "@/db";
import { criarAssinatura } from "@/db/queries/assinatura";
import { registrarConsumo } from "@/db/queries/consumo";
import { assinatura, assinaturaTrecho, empresa, empresaPermissao, plano, usuario } from "@/db/schema";
import { calcularJanela, MS_POR_DIA } from "@/lib/permissoes/janela";
import { verificarPermissao } from "@/lib/permissoes/verificar-permissao";
import {
  definirCota,
  estenderVencimento,
  janelaAtual,
  lerArgumentos,
  mostrarEmpresa,
  trocarPlano,
} from "../../../scripts/admin-plano.mjs";
import { semearCatalogoNoBancoDeTeste } from "./helpers/semear-catalogo";

const AGORA = new Date("2026-06-15T12:00:00Z");
const EMAIL = "cliente@teste.com";

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

async function criarCliente(planoChave: string, status: "trial" | "ativa" = "trial") {
  const [novaEmpresa] = await db.insert(empresa).values({ nome: "Empresa Cliente" }).returning();
  await db
    .insert(usuario)
    .values({ nome: "Cliente", email: EMAIL, senhaHash: "hash-fake", empresaId: novaEmpresa.id });
  await criarAssinatura(db, { empresaId: novaEmpresa.id, planoChave, status, origem: "suporte", inicio: AGORA });
  return novaEmpresa.id;
}

describe("janelaAtual", () => {
  it("é idêntica a calcularJanela", () => {
    const ancora = new Date("2026-03-01T00:00:00Z");
    for (const [janelaDias, dias] of [[30, 0], [30, 29], [30, 30], [30, 95], [360, 400], [30, -5]] as const) {
      const agora = new Date(ancora.getTime() + dias * MS_POR_DIA);
      expect(janelaAtual(ancora, janelaDias, agora)).toEqual(calcularJanela(ancora, janelaDias, agora));
    }
  });
});

describe("lerArgumentos", () => {
  it("lê a ação e as opções nomeadas", () => {
    expect(
      lerArgumentos([
        "cota",
        "--email=a@b.com",
        "--permissao=memorial.gerar",
        "--valor=50",
        "--janela-dias=30",
        "--expira-em=2026-12-31",
        "--motivo=piloto",
      ]),
    ).toEqual({
      acao: "cota",
      email: "a@b.com",
      permissao: "memorial.gerar",
      valor: 50,
      janelaDias: 30,
      expiraEm: new Date("2026-12-31"),
      motivo: "piloto",
    });
  });

  it("valor=ilimitado vira null", () => {
    expect(lerArgumentos(["cota", "--valor=ilimitado"]).valor).toBeNull();
  });

  it("lê --plano e --dias", () => {
    expect(lerArgumentos(["trocar-plano", "--plano=essencial"]).plano).toBe("essencial");
    expect(lerArgumentos(["estender", "--dias=10"]).dias).toBe(10);
  });
});

describe("mostrarEmpresa", () => {
  it("mostra plano, vencimento, uso na janela e sobrescritas", async () => {
    const empresaId = await criarCliente("trial");
    await registrarConsumo(empresaId, "memorial.gerar", "m1", { agora: AGORA });
    await definirCota(client, EMAIL, { permissao: "projetos.criar", valor: 50, janelaDias: 30, agora: AGORA });

    const resultado = await mostrarEmpresa(client, EMAIL, { agora: AGORA });

    expect(resultado.empresa.nome).toBe("Empresa Cliente");
    expect(resultado.assinatura.plano).toBe("trial");
    expect(resultado.assinatura.status).toBe("trial");
    const gerar = resultado.permissoes.find((p) => p.chave === "memorial.gerar");
    expect(gerar).toMatchObject({ origem: "plano", valor: 3, janelaDias: 14, usado: 1 });
    const projetos = resultado.permissoes.find((p) => p.chave === "projetos.criar");
    expect(projetos).toMatchObject({ origem: "sobrescrita", valor: 50, janelaDias: 30, usado: 0 });
  });

  it("lança erro claro para email inexistente", async () => {
    await expect(mostrarEmpresa(client, "ninguem@teste.com")).rejects.toThrow(
      'Nenhum usuário com o email "ninguem@teste.com"',
    );
  });
});

describe("trocarPlano", () => {
  it("fecha o trecho, abre outro e mantém o dia 0 e o consumo", async () => {
    const empresaId = await criarCliente("trial");
    await registrarConsumo(empresaId, "memorial.gerar", "m1", { agora: AGORA });
    const depois = new Date(AGORA.getTime() + 5 * MS_POR_DIA);

    const resultado = await trocarPlano(client, EMAIL, "essencial", { agora: depois });

    expect(resultado).toEqual({ de: "trial", para: "essencial", statusAnterior: "trial", statusNovo: "ativa" });
    const [assinaturaAtual] = await db.select().from(assinatura).where(eq(assinatura.empresaId, empresaId));
    expect(assinaturaAtual.inicio).toEqual(AGORA);
    expect(assinaturaAtual.status).toBe("ativa");

    const trechos = await db
      .select({ plano: plano.chave, inicio: assinaturaTrecho.inicio, fim: assinaturaTrecho.fim, origem: assinaturaTrecho.origem })
      .from(assinaturaTrecho)
      .innerJoin(plano, eq(plano.id, assinaturaTrecho.planoId))
      .where(eq(assinaturaTrecho.assinaturaId, assinaturaAtual.id));
    expect(trechos).toHaveLength(2);
    expect(trechos.find((t) => t.plano === "trial")?.fim).toEqual(depois);
    expect(trechos.find((t) => t.plano === "essencial")).toMatchObject({ fim: null, origem: "suporte" });

    const verificada = await verificarPermissao(empresaId, "memorial.gerar", depois);
    expect(verificada).toMatchObject({ limite: 20, usado: 1 });
  });

  it("não muda o status de uma assinatura já ativa", async () => {
    await criarCliente("essencial", "ativa");

    const resultado = await trocarPlano(client, EMAIL, "escritorio", { agora: AGORA });

    expect(resultado.statusNovo).toBe("ativa");
  });

  it("rejeita o plano em que a empresa já está", async () => {
    await criarCliente("trial");

    await expect(trocarPlano(client, EMAIL, "trial", { agora: AGORA })).rejects.toThrow(
      'A empresa já está no plano "trial"',
    );
  });

  it("rejeita plano inexistente", async () => {
    await criarCliente("trial");

    await expect(trocarPlano(client, EMAIL, "nao-existe", { agora: AGORA })).rejects.toThrow(
      'Plano "nao-existe" não encontrado',
    );
  });
});

describe("definirCota", () => {
  it("cria a sobrescrita e a verificarPermissao passa a usá-la", async () => {
    const empresaId = await criarCliente("trial");

    await definirCota(client, EMAIL, {
      permissao: "memorial.gerar",
      valor: 50,
      janelaDias: 30,
      motivo: "piloto",
      agora: AGORA,
    });

    const [linha] = await db.select().from(empresaPermissao).where(eq(empresaPermissao.empresaId, empresaId));
    expect(linha).toMatchObject({ valor: 50, janelaDias: 30, motivo: "piloto" });
    expect(await verificarPermissao(empresaId, "memorial.gerar", AGORA)).toMatchObject({ limite: 50, restante: 50 });
  });

  it("atualiza a sobrescrita existente", async () => {
    const empresaId = await criarCliente("trial");
    await definirCota(client, EMAIL, { permissao: "memorial.gerar", valor: 50, janelaDias: 30, agora: AGORA });

    await definirCota(client, EMAIL, { permissao: "memorial.gerar", valor: 80, janelaDias: 60, agora: AGORA });

    const linhas = await db.select().from(empresaPermissao).where(eq(empresaPermissao.empresaId, empresaId));
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatchObject({ valor: 80, janelaDias: 60 });
  });

  it("valor e janela nulos significam ilimitado", async () => {
    const empresaId = await criarCliente("trial");

    await definirCota(client, EMAIL, { permissao: "memorial.gerar", valor: null, janelaDias: null, agora: AGORA });

    expect(await verificarPermissao(empresaId, "memorial.gerar", AGORA)).toMatchObject({ permitido: true, limite: null });
  });

  it("rejeita valor sem janela e janela sem valor", async () => {
    await criarCliente("trial");

    await expect(
      definirCota(client, EMAIL, { permissao: "memorial.gerar", valor: 5, janelaDias: null }),
    ).rejects.toThrow("valor e janela-dias");
    await expect(
      definirCota(client, EMAIL, { permissao: "memorial.gerar", valor: null, janelaDias: 30 }),
    ).rejects.toThrow("valor e janela-dias");
  });

  it("rejeita permissão inexistente", async () => {
    await criarCliente("trial");

    await expect(
      definirCota(client, EMAIL, { permissao: "nao.existe", valor: 5, janelaDias: 30 }),
    ).rejects.toThrow('Permissão "nao.existe" não encontrada');
  });
});

describe("estenderVencimento", () => {
  it("soma os dias ao vencimento", async () => {
    const empresaId = await criarCliente("trial");
    const [antes] = await db.select().from(assinatura).where(eq(assinatura.empresaId, empresaId));

    const resultado = await estenderVencimento(client, EMAIL, 10, { agora: AGORA });

    expect(resultado.venceEm).toEqual(new Date(antes.venceEm.getTime() + 10 * MS_POR_DIA));
  });

  it("rejeita dias que não sejam inteiro positivo", async () => {
    await criarCliente("trial");

    await expect(estenderVencimento(client, EMAIL, 0)).rejects.toThrow("inteiro positivo");
    await expect(estenderVencimento(client, EMAIL, -3)).rejects.toThrow("inteiro positivo");
  });
});
