import { randomUUID } from "node:crypto";

import { comuniqueSeRouter } from "@/core/llm";
import {
  criarComuniqueSePronto,
  criarComuniqueSeProcessando,
  marcarComoErro,
  marcarComoPronto,
  type ChecklistItem,
} from "@/db/queries/comunique-se";
import { extrairTextoPdf } from "./extrair-texto";
import { detectarModeloEmbutido } from "./modelo-detectar";
import { lerArquivo, salvarArquivo } from "./storage";
import { CriacaoParcialError } from "@/lib/erros/criacao-parcial";

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

type ResultadoProcessamento = { id: string; numero: number; status: string; pdfOriginalUrl: string | null };

const LIMITE_CARACTERES_TEXTO_PDF = 100_000;

async function finalizarProcessamento(id: string, pdfBuffer: Buffer): Promise<{ status: string }> {
  try {
    const textoBruto = await extrairTextoPdf(pdfBuffer);
    if (!textoBruto) {
      throw new Error("PDF sem texto extraível.");
    }
    const texto = textoBruto.slice(0, LIMITE_CARACTERES_TEXTO_PDF);

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
    throw new CriacaoParcialError(error instanceof Error ? error.message : "Erro ao processar.", id);
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

  const itensDetectados = await detectarModeloEmbutido(input.pdfBuffer);
  if (itensDetectados) {
    const itensComId: ChecklistItem[] = itensDetectados.map((item) => ({
      id: randomUUID(),
      descricao: item.descricao,
      concluida: item.concluida,
    }));
    await marcarComoPronto(id, itensComId);
    return { id, numero: criado.numero, status: "pronto", pdfOriginalUrl };
  }

  const resultado = await finalizarProcessamento(id, input.pdfBuffer);
  return { id, numero: criado.numero, status: resultado.status, pdfOriginalUrl };
}

export async function criarComuniqueSeManual(input: {
  projetoId: string;
  empresaId: string;
  itens: { descricao: string }[];
}): Promise<ResultadoProcessamento> {
  const id = randomUUID();
  const itensComId: ChecklistItem[] = input.itens.map((item) => ({
    id: randomUUID(),
    descricao: item.descricao,
    concluida: false,
  }));

  const criado = await criarComuniqueSePronto({
    id,
    projetoId: input.projetoId,
    empresaId: input.empresaId,
    itens: itensComId,
  });

  return { id, numero: criado.numero, status: "pronto", pdfOriginalUrl: null };
}

export async function reprocessarComuniqueSe(
  id: string,
  numero: number,
  pdfOriginalUrl: string | null,
): Promise<ResultadoProcessamento> {
  const pdfBuffer = await lerArquivo(`${id}.pdf`);
  const resultado = await finalizarProcessamento(id, pdfBuffer);
  return { id, numero, status: resultado.status, pdfOriginalUrl };
}
