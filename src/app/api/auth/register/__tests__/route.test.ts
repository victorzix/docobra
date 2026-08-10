import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { empresa, usuario } from "@/db/schema";
import { POST } from "@/app/api/auth/register/route";

async function limparBanco() {
  await db.delete(usuario);
  await db.delete(empresa);
}

function criarRequest(body: unknown) {
  return new Request("http://localhost/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const payloadValido = {
  nomeEmpresa: "Ancar Engenharia",
  nome: "Victor",
  email: "victor@ancar.com.br",
  senha: "senha-forte-123",
};

describe("POST /api/auth/register", () => {
  beforeEach(limparBanco);
  afterEach(limparBanco);

  it("cria Empresa e Usuario e retorna 201 com cookie de sessão", async () => {
    const response = await POST(criarRequest(payloadValido));
    expect(response.status).toBe(201);

    const corpo = await response.json();
    expect(corpo.usuario.nome).toBe("Victor");
    expect(corpo.usuario.papel).toBe("admin");
    expect(corpo.usuario.senhaHash).toBeUndefined();
    expect(response.headers.get("set-cookie")).toContain("docobra_session=");

    const usuarios = await db.select().from(usuario);
    expect(usuarios).toHaveLength(1);
  });

  it("rejeita email duplicado com 409 e não cria segunda linha", async () => {
    await POST(criarRequest(payloadValido));
    const segunda = await POST(criarRequest(payloadValido));

    expect(segunda.status).toBe(409);
    const corpo = await segunda.json();
    expect(corpo.error).toBe("Este email já está cadastrado.");

    const usuarios = await db.select().from(usuario);
    expect(usuarios).toHaveLength(1);
  });

  it("rejeita input inválido com 400", async () => {
    const response = await POST(criarRequest({ ...payloadValido, email: "não-é-email" }));
    expect(response.status).toBe(400);
  });

  it("trata a corrida de dois registros simultâneos com o mesmo email", async () => {
    // Duas chamadas concorrentes passam pela checagem prévia (`existente`) antes
    // de qualquer uma inserir — só a constraint unique do Postgres, pega no
    // catch da transação, decide qual das duas falha.
    const [r1, r2] = await Promise.all([
      POST(criarRequest(payloadValido)),
      POST(criarRequest(payloadValido)),
    ]);

    const statuses = [r1.status, r2.status].sort();
    expect(statuses).toEqual([201, 409]);

    const usuarios = await db.select().from(usuario);
    expect(usuarios).toHaveLength(1);
  });
});
