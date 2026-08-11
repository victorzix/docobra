import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { usuario } from "@/db/schema";
import { verificarSenha } from "@/lib/auth/password";
import { assinarToken } from "@/lib/auth/jwt";
import { SESSION_COOKIE_NAME, SESSION_COOKIE_OPTIONS } from "@/lib/auth/constants";
import { loginSchema } from "@/lib/validations/auth/login.schema";

const CREDENCIAIS_INVALIDAS = { error: "Email ou senha incorretos." };

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = loginSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos.", fields: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { email, senha } = parsed.data;

    const encontrado = await db.query.usuario.findFirst({ where: eq(usuario.email, email) });
    if (!encontrado) {
      return NextResponse.json(CREDENCIAIS_INVALIDAS, { status: 401 });
    }

    const senhaValida = await verificarSenha(senha, encontrado.senhaHash);
    if (!senhaValida) {
      return NextResponse.json(CREDENCIAIS_INVALIDAS, { status: 401 });
    }

    const token = await assinarToken({
      userId: encontrado.id,
      empresaId: encontrado.empresaId,
      papel: encontrado.papel,
    });

    const response = NextResponse.json({
      usuario: {
        id: encontrado.id,
        nome: encontrado.nome,
        email: encontrado.email,
        papel: encontrado.papel,
      },
    });
    response.cookies.set(SESSION_COOKIE_NAME, token, SESSION_COOKIE_OPTIONS);
    return response;
  } catch (error) {
    console.error("[POST /api/auth/login]", error);
    return NextResponse.json({ error: "Erro interno, tente novamente." }, { status: 500 });
  }
}
