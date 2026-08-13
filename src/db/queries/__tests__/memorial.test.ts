import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { db } from "@/db";
import { empresa, memorialDescritivo, projeto } from "@/db/schema";
import {
  buscarMemorialDaEmpresa,
  criarMemorialRascunho,
  listarMemoriais,
  marcarComoGerado,
} from "../memorial";

async function limparBanco() {
  await db.delete(memorialDescritivo);
  await db.delete(projeto);
  await db.delete(empresa);
}

async function criarProjetoDeTeste(nomeEmpresa = "Ancar Engenharia") {
  const [novaEmpresa] = await db.insert(empresa).values({ nome: nomeEmpresa }).returning();
  const [novoProjeto] = await db
    .insert(projeto)
    .values({ nome: "Casa da Praia", empresaId: novaEmpresa.id })
    .returning();
  return { empresa: novaEmpresa, projeto: novoProjeto };
}

describe("criarMemorialRascunho", () => {
  beforeEach(limparBanco);
  afterEach(limparBanco);

  it("cria com status rascunho e as respostas informadas", async () => {
    const { projeto: novoProjeto } = await criarProjetoDeTeste();

    const resultado = await criarMemorialRascunho({
      projetoId: novoProjeto.id,
      respostasFormularioJson: { tipoConstrucao: "residencial" },
    });

    expect(resultado.status).toBe("rascunho");
    expect(resultado.documentoGeradoUrl).toBeNull();
  });
});

describe("listarMemoriais", () => {
  beforeEach(limparBanco);
  afterEach(limparBanco);

  it("lista só os memoriais da empresa pedida, com o nome do projeto", async () => {
    const { empresa: empresaA, projeto: projetoA } = await criarProjetoDeTeste("Empresa A");
    const { projeto: projetoB } = await criarProjetoDeTeste("Empresa B");
    await criarMemorialRascunho({ projetoId: projetoA.id, respostasFormularioJson: {} });
    await criarMemorialRascunho({ projetoId: projetoB.id, respostasFormularioJson: {} });

    const resultado = await listarMemoriais(empresaA.id);

    expect(resultado).toHaveLength(1);
    expect(resultado[0].projetoNome).toBe("Casa da Praia");
  });

  it("retorna lista vazia quando a empresa não tem memoriais", async () => {
    const { empresa: novaEmpresa } = await criarProjetoDeTeste();

    const resultado = await listarMemoriais(novaEmpresa.id);

    expect(resultado).toEqual([]);
  });
});

describe("buscarMemorialDaEmpresa", () => {
  beforeEach(limparBanco);
  afterEach(limparBanco);

  it("retorna o memorial quando pertence à empresa", async () => {
    const { empresa: novaEmpresa, projeto: novoProjeto } = await criarProjetoDeTeste();
    const criado = await criarMemorialRascunho({ projetoId: novoProjeto.id, respostasFormularioJson: {} });

    const resultado = await buscarMemorialDaEmpresa(criado.id, novaEmpresa.id);

    expect(resultado?.id).toBe(criado.id);
  });

  it("retorna null quando o memorial é de outra empresa", async () => {
    const { projeto: projetoA } = await criarProjetoDeTeste("Empresa A");
    const { empresa: empresaB } = await criarProjetoDeTeste("Empresa B");
    const criado = await criarMemorialRascunho({ projetoId: projetoA.id, respostasFormularioJson: {} });

    const resultado = await buscarMemorialDaEmpresa(criado.id, empresaB.id);

    expect(resultado).toBeNull();
  });
});

describe("marcarComoGerado", () => {
  beforeEach(limparBanco);
  afterEach(limparBanco);

  it("atualiza status, documentoGeradoUrl e respostasFormularioJson", async () => {
    const { empresa: novaEmpresa, projeto: novoProjeto } = await criarProjetoDeTeste();
    const criado = await criarMemorialRascunho({ projetoId: novoProjeto.id, respostasFormularioJson: {} });

    await marcarComoGerado(criado.id, {
      documentoGeradoUrl: `/api/memoriais/${criado.id}/pdf`,
      respostasFormularioJson: { tipoConstrucao: "residencial" },
    });

    const resultado = await buscarMemorialDaEmpresa(criado.id, novaEmpresa.id);
    expect(resultado?.status).toBe("gerado");
    expect(resultado?.documentoGeradoUrl).toBe(`/api/memoriais/${criado.id}/pdf`);
  });

  it("atualiza audioUrl quando fornecido", async () => {
    const { empresa: novaEmpresa, projeto: novoProjeto } = await criarProjetoDeTeste();
    const criado = await criarMemorialRascunho({ projetoId: novoProjeto.id, respostasFormularioJson: {} });

    await marcarComoGerado(criado.id, {
      documentoGeradoUrl: `/api/memoriais/${criado.id}/pdf`,
      audioUrl: "https://storage.example.com/audio/memorial-123.mp3",
    });

    const resultado = await buscarMemorialDaEmpresa(criado.id, novaEmpresa.id);
    expect(resultado?.audioUrl).toBe("https://storage.example.com/audio/memorial-123.mp3");
  });

  it("preserva audioUrl ao omitir em chamada subsequente", async () => {
    const { empresa: novaEmpresa, projeto: novoProjeto } = await criarProjetoDeTeste();
    const criado = await criarMemorialRascunho({ projetoId: novoProjeto.id, respostasFormularioJson: {} });
    const audioUrl = "https://storage.example.com/audio/memorial-123.mp3";

    // Primeira chamada com audioUrl
    await marcarComoGerado(criado.id, {
      documentoGeradoUrl: `/api/memoriais/${criado.id}/pdf`,
      audioUrl,
    });

    // Segunda chamada sem audioUrl
    await marcarComoGerado(criado.id, {
      documentoGeradoUrl: `/api/memoriais/${criado.id}/pdf-v2`,
      respostasFormularioJson: { tipoConstrucao: "comercial" },
    });

    const resultado = await buscarMemorialDaEmpresa(criado.id, novaEmpresa.id);
    expect(resultado?.audioUrl).toBe(audioUrl);
    expect(resultado?.documentoGeradoUrl).toBe(`/api/memoriais/${criado.id}/pdf-v2`);
  });

  it("preserva respostasFormularioJson ao omitir em chamada subsequente", async () => {
    const { empresa: novaEmpresa, projeto: novoProjeto } = await criarProjetoDeTeste();
    const criado = await criarMemorialRascunho({ projetoId: novoProjeto.id, respostasFormularioJson: {} });
    const respostas = { tipoConstrucao: "residencial", metragem: 150 };

    // Primeira chamada com respostasFormularioJson
    await marcarComoGerado(criado.id, {
      documentoGeradoUrl: `/api/memoriais/${criado.id}/pdf`,
      respostasFormularioJson: respostas,
    });

    // Segunda chamada sem respostasFormularioJson
    await marcarComoGerado(criado.id, {
      documentoGeradoUrl: `/api/memoriais/${criado.id}/pdf-v2`,
      audioUrl: "https://storage.example.com/audio/memorial-123.mp3",
    });

    // Query directly to verify respostasFormularioJson was preserved
    const [rowFromDb] = await db
      .select()
      .from(memorialDescritivo)
      .where(eq(memorialDescritivo.id, criado.id));

    expect(rowFromDb.respostasFormularioJson).toEqual(respostas);
  });
});
