import { describe, expect, it } from "vitest";
import { assinarToken } from "@/lib/auth/jwt";
import { resolveSessionAction } from "@/lib/auth/middleware-session";

describe("resolveSessionAction", () => {
  it("redireciona quando não há token", async () => {
    await expect(resolveSessionAction(undefined)).resolves.toEqual({ action: "redirect" });
  });

  it("redireciona quando o token é inválido", async () => {
    await expect(resolveSessionAction("token-invalido")).resolves.toEqual({ action: "redirect" });
  });

  it("permite e renova o token quando ele é válido", async () => {
    const token = await assinarToken({ userId: "u1", empresaId: "e1", papel: "admin" });
    const resultado = await resolveSessionAction(token);

    expect(resultado.action).toBe("allow");
    if (resultado.action === "allow") {
      expect(typeof resultado.novoToken).toBe("string");
      expect(resultado.novoToken).not.toBe(token);
    }
  });
});
