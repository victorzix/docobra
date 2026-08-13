import { describe, expect, it } from "vitest";

import { gerarHtmlMemorial } from "../html-template";

const DADOS_BASE = {
  projetoNome: "Casa da Praia",
  projetoEndereco: "Rua das Flores, 123",
  empresaNome: "Ancar Engenharia",
  usuarioNome: "Victor",
  tipoConstrucao: "residencial",
  descricaoGeral: "Texto da descrição geral gerado pelo LLM.",
  especificacoesTecnicas: "Texto das especificações técnicas gerado pelo LLM.",
};

describe("gerarHtmlMemorial", () => {
  it("inclui os dados de identificação e os textos gerados", () => {
    const html = gerarHtmlMemorial(DADOS_BASE);

    expect(html).toContain("Casa da Praia");
    expect(html).toContain("Rua das Flores, 123");
    expect(html).toContain("Ancar Engenharia");
    expect(html).toContain("Victor");
    expect(html).toContain("Texto da descrição geral gerado pelo LLM.");
    expect(html).toContain("Texto das especificações técnicas gerado pelo LLM.");
  });

  it("omite o endereço quando ausente, sem quebrar", () => {
    const html = gerarHtmlMemorial({ ...DADOS_BASE, projetoEndereco: null });

    expect(html).not.toContain("null");
  });

  it("escapa caracteres HTML nos textos gerados pelo LLM", () => {
    const html = gerarHtmlMemorial({ ...DADOS_BASE, descricaoGeral: "Texto com <script>alert(1)</script>" });

    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("inclui número de pavimentos, área construída e área do terreno quando fornecidos", () => {
    const html = gerarHtmlMemorial({
      ...DADOS_BASE,
      numeroPavimentos: 3,
      areaConstruida: 250,
      areaTerreno: 500,
    });

    expect(html).toContain("Número de pavimentos");
    expect(html).toContain("3");
    expect(html).toContain("Área construída");
    expect(html).toContain("250 m²");
    expect(html).toContain("Área do terreno");
    expect(html).toContain("500 m²");
  });

  it("omite número de pavimentos, área construída e área do terreno quando ausentes, sem quebrar", () => {
    const html = gerarHtmlMemorial(DADOS_BASE);

    expect(html).not.toContain("undefined");
    expect(html).not.toContain("Número de pavimentos");
    expect(html).not.toContain("Área construída");
    expect(html).not.toContain("Área do terreno");
  });
});
