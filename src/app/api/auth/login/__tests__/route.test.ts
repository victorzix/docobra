import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { empresa, usuario } from "@/db/schema";
import { hashSenha } from "@/lib/auth/password";
import { POST } from "@/app/api/auth/login/route";

async function limparBanco() {
  await db.delete(usuario);
  await db.delete(empresa);
}

async function criarUsuarioDeTeste() {
  const [novaEmpresa] = await db.insert(empresa).values({ nome: "Ancar Engenharia" }).returning();
  const senhaHash = await hashSenha("senha-forte-123");
  await db.insert(usuario).values({
    nome: "Victor",
    email: "victor@ancar.com.br",
    senhaHash,
    empresaId: novaEmpresa.id,
    papel: "admin",
  });
}

function criarRequest(body: unknown) {
  return new Request("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/login", () => {
  beforeEach(async () => {
    await limparBanco();
    await criarUsuarioDeTeste();
  });
  afterEach(limparBanco);

  it("autentica com as credenciais corretas e seta cookie", async () => {
    const response = await POST(criarRequest({ email: "victor@ancar.com.br", senha: "senha-forte-123" }));
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("docobra_session=");

    const corpo = await response.json();
    expect(corpo.usuario.nome).toBe("Victor");
  });

  it("rejeita senha errada com 401 genérico", async () => {
    const response = await POST(criarRequest({ email: "victor@ancar.com.br", senha: "senha-errada" }));
    expect(response.status).toBe(401);
    const corpo = await response.json();
    expect(corpo.error).toBe("Email ou senha incorretos.");
  });

  it("rejeita email inexistente com o mesmo 401 genérico", async () => {
    const response = await POST(criarRequest({ email: "naoexiste@ancar.com.br", senha: "qualquer-coisa" }));
    expect(response.status).toBe(401);
    const corpo = await response.json();
    expect(corpo.error).toBe("Email ou senha incorretos.");
  });
});
