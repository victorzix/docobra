import { NextResponse, type NextRequest } from "next/server";

import { verificarToken } from "@/lib/auth/jwt";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";
import { atualizarItemChecklist, buscarComuniqueSeDaEmpresa } from "@/db/queries/comunique-se";
import { alternarItemChecklistSchema } from "@/lib/validations/comunique-se/toggle-item.schema";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const sessao = token ? await verificarToken(token).catch(() => null) : null;

  if (!sessao) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  }

  const parsed = alternarItemChecklistSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  }

  const { id } = await params;
  const comuniqueSeEncontrado = await buscarComuniqueSeDaEmpresa(id, sessao.empresaId);
  if (!comuniqueSeEncontrado) {
    return NextResponse.json({ error: "Comunique-se não encontrado." }, { status: 404 });
  }
  if (comuniqueSeEncontrado.status !== "pronto") {
    return NextResponse.json({ error: "Esse Comunique-se ainda não está pronto." }, { status: 400 });
  }

  const itens = await atualizarItemChecklist(id, parsed.data.itemId, parsed.data.concluida);
  if (!itens) {
    return NextResponse.json({ error: "Item não encontrado." }, { status: 404 });
  }

  return NextResponse.json({ itens });
}
