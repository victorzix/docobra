import { randomUUID } from "node:crypto";

import { comuniqueSeRouter } from "@/core/llm";
import {
  criarComuniqueSeProcessando,
  marcarComoErro,
  marcarComoPronto,
  type ChecklistItem,
} from "@/db/queries/comunique-se";
import { extrairTextoPdf } from "./extrair-texto";
import { lerArquivo, salvarArquivo } from "./storage";

const SCHEMA_CHECKLIST = {
  type: "object",
  properties: {
    itens: {
      type: "array",
      items: {
        type: "object",
        properties: { descricao: { type: "string" } },
        required: ["descricao"],
      },
    },
  },
  required: ["itens"],
};

type ResultadoProcessamento = { id: string; numero: number; status: string; pdfOriginalUrl: string };

async function finalizarProcessamento(id: string, pdfBuffer: Buffer): Promise<{ status: string }> {
  try {
    const texto = await extrairTextoPdf(pdfBuffer);
    if (!texto) {
      throw new Error("PDF sem texto extraível.");
    }

    const resultado = await comuniqueSeRouter.extractStructured<{ itens: { descricao: string }[] }>({
      systemPrompt:
        "Você traduz exigências de um documento 'Comunique-se' da prefeitura em uma lista de tarefas " +
        "objetivas, em linguagem simples, para um engenheiro ou arquiteto entender o que precisa ser feito.",
      userPrompt: texto,
      schema: SCHEMA_CHECKLIST,
    });

    const itens: ChecklistItem[] = resultado.data.itens.map((item) => ({
      id: randomUUID(),
      descricao: item.descricao,
      concluida: false,
    }));

    await marcarComoPronto(id, itens);
    return { status: "pronto" };
  } catch (error) {
    await marcarComoErro(id);
    throw error;
  }
}

export async function processarComuniqueSe(input: {
  projetoId: string;
  empresaId: string;
  pdfBuffer: Buffer;
}): Promise<ResultadoProcessamento> {
  const id = randomUUID();
  const pdfOriginalUrl = `/api/comunique-se/${id}/pdf`;

  await salvarArquivo(`${id}.pdf`, input.pdfBuffer);
  const criado = await criarComuniqueSeProcessando({
    id,
    projetoId: input.projetoId,
    empresaId: input.empresaId,
    pdfOriginalUrl,
  });

  const resultado = await finalizarProcessamento(id, input.pdfBuffer);

  return { id, numero: criado.numero, status: resultado.status, pdfOriginalUrl };
}

export async function reprocessarComuniqueSe(
  id: string,
  numero: number,
  pdfOriginalUrl: string,
): Promise<ResultadoProcessamento> {
  const pdfBuffer = await lerArquivo(`${id}.pdf`);
  const resultado = await finalizarProcessamento(id, pdfBuffer);
  return { id, numero, status: resultado.status, pdfOriginalUrl };
}
