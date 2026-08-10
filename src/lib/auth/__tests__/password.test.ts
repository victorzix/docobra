import { describe, expect, it } from "vitest";
import { hashSenha, verificarSenha } from "@/lib/auth/password";

describe("hashSenha / verificarSenha", () => {
  it("valida a senha correta", async () => {
    const hash = await hashSenha("senha-correta-123");
    await expect(verificarSenha("senha-correta-123", hash)).resolves.toBe(true);
  });

  it("rejeita a senha incorreta", async () => {
    const hash = await hashSenha("senha-correta-123");
    await expect(verificarSenha("senha-errada-999", hash)).resolves.toBe(false);
  });

  it("nunca guarda a senha em texto puro", async () => {
    const hash = await hashSenha("senha-correta-123");
    expect(hash).not.toBe("senha-correta-123");
  });
});
