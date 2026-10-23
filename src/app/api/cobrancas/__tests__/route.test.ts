import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { FalhaIncertaError, RecusaDefinitivaError } from "@/core/payments/erros";
import { db } from "@/db";
import { semearCatalogoNoBancoDeTeste } from "@/db/__tests__/helpers/semear-catalogo";
import { usuario } from "@/db/schema";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";
import { assinarToken } from "@/lib/auth/jwt";
import { AGORA, criarCenario, limparCenarios } from "@/lib/pagamentos/__tests__/helpers/cenario";

vi.mock("@/lib/pagamentos/iniciar-cobranca", async (importarOriginal) => ({
  ...(await importarOriginal<typeof import("@/lib/pagamentos/iniciar-cobranca")>()),
  iniciarCobranca: vi.fn(),
}));

import {
  CobrancaNaoPermitidaError,
  DocumentoAusenteError,
  iniciarCobranca,
} from "@/lib/pagamentos/iniciar-cobranca";
import { POST } from "@/app/api/cobrancas/route";

async function sessao() {
  const cenario = await criarCenario();
  const [admin] = await db.select().from(usuario);
  const token = await assinarToken({ userId: admin.id, empresaId: cenario.empresaId, papel: admin.papel });
  return { cenario, token };
}

function requisicao(corpo: unknown, token?: string) {
  return new NextRequest("http://localhost/api/cobrancas", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Cookie: `${SESSION_COOKIE_NAME}=${token}` } : {}) },
    body: JSON.stringify(corpo),
  });
}

const COBRANCA = {
  id: "c1",
  assinaturaId: "a1",
  empresaId: "e1",
  tipo: "assinatura" as const,
  planoDestinoId: "p1",
  valorCentavos: 9900,
  status: "pendente" as const,
  venceEm: AGORA,
  provider: "asaas",
  providerChargeId: "pay_1",
  pixCopiaECola: "copia",
  pixQrCodeBase64: "qr",
  pixExpiraEm: null,
  pagaEm: null,
  createdAt: AGORA,
  updatedAt: AGORA,
};

describe("POST /api/cobrancas", () => {
  beforeAll(semearCatalogoNoBancoDeTeste);
  beforeEach(async () => {
    await limparCenarios();
    vi.mocked(iniciarCobranca).mockReset();
  });
  afterEach(limparCenarios);

  it("sem sessão: 401", async () => {
    expect((await POST(requisicao({ tipo: "renovacao" }))).status).toBe(401);
  });

  it("corpo inválido: 400 (assinatura e upgrade exigem planoChave; tipo desconhecido)", async () => {
    const { token } = await sessao();

    expect((await POST(requisicao({ tipo: "assinatura" }, token))).status).toBe(400);
    expect((await POST(requisicao({ tipo: "upgrade", planoChave: "" }, token))).status).toBe(400);
    expect((await POST(requisicao({ tipo: "outro" }, token))).status).toBe(400);
    expect(iniciarCobranca).not.toHaveBeenCalled();
  });

  it("201 com a cobrança serializada e o Pix, usando a empresa da sessão", async () => {
    const { cenario, token } = await sessao();
    vi.mocked(iniciarCobranca).mockResolvedValue(COBRANCA);

    const resposta = await POST(requisicao({ tipo: "assinatura", planoChave: "essencial" }, token));

    expect(resposta.status).toBe(201);
    const corpo = await resposta.json();
    expect(corpo.cobranca).toMatchObject({ id: "c1", valorCentavos: 9900, pix: { copiaECola: "copia", qrCodeBase64: "qr" } });
    expect(iniciarCobranca).toHaveBeenCalledWith({
      empresaId: cenario.empresaId,
      tipo: "assinatura",
      planoDestinoChave: "essencial",
    });
  });

  it("renovação não envia plano", async () => {
    const { cenario, token } = await sessao();
    vi.mocked(iniciarCobranca).mockResolvedValue({ ...COBRANCA, tipo: "renovacao" });

    await POST(requisicao({ tipo: "renovacao" }, token));

    expect(iniciarCobranca).toHaveBeenCalledWith({
      empresaId: cenario.empresaId,
      tipo: "renovacao",
      planoDestinoChave: undefined,
    });
  });

  it("sem CPF/CNPJ: 422 DOCUMENTO_AUSENTE", async () => {
    const { token } = await sessao();
    vi.mocked(iniciarCobranca).mockRejectedValue(new DocumentoAusenteError());

    const resposta = await POST(requisicao({ tipo: "renovacao" }, token));

    expect(resposta.status).toBe(422);
    expect((await resposta.json()).codigo).toBe("DOCUMENTO_AUSENTE");
  });

  it("não permitido: 409 COBRANCA_NAO_PERMITIDA com o motivo", async () => {
    const { token } = await sessao();
    vi.mocked(iniciarCobranca).mockRejectedValue(new CobrancaNaoPermitidaError("mesmo_plano", "Você já está nesse plano."));

    const resposta = await POST(requisicao({ tipo: "upgrade", planoChave: "essencial" }, token));

    expect(resposta.status).toBe(409);
    expect(await resposta.json()).toEqual({
      error: "Você já está nesse plano.",
      codigo: "COBRANCA_NAO_PERMITIDA",
      motivo: "mesmo_plano",
    });
  });

  it.each([
    ["falha incerta", new FalhaIncertaError("timeout")],
    ["recusa definitiva", new RecusaDefinitivaError("recusou")],
  ])("%s do gateway: 502 com mensagem amigável", async (_nome, erro) => {
    const { token } = await sessao();
    vi.mocked(iniciarCobranca).mockRejectedValue(erro);
    const erroNoConsole = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const resposta = await POST(requisicao({ tipo: "renovacao" }, token));

    expect(resposta.status).toBe(502);
    expect((await resposta.json()).error).toContain("tente de novo");
    erroNoConsole.mockRestore();
  });

  it("erro inesperado: 500", async () => {
    const { token } = await sessao();
    vi.mocked(iniciarCobranca).mockRejectedValue(new Error("boom"));
    const erroNoConsole = vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect((await POST(requisicao({ tipo: "renovacao" }, token))).status).toBe(500);
    erroNoConsole.mockRestore();
  });
});
