declare module "pdf-parse/lib/pdf-parse.js" {
  interface PdfParseResultado {
    text: string;
    numpages: number;
  }

  function pdfParse(dataBuffer: Uint8Array): Promise<PdfParseResultado>;

  export default pdfParse;
}
