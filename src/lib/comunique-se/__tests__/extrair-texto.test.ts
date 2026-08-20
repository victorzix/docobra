import { describe, expect, it } from "vitest";
import puppeteer from "puppeteer";

import { extrairTextoPdf } from "../extrair-texto";

async function gerarPdfDeTeste(html: string): Promise<Buffer> {
  const browser = await puppeteer.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    const pdf = await page.pdf({ format: "a4" });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

describe("extrairTextoPdf", () => {
  it("extrai o texto de um PDF real com conteúdo", async () => {
    const pdf = await gerarPdfDeTeste("<p>Exigencia numero um: apresentar ART.</p>");

    const texto = await extrairTextoPdf(pdf);

    expect(texto).toContain("Exigencia numero um: apresentar ART.");
  });

  it("retorna string vazia (ou só espaços) pra PDF sem texto", async () => {
    const pdf = await gerarPdfDeTeste("<html><body></body></html>");

    const texto = await extrairTextoPdf(pdf);

    expect(texto.trim()).toBe("");
  });
});
