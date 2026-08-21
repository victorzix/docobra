import { describe, expect, it } from "vitest";

import { gerarHtmlModelo } from "../modelo-html-template";

describe("gerarHtmlModelo", () => {
  it("inclui referência, projeto e os itens do checklist", () => {
    const html = gerarHtmlModelo({
      referencia: "CS-0001",
      projetoNome: "Casa da Praia",
      itens: [
        { descricao: "Apresentar ART", concluida: true },
        { descricao: "Apresentar laudo de sondagem", concluida: false },
      ],
    });

    expect(html).toContain("CS-0001");
    expect(html).toContain("Casa da Praia");
    expect(html).toContain("Apresentar ART");
    expect(html).toContain("Apresentar laudo de sondagem");
  });

  it("escapa caracteres HTML na descrição dos itens", () => {
    const html = gerarHtmlModelo({
      referencia: "CS-0001",
      projetoNome: "Casa",
      itens: [{ descricao: "Texto com <script>alert(1)</script>", concluida: false }],
    });

    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
