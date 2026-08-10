import { describe, expect, it } from "vitest";
import { loginSchema } from "@/lib/validations/auth/login.schema";

describe("loginSchema", () => {
  it("aceita um input válido", () => {
    expect(loginSchema.safeParse({ email: "victor@ancar.com.br", senha: "qualquer" }).success).toBe(true);
  });

  it("rejeita email malformado", () => {
    expect(loginSchema.safeParse({ email: "não-é-email", senha: "qualquer" }).success).toBe(false);
  });

  it("rejeita senha vazia", () => {
    expect(loginSchema.safeParse({ email: "victor@ancar.com.br", senha: "" }).success).toBe(false);
  });
});
