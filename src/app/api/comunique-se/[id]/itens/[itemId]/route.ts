import { NextResponse, type NextRequest } from "next/server";

import { verificarToken } from "@/lib/auth/jwt";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";
import { buscarComuniqueSeDaEmpresa, removerItemChecklist } from "@/db/queries/comunique-se";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const sessao = token ? await verificarToken(token).catch(() => null) : null;

  if (!sessao) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const { id, itemId } = await params;
  const comuniqueSeEncontrado = await buscarComuniqueSeDaEmpresa(id, sessao.empresaId);
  if (!comuniqueSeEncontrado) {
    return NextResponse.json({ error: "Comunique-se não encontrado." }, { status: 404 });
  }
  if (comuniqueSeEncontrado.status !== "pronto") {
    return NextResponse.json({ error: "Esse Comunique-se ainda não está pronto." }, { status: 400 });
  }

  const itens = await removerItemChecklist(id, itemId);
  if (!itens) {
    return NextResponse.json({ error: "Item não encontrado." }, { status: 404 });
  }

  return NextResponse.json({ itens });
}
