import pdfParse from "pdf-parse/lib/pdf-parse.js";

export async function extrairTextoPdf(buffer: Buffer): Promise<string> {
  // Small Node Buffers can be carved from Node's internal buffer pool with a nonzero
  // `byteOffset` into a larger shared `ArrayBuffer`. The vendored pdf.js inside
  // `pdf-parse` doesn't respect that offset, corrupting the parse for small PDFs.
  // `new Uint8Array(buffer)` (the copying-constructor form) forces a byteOffset-0 copy
  // sized exactly to the buffer's own length, avoiding that class of bug.
  const data = new Uint8Array(buffer);
  const resultado = await pdfParse(data);
  return resultado.text.trim();
}
