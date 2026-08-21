import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rm } from "node:fs/promises";
import path from "node:path";
import puppeteer from "puppeteer";

import { db } from "@/db";
import { comuniqueSe, empresa, projeto } from "@/db/schema";

vi.mock("@/core/llm", () => ({
  comuniqueSeRouter: {
    extractStructured: vi.fn(),
  },
}));

import { comuniqueSeRouter } from "@/core/llm";
import { criarComuniqueSeManual, processarComuniqueSe, reprocessarComuniqueSe } from "../processar";
import { lerArquivo, salvarArquivo } from "../storage";
import { gerarModeloExportado } from "@/lib/comunique-se/modelo-exportar";
import { extrairTextoPdf } from "../extrair-texto";

const DIR_STORAGE = path.join(process.cwd(), process.env.COMUNIQUE_SE_STORAGE_DIR ?? "storage/comunique-se");

async function limparBanco() {
  await db.delete(comuniqueSe);
  await db.delete(projeto);
  await db.delete(empresa);
}

async function criarProjetoDeTeste() {
  const [novaEmpresa] = await db.insert(empresa).values({ nome: "Ancar Engenharia" }).returning();
  const [novoProjeto] = await db
    .insert(projeto)
    .values({ nome: "Casa da Praia", empresaId: novaEmpresa.id })
    .returning();
  return { empresa: novaEmpresa, projeto: novoProjeto };
}

