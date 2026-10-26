import { describe, expect, it } from "vitest";

import { atualizarDocumentoSchema } from "../documento.schema";

describe("atualizarDocumentoSchema", () => {
  it("remove a máscara e devolve só os dígitos", () => {
    expect(atualizarDocumentoSchema.parse({ documento: "529.982.247-25" })).toEqual({ documento: "52998224725" });
    expect(atualizarDocumentoSchema.parse({ documento: "11.222.333/0001-81" })).toEqual({
      documento: "11222333000181",
    });
  });

  it.each(["", "123", "52998224724", "11111111111", "12345678000199"])("recusa %j", (documento) => {
    const resultado = atualizarDocumentoSchema.safeParse({ documento });
    expect(resultado.success).toBe(false);
  });

  it("a mensagem de erro é amigável", () => {
    const resultado = atualizarDocumentoSchema.safeParse({ documento: "123" });
    expect(resultado.success ? "" : resultado.error.issues[0].message).toBe("Informe um CPF ou CNPJ válido.");
  });
});
