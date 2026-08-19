import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DIR_STORAGE = path.join(process.cwd(), process.env.MEMORIAL_STORAGE_DIR ?? "storage/memoriais");

export async function salvarArquivo(nomeArquivo: string, conteudo: Buffer): Promise<string> {
  await mkdir(DIR_STORAGE, { recursive: true });
  const caminho = path.join(DIR_STORAGE, nomeArquivo);
  await writeFile(caminho, conteudo);
  return caminho;
}

export async function lerArquivo(nomeArquivo: string): Promise<Buffer> {
  return readFile(path.join(DIR_STORAGE, nomeArquivo));
}
