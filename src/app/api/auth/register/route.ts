import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { empresa, usuario } from "@/db/schema";
import { hashSenha } from "@/lib/auth/password";
import { assinarToken } from "@/lib/auth/jwt";
import { SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from "@/lib/auth/constants";
import { registerSchema } from "@/lib/validations/auth/register.schema";

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  if ("code" in error && error.code === "23505") {
    return true;
  }
  // drizzle-orm envolve o erro real do `pg` (com `.code`) em
  // DrizzleQueryError, expondo-o só em `.cause` — checar aninhado.
  if ("cause" in error) {
    return isUniqueViolation(error.cause);
  }
  return false;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = registerSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos.", fields: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { nomeEmpresa, nome, email, senha } = parsed.data;

    const existente = await db.query.usuario.findFirst({ where: eq(usuario.email, email) });
    if (existente) {
      return NextResponse.json({ error: "Este email já está cadastrado." }, { status: 409 });
    }

    const senhaHash = await hashSenha(senha);

    let novoUsuario;
    try {
      novoUsuario = await db.transaction(async (tx) => {
        const [novaEmpresa] = await tx.insert(empresa).values({ nome: nomeEmpresa }).returning();
        const [criado] = await tx
          .insert(usuario)
          .values({ nome, email, senhaHash, empresaId: novaEmpresa.id, papel: "admin" })
          .returning();
        return criado;
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        return NextResponse.json({ error: "Este email já está cadastrado." }, { status: 409 });
      }
      throw error;
    }

    const token = await assinarToken({
      userId: novoUsuario.id,
      empresaId: novoUsuario.empresaId,
      papel: novoUsuario.papel,
    });

    const response = NextResponse.json(
      {
        usuario: {
          id: novoUsuario.id,
          nome: novoUsuario.nome,
          email: novoUsuario.email,
          papel: novoUsuario.papel,
        },
      },
      { status: 201 },
    );
    response.cookies.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE_SECONDS,
    });
    return response;
  } catch (error) {
    console.error("[POST /api/auth/register]", error);
    return NextResponse.json({ error: "Erro interno, tente novamente." }, { status: 500 });
  }
}
