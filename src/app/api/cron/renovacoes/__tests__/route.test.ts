import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/pagamentos/gerar-renovacoes", () => ({
  gerarRenovacoes: vi.fn(async () => ({ garantidas: 2, semDocumento: 1, falhas: 0 })),
}));

import { gerarRenovacoes } from "@/lib/pagamentos/gerar-renovacoes";
import { POST } from "@/app/api/cron/renovacoes/route";

function requisicao(token?: string) {
  return new NextRequest("http://localhost/api/cron/renovacoes", {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

describe("POST /api/cron/renovacoes", () => {
  beforeEach(() => {
    vi.mocked(gerarRenovacoes).mockClear();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("sem CRON_SECRET configurada: 503 e não executa", async () => {
    vi.stubEnv("CRON_SECRET", "");

    const resposta = await POST(requisicao("qualquer"));

    expect(resposta.status).toBe(503);
    expect(gerarRenovacoes).not.toHaveBeenCalled();
  });

  it("token ausente ou errado: 401 e não executa", async () => {
    vi.stubEnv("CRON_SECRET", "segredo-do-cron");

    expect((await POST(requisicao())).status).toBe(401);
    expect((await POST(requisicao("errado"))).status).toBe(401);
    expect(gerarRenovacoes).not.toHaveBeenCalled();
  });

  it("token certo: 200 com o resumo", async () => {
    vi.stubEnv("CRON_SECRET", "segredo-do-cron");

    const resposta = await POST(requisicao("segredo-do-cron"));

    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toEqual({ garantidas: 2, semDocumento: 1, falhas: 0 });
    expect(gerarRenovacoes).toHaveBeenCalledTimes(1);
  });
});
