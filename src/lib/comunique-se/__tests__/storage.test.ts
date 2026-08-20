import { afterEach, describe, expect, it } from "vitest";
import { rm } from "node:fs/promises";
import path from "node:path";

import { ehPdfValido, lerArquivo, salvarArquivo, TAMANHO_MAXIMO_PDF_BYTES } from "../storage";

const DIR_STORAGE = path.join(process.cwd(), "storage", "comunique-se");

describe("salvarArquivo / lerArquivo", () => {
  afterEach(async () => {
    await rm(DIR_STORAGE, { recursive: true, force: true });
  });

  it("salva e lê o mesmo conteúdo de volta", async () => {
    await salvarArquivo("teste.pdf", Buffer.from("%PDF-fake"));

    const lido = await lerArquivo("teste.pdf");

    expect(lido.toString()).toBe("%PDF-fake");
  });

  it("cria o diretório de storage se ele não existir ainda", async () => {
    const caminho = await salvarArquivo("outro-teste.pdf", Buffer.from("x"));

    expect(caminho).toContain(path.join("storage", "comunique-se"));
  });
});

describe("ehPdfValido", () => {
  it("aceita buffer que começa com o magic number %PDF-", () => {
    expect(ehPdfValido(Buffer.from("%PDF-1.4 resto do arquivo"))).toBe(true);
  });

  it("rejeita buffer que não é PDF", () => {
    expect(ehPdfValido(Buffer.from("não é pdf"))).toBe(false);
  });
});

describe("TAMANHO_MAXIMO_PDF_BYTES", () => {
  it("é 10MB", () => {
    expect(TAMANHO_MAXIMO_PDF_BYTES).toBe(10 * 1024 * 1024);
  });
});
