import { describe, expect, it } from "vitest";
import puppeteer from "puppeteer";
import { PDFDocument } from "pdf-lib";

import { detectarModeloEmbutido } from "../modelo-detectar";
import { FORMATO_MODELO_EXPORTADO, NOME_ARQUIVO_MODELO_EXPORTADO } from "@/lib/validations/comunique-se/modelo-exportado.schema";

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

async function anexarPayload(pdfBuffer: Buffer, payload: string): Promise<Buffer> {
  const doc = await PDFDocument.load(pdfBuffer);
  await doc.attach(Buffer.from(payload, "utf8"), NOME_ARQUIVO_MODELO_EXPORTADO, { mimeType: "application/json" });
  return Buffer.from(await doc.save());
}

describe("detectarModeloEmbutido", () => {
  it("retorna os itens quando o PDF tem um anexo válido do DocObra", async () => {
    const pdfBase = await gerarPdfDeTeste("<h1>Checklist</h1>");
    const payload = JSON.stringify({
      formato: FORMATO_MODELO_EXPORTADO,
      itens: [{ descricao: "Apresentar ART", concluida: true }],
    });
    const pdfComAnexo = await anexarPayload(pdfBase, payload);

    const resultado = await detectarModeloEmbutido(pdfComAnexo);

    expect(resultado).toEqual([{ descricao: "Apresentar ART", concluida: true }]);
  });

  it("retorna null quando o PDF não tem anexo nenhum", async () => {
    const pdfSemAnexo = await gerarPdfDeTeste("<h1>PDF qualquer, sem anexo</h1>");

    const resultado = await detectarModeloEmbutido(pdfSemAnexo);

    expect(resultado).toBeNull();
  });

  it("retorna null quando o anexo existe mas o conteúdo não bate com o schema esperado", async () => {
    const pdfBase = await gerarPdfDeTeste("<h1>Checklist</h1>");
    const pdfComAnexoInvalido = await anexarPayload(pdfBase, JSON.stringify({ qualquerCoisa: true }));

    const resultado = await detectarModeloEmbutido(pdfComAnexoInvalido);

    expect(resultado).toBeNull();
  });

  it("retorna null quando o anexo não é JSON válido", async () => {
    const pdfBase = await gerarPdfDeTeste("<h1>Checklist</h1>");
    const pdfComAnexoQuebrado = await anexarPayload(pdfBase, "isso não é json{{{");

    const resultado = await detectarModeloEmbutido(pdfComAnexoQuebrado);

    expect(resultado).toBeNull();
  });
});