// Testes deste arquivo usam PDFs REAIS gerados via Puppeteer (mesma abordagem
// da Task 1) — um buffer fake com só o prefixo "%PDF-" passa no magic-number
// mas o `pdf-parse` real, chamado dentro do pipeline, falharia ao tentar
// interpretar a estrutura interna de um PDF inválido.
async function gerarPdfDeTeste(html: string): Promise<Buffer> {
  const browser = await puppeteer.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    const pdf = await page.pdf({ format: "a4" });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

describe("processarComuniqueSe", () => {
  beforeEach(() => {
    vi.mocked(comuniqueSeRouter.extractStructured).mockReset();
  });

  afterEach(async () => {
    await limparBanco();
    await rm(DIR_STORAGE, { recursive: true, force: true });
  });

  it("processa com sucesso: extrai texto, chama o LLM e marca pronto", async () => {
    const { empresa: novaEmpresa, projeto: novoProjeto } = await criarProjetoDeTeste();
    const pdf = await gerarPdfDeTeste("<p>Exigencia numero um: apresentar ART.</p>");
    vi.mocked(comuniqueSeRouter.extractStructured).mockResolvedValue({
      data: { itens: [{ descricao: "Apresentar ART do responsável técnico" }] },
      provider: "fake",
      raw: {},
    });

    const resultado = await processarComuniqueSe({
      projetoId: novoProjeto.id,
      empresaId: novaEmpresa.id,
      pdfBuffer: pdf,
    });

    expect(resultado.status).toBe("pronto");
    expect(resultado.pdfOriginalUrl).toBe(`/api/comunique-se/${resultado.id}/pdf`);

    const [linha] = await db.select().from(comuniqueSe);
    expect(linha.status).toBe("pronto");
    expect(linha.checklistJson).toMatchObject({
      itens: [{ descricao: "Apresentar ART do responsável técnico", concluida: false }],
    });

    const arquivoSalvo = await lerArquivo(`${resultado.id}.pdf`);
    expect(arquivoSalvo.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("marca erro (mas mantém a linha e o PDF) quando o LLM falha", async () => {
    const { empresa: novaEmpresa, projeto: novoProjeto } = await criarProjetoDeTeste();
    const pdf = await gerarPdfDeTeste("<p>Exigencia numero um: apresentar ART.</p>");
    vi.mocked(comuniqueSeRouter.extractStructured).mockRejectedValue(new Error("LLM indisponível"));

    await expect(
      processarComuniqueSe({
        projetoId: novoProjeto.id,
        empresaId: novaEmpresa.id,
        pdfBuffer: pdf,
      }),
    ).rejects.toThrow("LLM indisponível");

    const [linha] = await db.select().from(comuniqueSe);
    expect(linha.status).toBe("erro");
    expect(linha.checklistJson).toBeNull();
  });

  it("marca erro sem chamar o LLM quando o PDF não tem texto extraível", async () => {
    const { empresa: novaEmpresa, projeto: novoProjeto } = await criarProjetoDeTeste();
    const pdf = await gerarPdfDeTeste("<html><body></body></html>");

    await expect(
      processarComuniqueSe({
        projetoId: novoProjeto.id,
        empresaId: novaEmpresa.id,
        pdfBuffer: pdf,
      }),
    ).rejects.toThrow("PDF sem texto extraível.");

    expect(comuniqueSeRouter.extractStructured).not.toHaveBeenCalled();
    const [linha] = await db.select().from(comuniqueSe);
    expect(linha.status).toBe("erro");
  });

  it("detecta um modelo DocObra embutido (gerado por gerarModeloExportado) e pula a extração/IA", async () => {
    const { empresa: novaEmpresa, projeto: novoProjeto } = await criarProjetoDeTeste();
    const pdfComModelo = await gerarModeloExportado({
      referencia: "CS-0001",
      projetoNome: "Casa da Praia",
      itens: [{ id: "1", descricao: "Apresentar ART", concluida: true }],
    });

    const resultado = await processarComuniqueSe({
      projetoId: novoProjeto.id,
      empresaId: novaEmpresa.id,
      pdfBuffer: pdfComModelo,
    });

    expect(resultado.status).toBe("pronto");
    expect(comuniqueSeRouter.extractStructured).not.toHaveBeenCalled();

    const [linha] = await db.select().from(comuniqueSe);
    expect(linha.checklistJson).toMatchObject({
      itens: [{ descricao: "Apresentar ART", concluida: true }],
    });
  });

  it("trunca o texto extraído em 100.000 caracteres antes de mandar pra IA", async () => {
    const { empresa: novaEmpresa, projeto: novoProjeto } = await criarProjetoDeTeste();
    // Uma única "palavra" gigante sem espaço não quebra linha nem gera páginas
    // extras no PDF (Chromium não pagina uma string ininterrupta) — usar
    // palavras separadas por espaço garante o texto grande de verdade, com
    // múltiplas páginas, que o teste precisa.
    const pdf = await gerarPdfDeTeste(`<p>${"palavra ".repeat(20_000)}</p>`);
    const textoCompleto = await extrairTextoPdf(pdf);
    expect(textoCompleto.length).toBeGreaterThan(100_000);

    vi.mocked(comuniqueSeRouter.extractStructured).mockResolvedValue({
      data: { itens: [{ descricao: "Item" }] },
      provider: "fake",
      raw: {},
    });

    await processarComuniqueSe({
      projetoId: novoProjeto.id,
      empresaId: novaEmpresa.id,
      pdfBuffer: pdf,
    });

    const chamada = vi.mocked(comuniqueSeRouter.extractStructured).mock.calls[0][0];
    expect(chamada.userPrompt.length).toBe(100_000);
    expect(chamada.userPrompt).toBe(textoCompleto.slice(0, 100_000));
  });
});

describe("reprocessarComuniqueSe", () => {
  beforeEach(() => {
    vi.mocked(comuniqueSeRouter.extractStructured).mockReset();
  });

  afterEach(async () => {
    await limparBanco();
    await rm(DIR_STORAGE, { recursive: true, force: true });
  });

  it("relê o PDF salvo em disco (sem receber buffer novo) e reprocessa com sucesso", async () => {
    const { empresa: novaEmpresa, projeto: novoProjeto } = await criarProjetoDeTeste();
    const pdf = await gerarPdfDeTeste("<p>Exigencia numero um: apresentar ART.</p>");
    vi.mocked(comuniqueSeRouter.extractStructured).mockRejectedValueOnce(new Error("primeira falha"));
    const primeiraTentativa = await processarComuniqueSe({
      projetoId: novoProjeto.id,
      empresaId: novaEmpresa.id,
      pdfBuffer: pdf,
    }).catch(() => null);
    expect(primeiraTentativa).toBeNull();

    const [linhaErro] = await db.select().from(comuniqueSe);
    expect(linhaErro.status).toBe("erro");

    vi.mocked(comuniqueSeRouter.extractStructured).mockResolvedValue({
      data: { itens: [{ descricao: "Apresentar ART" }] },
      provider: "fake",
      raw: {},
    });

    const resultado = await reprocessarComuniqueSe(linhaErro.id, linhaErro.numero, linhaErro.pdfOriginalUrl);

    expect(resultado.status).toBe("pronto");
  });
});

describe("criarComuniqueSeManual", () => {
  afterEach(limparBanco);

  it("cria já pronto, sem PDF, com os itens informados", async () => {
    const { empresa: novaEmpresa, projeto: novoProjeto } = await criarProjetoDeTeste();

    const resultado = await criarComuniqueSeManual({
      projetoId: novoProjeto.id,
      empresaId: novaEmpresa.id,
      itens: [{ descricao: "Apresentar ART" }, { descricao: "Apresentar laudo de sondagem" }],
    });

    expect(resultado.status).toBe("pronto");
    expect(resultado.pdfOriginalUrl).toBeNull();

    const [linha] = await db.select().from(comuniqueSe);
    expect(linha.checklistJson).toMatchObject({
      itens: [{ descricao: "Apresentar ART", concluida: false }, { descricao: "Apresentar laudo de sondagem", concluida: false }],
    });
  });
});
