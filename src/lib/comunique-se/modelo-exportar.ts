import { PDFDocument } from "pdf-lib";

import { gerarPdf } from "@/lib/memorial/pdf";
import type { ChecklistItem } from "@/db/queries/comunique-se";
import {
  FORMATO_MODELO_EXPORTADO,
  NOME_ARQUIVO_MODELO_EXPORTADO,
} from "@/lib/validations/comunique-se/modelo-exportado.schema";
import { gerarHtmlModelo } from "./modelo-html-template";

export async function gerarModeloExportado(dados: {
  referencia: string;
  projetoNome: string;
  itens: ChecklistItem[];
}): Promise<Buffer> {
  const html = gerarHtmlModelo({
    referencia: dados.referencia,
    projetoNome: dados.projetoNome,
    itens: dados.itens.map((item) => ({ descricao: item.descricao, concluida: item.concluida })),
  });

  const pdfBase = await gerarPdf(html);

  const payload = JSON.stringify({
    formato: FORMATO_MODELO_EXPORTADO,
    itens: dados.itens.map((item) => ({ descricao: item.descricao, concluida: item.concluida })),
  });

  const doc = await PDFDocument.load(pdfBase);
  await doc.attach(Buffer.from(payload, "utf8"), NOME_ARQUIVO_MODELO_EXPORTADO, {
    mimeType: "application/json",
    description: "Checklist estruturado do DocObra",
  });
  const bytesComAnexo = await doc.save();

  return Buffer.from(bytesComAnexo);
}
