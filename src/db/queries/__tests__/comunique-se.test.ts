import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { db } from "@/db";
import { comuniqueSe, empresa, projeto } from "@/db/schema";
import {
  adicionarItemChecklist,
  atualizarItemChecklist,
  buscarComuniqueSeDaEmpresa,
  criarComuniqueSeProcessando,
  criarComuniqueSePronto,
  listarComuniqueSe,
  marcarComoErro,
  marcarComoPronto,
  removerItemChecklist,
} from "../comunique-se";

async function limparBanco() {
  await db.delete(comuniqueSe);
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

describe("criarComuniqueSeProcessando", () => {
  beforeEach(limparBanco);
  afterEach(limparBanco);

  it("cria com status processando e o pdfOriginalUrl informado", async () => {
    const { empresa: novaEmpresa, projeto: novoProjeto } = await criarProjetoDeTeste();
    const id = randomUUID();

    const resultado = await criarComuniqueSeProcessando({
      id,
      projetoId: novoProjeto.id,
      empresaId: novaEmpresa.id,
      pdfOriginalUrl: `/api/comunique-se/${id}/pdf`,
    });

    expect(resultado.id).toBe(id);
    expect(resultado.status).toBe("processando");
    expect(resultado.pdfOriginalUrl).toBe(`/api/comunique-se/${id}/pdf`);
    expect(resultado.checklistJson).toBeNull();
  });
});

describe("listarComuniqueSe", () => {
  beforeEach(limparBanco);
  afterEach(limparBanco);

  it("lista só os Comunique-se da empresa pedida, com o nome do projeto", async () => {
    const { empresa: empresaA, projeto: projetoA } = await criarProjetoDeTeste("Empresa A");
    const { projeto: projetoB } = await criarProjetoDeTeste("Empresa B");
    await criarComuniqueSeProcessando({
      id: randomUUID(),
      projetoId: projetoA.id,
      empresaId: empresaA.id,
      pdfOriginalUrl: "/x",
    });
    await criarComuniqueSeProcessando({
      id: randomUUID(),
      projetoId: projetoB.id,
      empresaId: projetoB.empresaId,
      pdfOriginalUrl: "/y",
    });

    const resultado = await listarComuniqueSe(empresaA.id);

    expect(resultado).toHaveLength(1);
    expect(resultado[0].projetoNome).toBe("Casa da Praia");
  });

  it("retorna lista vazia quando a empresa não tem Comunique-se", async () => {
    const { empresa: novaEmpresa } = await criarProjetoDeTeste();

    const resultado = await listarComuniqueSe(novaEmpresa.id);

    expect(resultado).toEqual([]);
  });
});

describe("buscarComuniqueSeDaEmpresa", () => {
  beforeEach(limparBanco);
  afterEach(limparBanco);

  it("retorna o Comunique-se quando pertence à empresa", async () => {
    const { empresa: novaEmpresa, projeto: novoProjeto } = await criarProjetoDeTeste();
    const id = randomUUID();
    await criarComuniqueSeProcessando({ id, projetoId: novoProjeto.id, empresaId: novaEmpresa.id, pdfOriginalUrl: "/x" });

    const resultado = await buscarComuniqueSeDaEmpresa(id, novaEmpresa.id);

    expect(resultado?.id).toBe(id);
  });

  it("retorna null quando o Comunique-se é de outra empresa", async () => {
    const { projeto: projetoA } = await criarProjetoDeTeste("Empresa A");
    const { empresa: empresaB } = await criarProjetoDeTeste("Empresa B");
    const id = randomUUID();
    await criarComuniqueSeProcessando({ id, projetoId: projetoA.id, empresaId: projetoA.empresaId, pdfOriginalUrl: "/x" });

    const resultado = await buscarComuniqueSeDaEmpresa(id, empresaB.id);

    expect(resultado).toBeNull();
  });
});

describe("marcarComoPronto / marcarComoErro", () => {
  beforeEach(limparBanco);
  afterEach(limparBanco);

  it("marcarComoPronto atualiza status e checklistJson", async () => {
    const { empresa: novaEmpresa, projeto: novoProjeto } = await criarProjetoDeTeste();
    const id = randomUUID();
    await criarComuniqueSeProcessando({ id, projetoId: novoProjeto.id, empresaId: novaEmpresa.id, pdfOriginalUrl: "/x" });
    const itens = [{ id: randomUUID(), descricao: "Apresentar ART", concluida: false }];

    await marcarComoPronto(id, itens);

    const resultado = await buscarComuniqueSeDaEmpresa(id, novaEmpresa.id);
    expect(resultado?.status).toBe("pronto");
    expect(resultado?.checklistJson?.itens).toEqual(itens);
  });

  it("marcarComoErro atualiza status pra erro sem mexer no checklistJson", async () => {
    const { empresa: novaEmpresa, projeto: novoProjeto } = await criarProjetoDeTeste();
    const id = randomUUID();
    await criarComuniqueSeProcessando({ id, projetoId: novoProjeto.id, empresaId: novaEmpresa.id, pdfOriginalUrl: "/x" });

    await marcarComoErro(id);

    const resultado = await buscarComuniqueSeDaEmpresa(id, novaEmpresa.id);
    expect(resultado?.status).toBe("erro");
    expect(resultado?.checklistJson).toBeNull();
  });
});

describe("atualizarItemChecklist", () => {
  beforeEach(limparBanco);
  afterEach(limparBanco);

  it("alterna concluida de um item existente e retorna a lista atualizada", async () => {
    const { empresa: novaEmpresa, projeto: novoProjeto } = await criarProjetoDeTeste();
    const id = randomUUID();
    await criarComuniqueSeProcessando({ id, projetoId: novoProjeto.id, empresaId: novaEmpresa.id, pdfOriginalUrl: "/x" });
    const itemId = randomUUID();
    await marcarComoPronto(id, [{ id: itemId, descricao: "Apresentar ART", concluida: false }]);

    const resultado = await atualizarItemChecklist(id, itemId, { concluida: true });

    expect(resultado).toEqual([{ id: itemId, descricao: "Apresentar ART", concluida: true }]);
  });

  it("retorna null quando o itemId não existe no checklist", async () => {
    const { empresa: novaEmpresa, projeto: novoProjeto } = await criarProjetoDeTeste();
    const id = randomUUID();
    await criarComuniqueSeProcessando({ id, projetoId: novoProjeto.id, empresaId: novaEmpresa.id, pdfOriginalUrl: "/x" });
    await marcarComoPronto(id, [{ id: randomUUID(), descricao: "Apresentar ART", concluida: false }]);

    const resultado = await atualizarItemChecklist(id, "item-inexistente", { concluida: true });

    expect(resultado).toBeNull();
  });

  it("retorna null quando o Comunique-se ainda não tem checklist (status processando)", async () => {
    const { empresa: novaEmpresa, projeto: novoProjeto } = await criarProjetoDeTeste();
    const id = randomUUID();
    await criarComuniqueSeProcessando({ id, projetoId: novoProjeto.id, empresaId: novaEmpresa.id, pdfOriginalUrl: "/x" });

    const resultado = await atualizarItemChecklist(id, "qualquer-id", { concluida: true });

    expect(resultado).toBeNull();
  });
});

describe("atualizarItemChecklist com descricao", () => {
  beforeEach(limparBanco);
  afterEach(limparBanco);

  it("edita só o texto, mantendo concluida como estava", async () => {
    const { empresa: novaEmpresa, projeto: novoProjeto } = await criarProjetoDeTeste();
    const id = randomUUID();
    await criarComuniqueSeProcessando({ id, projetoId: novoProjeto.id, empresaId: novaEmpresa.id, pdfOriginalUrl: "/x" });
    const itemId = randomUUID();
    await marcarComoPronto(id, [{ id: itemId, descricao: "Texto original", concluida: true }]);

    const resultado = await atualizarItemChecklist(id, itemId, { descricao: "Texto corrigido" });

    expect(resultado).toEqual([{ id: itemId, descricao: "Texto corrigido", concluida: true }]);
  });
});

describe("adicionarItemChecklist", () => {
  beforeEach(limparBanco);
  afterEach(limparBanco);

  it("adiciona um item novo no fim da lista", async () => {
    const { empresa: novaEmpresa, projeto: novoProjeto } = await criarProjetoDeTeste();
    const id = randomUUID();
    await criarComuniqueSeProcessando({ id, projetoId: novoProjeto.id, empresaId: novaEmpresa.id, pdfOriginalUrl: "/x" });
    await marcarComoPronto(id, [{ id: randomUUID(), descricao: "Item 1", concluida: false }]);

    const resultado = await adicionarItemChecklist(id, "Item 2");

    expect(resultado).toHaveLength(2);
    expect(resultado?.[1].descricao).toBe("Item 2");
    expect(resultado?.[1].concluida).toBe(false);
  });

  it("retorna null quando o Comunique-se ainda não tem checklist", async () => {
    const { empresa: novaEmpresa, projeto: novoProjeto } = await criarProjetoDeTeste();
    const id = randomUUID();
    await criarComuniqueSeProcessando({ id, projetoId: novoProjeto.id, empresaId: novaEmpresa.id, pdfOriginalUrl: "/x" });

    const resultado = await adicionarItemChecklist(id, "Item novo");

    expect(resultado).toBeNull();
  });
});

describe("removerItemChecklist", () => {
  beforeEach(limparBanco);
  afterEach(limparBanco);

  it("remove o item pedido e mantém o resto", async () => {
    const { empresa: novaEmpresa, projeto: novoProjeto } = await criarProjetoDeTeste();
    const id = randomUUID();
    await criarComuniqueSeProcessando({ id, projetoId: novoProjeto.id, empresaId: novaEmpresa.id, pdfOriginalUrl: "/x" });
    const itemId1 = randomUUID();
    const itemId2 = randomUUID();
    await marcarComoPronto(id, [
      { id: itemId1, descricao: "Item 1", concluida: false },
      { id: itemId2, descricao: "Item 2", concluida: false },
    ]);

    const resultado = await removerItemChecklist(id, itemId1);

    expect(resultado).toEqual([{ id: itemId2, descricao: "Item 2", concluida: false }]);
  });

  it("permite esvaziar a lista removendo o último item", async () => {
    const { empresa: novaEmpresa, projeto: novoProjeto } = await criarProjetoDeTeste();
    const id = randomUUID();
    await criarComuniqueSeProcessando({ id, projetoId: novoProjeto.id, empresaId: novaEmpresa.id, pdfOriginalUrl: "/x" });
    const itemId = randomUUID();
    await marcarComoPronto(id, [{ id: itemId, descricao: "Único item", concluida: false }]);

    const resultado = await removerItemChecklist(id, itemId);

    expect(resultado).toEqual([]);
  });

  it("retorna null quando o itemId não existe", async () => {
    const { empresa: novaEmpresa, projeto: novoProjeto } = await criarProjetoDeTeste();
    const id = randomUUID();
    await criarComuniqueSeProcessando({ id, projetoId: novoProjeto.id, empresaId: novaEmpresa.id, pdfOriginalUrl: "/x" });
    await marcarComoPronto(id, [{ id: randomUUID(), descricao: "Item 1", concluida: false }]);

    const resultado = await removerItemChecklist(id, "item-inexistente");

    expect(resultado).toBeNull();
  });
});

describe("criarComuniqueSePronto", () => {
  beforeEach(limparBanco);
  afterEach(limparBanco);

  it("cria já com status pronto, sem pdfOriginalUrl e com os itens informados", async () => {
    const { empresa: novaEmpresa, projeto: novoProjeto } = await criarProjetoDeTeste();
    const id = randomUUID();
    const itens = [{ id: randomUUID(), descricao: "Apresentar ART", concluida: false }];

    const resultado = await criarComuniqueSePronto({ id, projetoId: novoProjeto.id, empresaId: novaEmpresa.id, itens });

    expect(resultado.id).toBe(id);
    expect(resultado.status).toBe("pronto");
    expect(resultado.pdfOriginalUrl).toBeNull();
    expect(resultado.checklistJson?.itens).toEqual(itens);
  });
});

describe("pdfOriginalUrl nullable", () => {
  beforeEach(limparBanco);
  afterEach(limparBanco);

  it("aceita inserir um Comunique-se sem pdfOriginalUrl (null)", async () => {
    const { projeto: novoProjeto } = await criarProjetoDeTeste();

    const [criado] = await db
      .insert(comuniqueSe)
      .values({ projetoId: novoProjeto.id, numero: 1, status: "pronto", pdfOriginalUrl: null })
      .returning();

    expect(criado.pdfOriginalUrl).toBeNull();
  });
});
