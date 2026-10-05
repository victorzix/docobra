import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { db } from "@/db";
import { empresa } from "@/db/schema";
import { MS_POR_DIA } from "@/lib/permissoes/janela";
import { semearCatalogoNoBancoDeTeste } from "../../__tests__/helpers/semear-catalogo";
import { buscarAssinaturaVigente, criarAssinatura, criarAssinaturaTrial } from "../assinatura";

const AGORA = new Date("2026-06-15T12:00:00Z");

async function limparBanco() {
  await db.delete(empresa);
}

async function novaEmpresa() {
  const [criada] = await db.insert(empresa).values({ nome: "Empresa Teste" }).returning();
  return criada.id;
}

describe("assinatura", () => {
  beforeAll(semearCatalogoNoBancoDeTeste);
  beforeEach(limparBanco);
  afterEach(limparBanco);

  it("criarAssinatura grava assinatura e trecho vigente, com vencimento pelo ciclo do plano", async () => {
    const empresaId = await novaEmpresa();

    await criarAssinatura(db, {
      empresaId,
      planoChave: "essencial",
      status: "ativa",
      origem: "autoatendimento",
      inicio: AGORA,
    });

    const vigente = await buscarAssinaturaVigente(empresaId);
    expect(vigente?.planoChave).toBe("essencial");
    expect(vigente?.status).toBe("ativa");
    expect(vigente?.inicio).toEqual(AGORA);
    expect(vigente?.venceEm).toEqual(new Date(AGORA.getTime() + 30 * MS_POR_DIA));
  });

  it("criarAssinaturaTrial usa o plano trial e vence em 14 dias", async () => {
    const empresaId = await novaEmpresa();

    await criarAssinaturaTrial(db, empresaId, AGORA);

    const vigente = await buscarAssinaturaVigente(empresaId);
    expect(vigente?.planoChave).toBe("trial");
    expect(vigente?.status).toBe("trial");
    expect(vigente?.venceEm).toEqual(new Date(AGORA.getTime() + 14 * MS_POR_DIA));
  });

  it("criarAssinaturaTrial funciona dentro de uma transação", async () => {
    const empresaId = await novaEmpresa();

    await db.transaction(async (tx) => {
      await criarAssinaturaTrial(tx, empresaId, AGORA);
    });

    const vigente = await buscarAssinaturaVigente(empresaId);
    expect(vigente?.planoChave).toBe("trial");
  });

  it("buscarAssinaturaVigente devolve null para empresa sem assinatura", async () => {
    const empresaId = await novaEmpresa();

    expect(await buscarAssinaturaVigente(empresaId)).toBeNull();
  });

  it("lança erro claro quando o plano não existe", async () => {
    const empresaId = await novaEmpresa();

    await expect(
      criarAssinatura(db, {
        empresaId,
        planoChave: "nao-existe",
        status: "ativa",
        origem: "suporte",
      }),
    ).rejects.toThrow('Plano "nao-existe" não encontrado');
  });

  it("rejeita uma segunda assinatura para a mesma empresa", async () => {
    const empresaId = await novaEmpresa();
    await criarAssinaturaTrial(db, empresaId, AGORA);

    await expect(criarAssinaturaTrial(db, empresaId, AGORA)).rejects.toThrow();
  });
});
