import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { Client } from "pg";

import { db } from "@/db";
import {
  assinatura,
  assinaturaTrecho,
  empresa,
  permissao,
  plano,
  planoPermissao,
} from "@/db/schema";
import {
  criarAssinaturaInicial,
  lerOpcoes,
  preencherAssinaturasExistentes,
  semearPlanos,
} from "../../../scripts/seed-planos.mjs";

const PLANOS = ["trial", "suspenso", "essencial", "escritorio"];

let client: Client;

beforeAll(async () => {
  client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
});

afterAll(async () => {
  await client.end();
});

afterEach(async () => {
  await db.delete(empresa);
  await db.update(plano).set({ precoCentavos: 9900 }).where(eq(plano.chave, "essencial"));
});

describe("semearPlanos", () => {
  it("cria os planos e as permissões do catálogo", async () => {
    await semearPlanos(client);

    const planos = await db.select({ chave: plano.chave }).from(plano).where(inArray(plano.chave, PLANOS));
    expect(planos).toHaveLength(4);

    const [listar] = await db.select().from(permissao).where(eq(permissao.chave, "acervo.listar"));
    expect(listar.tipo).toBe("booleana");
  });

  it("é idempotente", async () => {
    await semearPlanos(client);
    const antes = await db.select().from(planoPermissao);

    await semearPlanos(client);
    const depois = await db.select().from(planoPermissao);

    expect(depois).toHaveLength(antes.length);
  });

  it("o plano suspenso só concede a listagem do acervo", async () => {
    await semearPlanos(client);

    const vinculos = await db
      .select({ chave: permissao.chave })
      .from(planoPermissao)
      .innerJoin(plano, eq(plano.id, planoPermissao.planoId))
      .innerJoin(permissao, eq(permissao.id, planoPermissao.permissaoId))
      .where(eq(plano.chave, "suspenso"));

    expect(vinculos).toEqual([{ chave: "acervo.listar" }]);
  });

  it("não sobrescreve um preço editado depois do primeiro seed", async () => {
    await semearPlanos(client);
    await db.update(plano).set({ precoCentavos: 1 }).where(eq(plano.chave, "essencial"));

    await semearPlanos(client);

    const [essencial] = await db.select().from(plano).where(eq(plano.chave, "essencial"));
    expect(essencial.precoCentavos).toBe(1);
  });
});

describe("preencherAssinaturasExistentes", () => {
  it("dá assinatura ativa do plano escritório a quem não tem, e só a quem não tem", async () => {
    await semearPlanos(client);
    const [semAssinatura] = await db.insert(empresa).values({ nome: "Sem Assinatura" }).returning();
    const agora = new Date("2026-06-15T12:00:00Z");

    const total = await preencherAssinaturasExistentes(client, { agora });

    expect(total).toBe(1);
    const [criada] = await db.select().from(assinatura).where(eq(assinatura.empresaId, semAssinatura.id));
    expect(criada.status).toBe("ativa");
    expect(criada.inicio).toEqual(agora);

    const [trecho] = await db
      .select({ chave: plano.chave, origem: assinaturaTrecho.origem, fim: assinaturaTrecho.fim })
      .from(assinaturaTrecho)
      .innerJoin(plano, eq(plano.id, assinaturaTrecho.planoId))
      .where(and(eq(assinaturaTrecho.assinaturaId, criada.id)));
    expect(trecho).toEqual({ chave: "escritorio", origem: "suporte", fim: null });

    expect(await preencherAssinaturasExistentes(client, { agora })).toBe(0);
  });
});

describe("lerOpcoes", () => {
  it("por padrão não preenche empresas existentes e usa o plano escritorio", () => {
    expect(lerOpcoes([])).toEqual({ planoChave: "escritorio", preencherExistentes: false });
  });

  it("lê --preencher-existentes e --plano", () => {
    expect(lerOpcoes(["--preencher-existentes", "--plano=essencial"])).toEqual({
      planoChave: "essencial",
      preencherExistentes: true,
    });
  });
});

describe("criarAssinaturaInicial", () => {
  it("devolve false e não duplica quando a empresa já tem assinatura", async () => {
    await semearPlanos(client);
    const [nova] = await db.insert(empresa).values({ nome: "Com Assinatura" }).returning();

    expect(await criarAssinaturaInicial(client, { empresaId: nova.id })).toBe(true);
    expect(await criarAssinaturaInicial(client, { empresaId: nova.id })).toBe(false);

    const assinaturas = await db.select().from(assinatura).where(eq(assinatura.empresaId, nova.id));
    expect(assinaturas).toHaveLength(1);
    const trechos = await db
      .select()
      .from(assinaturaTrecho)
      .where(eq(assinaturaTrecho.assinaturaId, assinaturas[0].id));
    expect(trechos).toHaveLength(1);
  });

  it("lança erro claro quando o plano não existe", async () => {
    const [nova] = await db.insert(empresa).values({ nome: "Sem Plano" }).returning();

    await expect(
      criarAssinaturaInicial(client, { empresaId: nova.id, planoChave: "nao-existe" }),
    ).rejects.toThrow('Plano "nao-existe" não encontrado');
  });
});

describe("preencherAssinaturasExistentes (concorrência)", () => {
  it("duas execuções simultâneas não quebram nem duplicam", async () => {
    await semearPlanos(client);
    await db
      .insert(empresa)
      .values([{ nome: "A" }, { nome: "B" }, { nome: "C" }, { nome: "D" }, { nome: "E" }]);
    const outro = new Client({ connectionString: process.env.DATABASE_URL });
    await outro.connect();

    try {
      const [a, b] = await Promise.all([
        preencherAssinaturasExistentes(client),
        preencherAssinaturasExistentes(outro),
      ]);
      expect(a + b).toBe(5);
    } finally {
      await outro.end();
    }

    expect(await db.select().from(assinatura)).toHaveLength(5);
    expect(await db.select().from(assinaturaTrecho)).toHaveLength(5);
  });
});
