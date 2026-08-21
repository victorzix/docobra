import { describe, expect, it } from "vitest";
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

import { gerarModeloExportado } from "../modelo-exportar";
import { FORMATO_MODELO_EXPORTADO, NOME_ARQUIVO_MODELO_EXPORTADO } from "@/lib/validations/comunique-se/modelo-exportado.schema";

async function lerAnexoDoPdf(pdfBuffer: Buffer): Promise<string | null> {
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
    return Buffer.from(decodePDFRawStream(stream).decode()).toString("utf8");
  }
  return null;
}

describe("gerarModeloExportado", () => {
  it("gera um PDF válido com o checklist anexado dentro", async () => {
    const pdfBuffer = await gerarModeloExportado({
      referencia: "CS-0001",
      projetoNome: "Casa da Praia",
      itens: [
        { id: "1", descricao: "Apresentar ART", concluida: true },
        { id: "2", descricao: "Apresentar laudo de sondagem", concluida: false },
      ],
    });

    expect(pdfBuffer.subarray(0, 5).toString()).toBe("%PDF-");

    const anexo = await lerAnexoDoPdf(pdfBuffer);
    expect(anexo).not.toBeNull();

    const conteudo = JSON.parse(anexo!);
    expect(conteudo).toEqual({
      formato: FORMATO_MODELO_EXPORTADO,
      itens: [
        { descricao: "Apresentar ART", concluida: true },
        { descricao: "Apresentar laudo de sondagem", concluida: false },
      ],
    });
  });
});
