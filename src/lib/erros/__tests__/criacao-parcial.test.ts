import { describe, expect, it } from "vitest";

import { CriacaoParcialError } from "../criacao-parcial";

describe("CriacaoParcialError", () => {
  it("carrega a mensagem e o id, e é uma instância de Error", () => {
    const erro = new CriacaoParcialError("Erro ao processar.", "abc-123");

    expect(erro).toBeInstanceOf(Error);
    expect(erro.message).toBe("Erro ao processar.");
    expect(erro.id).toBe("abc-123");
    expect(erro.name).toBe("CriacaoParcialError");
  });
});
