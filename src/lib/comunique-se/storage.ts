import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DIR_STORAGE = path.join(process.cwd(), process.env.COMUNIQUE_SE_STORAGE_DIR ?? "storage/comunique-se");

export const TAMANHO_MAXIMO_PDF_BYTES = 10 * 1024 * 1024;

export async function salvarArquivo(nomeArquivo: string, conteudo: Buffer): Promise<string> {
  await mkdir(DIR_STORAGE, { recursive: true });
  const caminho = path.join(DIR_STORAGE, nomeArquivo);
  await writeFile(caminho, conteudo);
  return caminho;
}

export async function lerArquivo(nomeArquivo: string): Promise<Buffer> {
  return readFile(path.join(DIR_STORAGE, nomeArquivo));
}

export function ehPdfValido(buffer: Buffer): boolean {
  return buffer.subarray(0, 5).toString("ascii") === "%PDF-";
}
