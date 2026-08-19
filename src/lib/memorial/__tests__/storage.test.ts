import { afterEach, describe, expect, it } from "vitest";
import { rm } from "node:fs/promises";
import path from "node:path";

import { lerArquivo, salvarArquivo } from "../storage";

const DIR_STORAGE = path.join(process.cwd(), process.env.MEMORIAL_STORAGE_DIR ?? "storage/memoriais");

describe("salvarArquivo / lerArquivo", () => {
  afterEach(async () => {
    await rm(DIR_STORAGE, { recursive: true, force: true });
  });

  it("salva e lê o mesmo conteúdo de volta", async () => {
    await salvarArquivo("teste.txt", Buffer.from("conteúdo de teste"));

    const lido = await lerArquivo("teste.txt");

    expect(lido.toString()).toBe("conteúdo de teste");
  });

  it("cria o diretório de storage se ele não existir ainda", async () => {
    const caminho = await salvarArquivo("outro-teste.txt", Buffer.from("x"));

    expect(caminho).toContain(path.join("storage", "memoriais"));
  });
});
