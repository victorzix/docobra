import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rm } from "node:fs/promises";
import path from "node:path";

import { db } from "@/db";
import { empresa, memorialDescritivo, projeto } from "@/db/schema";

vi.mock("@/core/llm", () => ({
  memorialRouter: {
    transcribeAudio: vi.fn(),
    extractStructured: vi.fn(),
  },
}));

import { memorialRouter } from "@/core/llm";
import { gerarMemorial } from "../gerar";

async function limparBanco() {
  await db.delete(memorialDescritivo);
  await db.delete(projeto);
  await db.delete(empresa);
}

async function criarProjetoDeTeste() {
  const [novaEmpresa] = await db.insert(empresa).values({ nome: "Ancar Engenharia" }).returning();
  const [novoProjeto] = await db
    .insert(projeto)
    .values({ nome: "Casa da Praia", empresaId: novaEmpresa.id })
    .returning();
  return novoProjeto;
}

const CONTEXTO = {
  projetoNome: "Casa da Praia",
  projetoEndereco: null,
  empresaNome: "Ancar Engenharia",
  usuarioNome: "Victor",
};

const PROSA_FAKE = { descricaoGeral: "Descrição gerada.", especificacoesTecnicas: "Especificações geradas." };

describe("gerarMemorial", () => {
  beforeEach(async () => {
    await limparBanco();
    vi.mocked(memorialRouter.transcribeAudio).mockReset();
    vi.mocked(memorialRouter.extractStructured).mockReset();
  });

  afterEach(async () => {
    await limparBanco();
    await rm(path.join(process.cwd(), "storage", "memoriais"), { recursive: true, force: true });
  });

  it("modo texto: gera prosa via LLM e marca como gerado", async () => {
    const novoProjeto = await criarProjetoDeTeste();
    vi.mocked(memorialRouter.extractStructured).mockResolvedValue({ data: PROSA_FAKE, provider: "fake", raw: {} });

    const resultado = await gerarMemorial(
      {
        projetoId: novoProjeto.id,
        tipoConstrucao: "residencial",
        modoEspecificacoes: "texto",
        especificacoes: { fundacaoEstrutura: "Radier" },
      },
      { ...CONTEXTO, empresaId: novoProjeto.empresaId },
    );

    expect(resultado.status).toBe("gerado");
    expect(resultado.documentoGeradoUrl).toBe(`/api/memoriais/${resultado.id}/pdf`);
    expect(memorialRouter.transcribeAudio).not.toHaveBeenCalled();
    expect(memorialRouter.extractStructured).toHaveBeenCalledOnce();

    const [linha] = await db.select().from(memorialDescritivo);
    expect(linha.status).toBe("gerado");

    const prosaCall = vi.mocked(memorialRouter.extractStructured).mock.calls[0][0];
    expect(prosaCall.userPrompt).not.toContain(novoProjeto.id);
    expect(prosaCall.userPrompt).toContain("Casa da Praia");
  });

  it("modo áudio: transcreve, extrai as especificações e depois gera a prosa", async () => {
    const novoProjeto = await criarProjetoDeTeste();
    vi.mocked(memorialRouter.transcribeAudio).mockResolvedValue(
      "fundação é radier, estrutura em concreto armado",
    );
    vi.mocked(memorialRouter.extractStructured)
      .mockResolvedValueOnce({
        data: { fundacaoEstrutura: "Radier, concreto armado" },
        provider: "fake",
        raw: {},
      })
      .mockResolvedValueOnce({ data: PROSA_FAKE, provider: "fake", raw: {} });

    const audioBase64 = Buffer.from("audio-fake").toString("base64");

    const resultado = await gerarMemorial(
      {
        projetoId: novoProjeto.id,
        tipoConstrucao: "residencial",
        modoEspecificacoes: "audio",
        audioBase64,
        audioMimeType: "audio/webm",
      },
      { ...CONTEXTO, empresaId: novoProjeto.empresaId },
    );

    expect(resultado.status).toBe("gerado");
    expect(memorialRouter.transcribeAudio).toHaveBeenCalledOnce();
    expect(memorialRouter.extractStructured).toHaveBeenCalledTimes(2);

    const [linha] = await db.select().from(memorialDescritivo);
    expect(linha.audioUrl).toContain(`${resultado.id}-audio`);
    expect(linha.respostasFormularioJson).toMatchObject({
      especificacoes: { fundacaoEstrutura: "Radier, concreto armado" },
    });
    expect(linha.respostasFormularioJson).not.toHaveProperty("audioBase64");
    expect(JSON.stringify(linha.respostasFormularioJson)).not.toContain(audioBase64);

    const prosaCall = vi.mocked(memorialRouter.extractStructured).mock.calls[1][0];
    expect(prosaCall.userPrompt).not.toContain(audioBase64);
    expect(prosaCall.userPrompt).not.toContain(novoProjeto.id);
    expect(prosaCall.userPrompt).toContain("Casa da Praia");
  });

  it("propaga o erro e deixa o registro em rascunho quando o LLM falha", async () => {
    const novoProjeto = await criarProjetoDeTeste();
    vi.mocked(memorialRouter.extractStructured).mockRejectedValue(new Error("LLM indisponível"));

    await expect(
      gerarMemorial(
        { projetoId: novoProjeto.id, tipoConstrucao: "residencial", modoEspecificacoes: "texto" },
        { ...CONTEXTO, empresaId: novoProjeto.empresaId },
      ),
    ).rejects.toThrow("LLM indisponível");

    const [linha] = await db.select().from(memorialDescritivo);
    expect(linha.status).toBe("rascunho");
    expect(linha.documentoGeradoUrl).toBeNull();
  });
});
