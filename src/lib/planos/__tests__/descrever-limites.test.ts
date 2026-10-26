import { describe, expect, it } from "vitest";

import { descreverLimitesDoPlano } from "../descrever-limites";

describe("descreverLimitesDoPlano", () => {
  it("descreve limites mensais, ilimitados e o áudio, na ordem do catálogo de uso", () => {
    const textos = descreverLimitesDoPlano([
      { chave: "memorial.audio", valor: null, janelaDias: null },
      { chave: "projetos.criar", valor: null, janelaDias: null },
      { chave: "comunique-se.processar", valor: 20, janelaDias: 30 },
      { chave: "memorial.gerar", valor: 20, janelaDias: 30 },
      { chave: "acervo.listar", valor: null, janelaDias: null },
    ]);

    expect(textos).toEqual([
      "20 memoriais por mês",
      "20 análises de Comunique-se por mês",
      "Projetos ilimitados",
      "Memorial por áudio",
    ]);
  });

  it("janela diferente de 30 dias vira 'a cada N dias'; permissão ausente não aparece", () => {
    expect(descreverLimitesDoPlano([{ chave: "memorial.gerar", valor: 5, janelaDias: 14 }])).toEqual([
      "5 memoriais a cada 14 dias",
    ]);
    expect(descreverLimitesDoPlano([])).toEqual([]);
  });

  it("memorial ilimitado", () => {
    expect(descreverLimitesDoPlano([{ chave: "memorial.gerar", valor: null, janelaDias: null }])).toEqual([
      "Memoriais ilimitados",
    ]);
  });
});
