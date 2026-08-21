import {
  PDFDocument,
  PDFName,
  PDFDict,
  PDFArray,
  PDFStream,
  PDFString,
  PDFHexString,
  decodePDFRawStream,
  type PDFRawStream,
} from "pdf-lib";

import { modeloExportadoSchema, NOME_ARQUIVO_MODELO_EXPORTADO } from "@/lib/validations/comunique-se/modelo-exportado.schema";

export async function detectarModeloEmbutido(
  pdfBuffer: Buffer,
): Promise<{ descricao: string; concluida: boolean }[] | null> {
  try {
    const doc = await PDFDocument.load(pdfBuffer);

    const namesDict = doc.catalog.lookupMaybe(PDFName.of("Names"), PDFDict);
    if (!namesDict) return null;

    const efDict = namesDict.lookupMaybe(PDFName.of("EmbeddedFiles"), PDFDict);
    if (!efDict) return null;

    const namesArray = efDict.lookupMaybe(PDFName.of("Names"), PDFArray);
    if (!namesArray) return null;

    const arr = namesArray.asArray();
    for (let i = 0; i < arr.length; i += 2) {
      const nome = arr[i] as PDFString | PDFHexString;
      if (nome.decodeText() !== NOME_ARQUIVO_MODELO_EXPORTADO) continue;

      const fileSpec = doc.context.lookup(arr[i + 1], PDFDict);
      const efFileDict = fileSpec.lookup(PDFName.of("EF"), PDFDict);
      const stream = doc.context.lookup(efFileDict.get(PDFName.of("F")), PDFStream) as PDFRawStream;
      const conteudo = Buffer.from(decodePDFRawStream(stream).decode()).toString("utf8");

      const json = JSON.parse(conteudo);
      const parsed = modeloExportadoSchema.safeParse(json);
      if (!parsed.success) return null;

      return parsed.data.itens;
    }

    return null;
  } catch {
    return null;
  }
}
