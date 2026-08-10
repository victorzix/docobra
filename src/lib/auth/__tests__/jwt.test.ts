import { describe, expect, it } from "vitest";
import { SignJWT } from "jose";
import { assinarToken, verificarToken } from "@/lib/auth/jwt";

describe("assinarToken / verificarToken", () => {
  const payload = { userId: "user-1", empresaId: "empresa-1", papel: "admin" };

  it("faz o round-trip preservando o payload", async () => {
    const token = await assinarToken(payload);
    const resultado = await verificarToken(token);
    expect(resultado.userId).toBe(payload.userId);
    expect(resultado.empresaId).toBe(payload.empresaId);
    expect(resultado.papel).toBe(payload.papel);
  });

  it("rejeita token expirado", async () => {
    const token = await assinarToken(payload, "1s");
    await new Promise((resolve) => setTimeout(resolve, 1100));
    await expect(verificarToken(token)).rejects.toThrow();
  });

  it("rejeita token com assinatura errada", async () => {
    const secretErrado = new TextEncoder().encode("outro-secret-completamente-diferente");
    const tokenAdulterado = await new SignJWT(payload)
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("7d")
      .sign(secretErrado);
    await expect(verificarToken(tokenAdulterado)).rejects.toThrow();
  });
});
