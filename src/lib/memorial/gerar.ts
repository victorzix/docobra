import { memorialRouter } from "@/core/llm";
import { criarMemorialRascunho, marcarComoGerado } from "@/db/queries/memorial";
import type { CriarMemorialInput } from "@/lib/validations/memorial/create.schema";
import { referenciaMemorial } from "@/lib/referencia";
import { gerarHtmlMemorial } from "./html-template";
import { gerarPdf } from "./pdf";
import { salvarArquivo } from "./storage";

const SCHEMA_ESPECIFICACOES = {
  type: "object",
  properties: {
    fundacaoEstrutura: { type: "string" },
    alvenariaCobertura: { type: "string" },
    instalacoes: { type: "string" },
    acabamentos: { type: "string" },
  },
};

const SCHEMA_PROSA = {
  type: "object",
  properties: {
    descricaoGeral: { type: "string" },
    especificacoesTecnicas: { type: "string" },
  },
  required: ["descricaoGeral", "especificacoesTecnicas"],
};

export interface ContextoMemorial {
  empresaId: string;
  projetoNome: string;
  projetoEndereco: string | null;
  empresaNome: string;
  usuarioNome: string;
}

interface EspecificacoesTecnicas {
  fundacaoEstrutura?: string;
  alvenariaCobertura?: string;
  instalacoes?: string;
  acabamentos?: string;
}

function respostasSemAudio(input: CriarMemorialInput, especificacoes: EspecificacoesTecnicas) {
  if (input.modoEspecificacoes === "audio") {
    const { audioBase64, ...resto } = input;
    return { ...resto, especificacoes };
  }
  return { ...input, especificacoes };
}

export async function gerarMemorial(
  input: CriarMemorialInput,
  contexto: ContextoMemorial,
): Promise<{ id: string; numero: number; status: string; documentoGeradoUrl: string | null }> {
  let especificacoes: EspecificacoesTecnicas =
    input.modoEspecificacoes === "texto" ? (input.especificacoes ?? {}) : {};

  const rascunho = await criarMemorialRascunho({
    projetoId: input.projetoId,
    empresaId: contexto.empresaId,
    respostasFormularioJson: respostasSemAudio(input, especificacoes),
  });

  let audioUrl: string | undefined;

  if (input.modoEspecificacoes === "audio") {
    const audioBuffer = Buffer.from(input.audioBase64, "base64");
    const transcricao = await memorialRouter.transcribeAudio(audioBuffer, input.audioMimeType);
    const extracao = await memorialRouter.extractStructured<EspecificacoesTecnicas>({
      userPrompt: transcricao,
      schema: SCHEMA_ESPECIFICACOES,
    });
    especificacoes = extracao.data;
    audioUrl = await salvarArquivo(`${rascunho.id}-audio`, audioBuffer);
  }

  const dadosParaProsa = {
    projeto: contexto.projetoNome,
    endereco: contexto.projetoEndereco ?? undefined,
    tipoConstrucao: input.tipoConstrucao,
    numeroPavimentos: input.numeroPavimentos,
    areaConstruida: input.areaConstruida,
    areaTerreno: input.areaTerreno,
    especificacoes,
  };

  const prosa = await memorialRouter.extractStructured<{
    descricaoGeral: string;
    especificacoesTecnicas: string;
  }>({
    systemPrompt:
      "Você é um engenheiro redigindo um memorial descritivo técnico em português formal, seguindo a norma ABNT. " +
      "Refira-se ao projeto pelo nome informado — nunca inclua identificadores técnicos (IDs, UUIDs) no texto.",
    userPrompt: JSON.stringify(dadosParaProsa),
    schema: SCHEMA_PROSA,
  });

  const html = gerarHtmlMemorial({
    referencia: referenciaMemorial(rascunho.numero),
    projetoNome: contexto.projetoNome,
    projetoEndereco: contexto.projetoEndereco,
    empresaNome: contexto.empresaNome,
    usuarioNome: contexto.usuarioNome,
    tipoConstrucao: input.tipoConstrucao,
    numeroPavimentos: input.numeroPavimentos,
    areaConstruida: input.areaConstruida,
    areaTerreno: input.areaTerreno,
    descricaoGeral: prosa.data.descricaoGeral,
    especificacoesTecnicas: prosa.data.especificacoesTecnicas,
  });

  const pdfBuffer = await gerarPdf(html);
  await salvarArquivo(`${rascunho.id}.pdf`, pdfBuffer);
  const documentoGeradoUrl = `/api/memoriais/${rascunho.id}/pdf`;

  await marcarComoGerado(rascunho.id, {
    documentoGeradoUrl,
    audioUrl,
    respostasFormularioJson: respostasSemAudio(input, especificacoes),
  });

  return { id: rascunho.id, numero: rascunho.numero, status: "gerado", documentoGeradoUrl };
}
