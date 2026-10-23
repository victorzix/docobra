import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";

import { db } from "@/db";
import { empresa } from "@/db/schema";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";
import { verificarToken } from "@/lib/auth/jwt";
import { atualizarDocumentoSchema } from "@/lib/validations/empresa/documento.schema";

export async function PUT(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const sessao = token ? await verificarToken(token).catch(() => null) : null;

  if (!sessao) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  let corpo: unknown;
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  }

  const parsed = atualizarDocumentoSchema.safeParse(corpo);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dados inválidos.", fields: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  try {
    await db
      .update(empresa)
      .set({ documento: parsed.data.documento, updatedAt: new Date() })
      .where(eq(empresa.id, sessao.empresaId));
    return NextResponse.json({ documento: parsed.data.documento });
  } catch (error) {
    console.error("[PUT /api/empresa/documento]", error);
    return NextResponse.json({ error: "Erro interno, tente novamente." }, { status: 500 });
  }
}
