import { describe, expect, it } from "vitest";
import { registerSchema } from "@/lib/validations/auth/register.schema";

describe("registerSchema", () => {
  const valido = {
    nomeEmpresa: "Ancar Engenharia",
    nome: "Victor",
    email: "victor@ancar.com.br",
    senha: "senha-forte-123",
  };

  it("aceita um input válido", () => {
    expect(registerSchema.safeParse(valido).success).toBe(true);
  });

  it("rejeita email malformado", () => {
    expect(registerSchema.safeParse({ ...valido, email: "não-é-email" }).success).toBe(false);
  });

  it("rejeita senha com menos de 8 caracteres", () => {
    expect(registerSchema.safeParse({ ...valido, senha: "curta12" }).success).toBe(false);
  });

  it("rejeita nomeEmpresa vazio", () => {
    expect(registerSchema.safeParse({ ...valido, nomeEmpresa: "" }).success).toBe(false);
  });

  it("rejeita nome vazio", () => {
    expect(registerSchema.safeParse({ ...valido, nome: "" }).success).toBe(false);
  });
});
