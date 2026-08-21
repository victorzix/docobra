import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rm } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { empresa, memorialDescritivo, projeto } from "@/db/schema";
import { CriacaoParcialError } from "@/lib/erros/criacao-parcial";

vi.mock("@/core/llm", () => ({
  memorialRouter: {
    transcribeAudio: vi.fn(),
    extractStructured: vi.fn(),
  },
}));

import { memorialRouter } from "@/core/llm";
import { gerarMemorial, regerarMemorial } from "../gerar";

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
    await rm(path.join(process.cwd(), process.env.MEMORIAL_STORAGE_DIR ?? "storage/memoriais"), {
      recursive: true,
      force: true,
    });
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

  it("propaga CriacaoParcialError e deixa o registro em rascunho quando o LLM falha", async () => {
    const novoProjeto = await criarProjetoDeTeste();
    vi.mocked(memorialRouter.extractStructured).mockRejectedValue(new Error("LLM indisponível"));

    let erroCapturado: unknown;
    try {
      await gerarMemorial(
        { projetoId: novoProjeto.id, tipoConstrucao: "residencial", modoEspecificacoes: "texto" },
        { ...CONTEXTO, empresaId: novoProjeto.empresaId },
      );
    } catch (erro) {
      erroCapturado = erro;
    }

    expect(erroCapturado).toBeInstanceOf(CriacaoParcialError);
    expect((erroCapturado as CriacaoParcialError).message).toBe("LLM indisponível");

    const [linha] = await db.select().from(memorialDescritivo);
    expect(linha.status).toBe("rascunho");
    expect(linha.documentoGeradoUrl).toBeNull();
    expect((erroCapturado as CriacaoParcialError).id).toBe(linha.id);
  });

  it("modo áudio: se a prosa falhar, o audio e as especificações transcritas já ficam salvos", async () => {
    const novoProjeto = await criarProjetoDeTeste();
    vi.mocked(memorialRouter.transcribeAudio).mockResolvedValue("fundação é radier");
    vi.mocked(memorialRouter.extractStructured)
      .mockResolvedValueOnce({ data: { fundacaoEstrutura: "Radier" }, provider: "fake", raw: {} })
      .mockRejectedValueOnce(new Error("LLM indisponível"));

    const audioBase64 = Buffer.from("audio-fake").toString("base64");

    await expect(
      gerarMemorial(
        {
          projetoId: novoProjeto.id,
          tipoConstrucao: "residencial",
          modoEspecificacoes: "audio",
          audioBase64,
          audioMimeType: "audio/webm",
        },
        { ...CONTEXTO, empresaId: novoProjeto.empresaId },
      ),
    ).rejects.toThrow("LLM indisponível");

    const [linha] = await db.select().from(memorialDescritivo);
    expect(linha.status).toBe("rascunho");
    expect(linha.audioUrl).toContain("-audio");
    expect(linha.respostasFormularioJson).toMatchObject({
      especificacoes: { fundacaoEstrutura: "Radier" },
    });
  });
});

describe("regerarMemorial", () => {
  beforeEach(async () => {
    await limparBanco();
    vi.mocked(memorialRouter.transcribeAudio).mockReset();
    vi.mocked(memorialRouter.extractStructured).mockReset();
  });

  afterEach(async () => {
    await limparBanco();
    await rm(path.join(process.cwd(), process.env.MEMORIAL_STORAGE_DIR ?? "storage/memoriais"), {
      recursive: true,
      force: true,
    });
  });

  it("gera a prosa/PDF a partir das respostas já salvas, sem repetir a transcrição", async () => {
    const novoProjeto = await criarProjetoDeTeste();
    const [rascunho] = await db
      .insert(memorialDescritivo)
      .values({
        projetoId: novoProjeto.id,
        numero: 1,
        status: "rascunho",
        respostasFormularioJson: { especificacoes: { fundacaoEstrutura: "Radier" } },
      })
      .returning();
    vi.mocked(memorialRouter.extractStructured).mockResolvedValue({ data: PROSA_FAKE, provider: "fake", raw: {} });

    const resultado = await regerarMemorial(
      rascunho.id,
      rascunho.numero,
      { tipoConstrucao: "residencial", especificacoes: { fundacaoEstrutura: "Radier" } },
      { ...CONTEXTO, empresaId: novoProjeto.empresaId },
    );

    expect(resultado.status).toBe("gerado");
    expect(memorialRouter.transcribeAudio).not.toHaveBeenCalled();

    const [linha] = await db.select().from(memorialDescritivo).where(eq(memorialDescritivo.id, rascunho.id));
    expect(linha.status).toBe("gerado");
    expect(linha.documentoGeradoUrl).toBe(`/api/memoriais/${rascunho.id}/pdf`);
  });
});
