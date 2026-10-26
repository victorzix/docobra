import { describe, expect, it } from "vitest";

import { descreverUso, montarMailtoSuporte } from "../descrever-uso";
import type { PermissaoSerializada } from "../permissoes-da-empresa";
import { MS_POR_DIA } from "../janela";

const AGORA = new Date("2026-06-15T12:00:00Z");
const emDias = (dias: number) => new Date(AGORA.getTime() + dias * MS_POR_DIA).toISOString();

function limite(usado: number, valor: number, renovaEm: string | null = emDias(8)): PermissaoSerializada {
  return { permitido: usado < valor, limite: valor, usado, restante: Math.max(0, valor - usado), renovaEm };
}

describe("descreverUso", () => {
  it("normal: mostra o disponível do limite e quando renova, com o percentual disponível", () => {
    expect(descreverUso(limite(12, 90), "documentos", AGORA)).toEqual({
      estado: "normal",
      texto: "78 de 90 documentos disponíveis · renova em 8 dias",
      percentual: 87,
    });
  });

  it("perto: restante de 20% ou menos do limite", () => {
    expect(descreverUso(limite(72, 90), "documentos", AGORA).estado).toBe("perto");
    expect(descreverUso(limite(71, 90), "documentos", AGORA).estado).toBe("normal");
  });

  it("estourado: cota esgotada, 0 disponíveis", () => {
    expect(descreverUso(limite(90, 90), "documentos", AGORA)).toEqual({
      estado: "estourado",
      texto: "0 de 90 documentos disponíveis · renova em 8 dias",
      percentual: 0,
    });
  });

  it("renova em 1 dia usa o singular", () => {
    expect(descreverUso(limite(1, 3, emDias(1)), "projetos", AGORA).texto).toBe(
      "2 de 3 projetos disponíveis · renova em 1 dia",
    );
  });

  it("sem data de renovação, não fala em renovação", () => {
    expect(descreverUso(limite(1, 3, null), "projetos", AGORA).texto).toBe("2 de 3 projetos disponíveis");
  });

  it("ilimitado: sem barra", () => {
    const ilimitada: PermissaoSerializada = {
      permitido: true,
      limite: null,
      usado: 0,
      restante: null,
      renovaEm: null,
    };

    expect(descreverUso(ilimitada, "projetos", AGORA)).toEqual({
      estado: "ilimitado",
      texto: "Sem limite no seu plano",
      percentual: null,
    });
  });

  it("negado: a permissão não está no plano", () => {
    const negada: PermissaoSerializada = {
      permitido: false,
      limite: null,
      usado: 0,
      restante: null,
      renovaEm: null,
    };

    expect(descreverUso(negada, "documentos", AGORA)).toEqual({
      estado: "negado",
      texto: "Não incluído no seu plano",
      percentual: null,
    });
  });
});

describe("montarMailtoSuporte", () => {
  it("monta o mailto com assunto e corpo codificados", () => {
    const url = montarMailtoSuporte({
      email: "suporte@docobra.com",
      empresaNome: "Ancar Engenharia",
      planoChave: "trial",
      motivo: "Atingi o limite de gerar memoriais",
    });

    expect(url.startsWith("mailto:suporte@docobra.com?")).toBe(true);
    const parametros = new URLSearchParams(url.split("?")[1]);
    expect(parametros.get("subject")).toBe("Mudança de plano — DocObra");
    expect(parametros.get("body")).toBe(
      "Olá! Quero mudar de plano no DocObra.\n\nEmpresa: Ancar Engenharia\nPlano atual: trial\nMotivo: Atingi o limite de gerar memoriais\n",
    );
  });

  it("sem plano conhecido, escreve 'não identificado'", () => {
    const url = montarMailtoSuporte({
      email: "suporte@docobra.com",
      empresaNome: "X",
      planoChave: null,
      motivo: "m",
    });

    const parametros = new URLSearchParams(url.split("?")[1]);
    expect(parametros.get("body")).toContain("Plano atual: não identificado");
  });
});
