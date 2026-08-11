import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { db } from "@/db";
import { empresa, usuario } from "@/db/schema";
import { buscarNomesUsuarioEEmpresa } from "../usuario";

async function limparBanco() {
  await db.delete(usuario);
  await db.delete(empresa);
}

describe("buscarNomesUsuarioEEmpresa", () => {
  beforeEach(limparBanco);
  afterEach(limparBanco);

  it("retorna os nomes de usuário e empresa quando o usuário existe", async () => {
    const [novaEmpresa] = await db
      .insert(empresa)
      .values({ nome: "Ancar Engenharia" })
      .returning();
    const [novoUsuario] = await db
      .insert(usuario)
      .values({
        nome: "Victor",
        email: "victor@ancar.com.br",
        senhaHash: "hash-fake",
        empresaId: novaEmpresa.id,
      })
      .returning();

    const resultado = await buscarNomesUsuarioEEmpresa(novoUsuario.id);

    expect(resultado).toEqual({ usuarioNome: "Victor", empresaNome: "Ancar Engenharia" });
  });

  it("retorna null sem lançar quando o usuário não existe", async () => {
    const resultado = await buscarNomesUsuarioEEmpresa("00000000-0000-0000-0000-000000000000");

    expect(resultado).toBeNull();
  });
});
