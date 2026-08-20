import pdfParse from "pdf-parse/lib/pdf-parse.js";

export async function extrairTextoPdf(buffer: Buffer): Promise<string> {
  const data = new Uint8Array(buffer);
  const resultado = await pdfParse(data);
  return resultado.text.trim();
}
