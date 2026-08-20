import { NextResponse, type NextRequest } from "next/server";

import { verificarToken } from "@/lib/auth/jwt";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";
import { buscarComuniqueSeDaEmpresa } from "@/db/queries/comunique-se";
import { reprocessarComuniqueSe } from "@/lib/comunique-se/processar";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const sessao = token ? await verificarToken(token).catch(() => null) : null;

  if (!sessao) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const { id } = await params;

  try {
    const comuniqueSeEncontrado = await buscarComuniqueSeDaEmpresa(id, sessao.empresaId);
    if (!comuniqueSeEncontrado) {
      return NextResponse.json({ error: "Comunique-se não encontrado." }, { status: 404 });
    }
    if (comuniqueSeEncontrado.status === "pronto") {
      return NextResponse.json({ error: "Esse Comunique-se já foi processado." }, { status: 400 });
    }

    const resultado = await reprocessarComuniqueSe(
      comuniqueSeEncontrado.id,
      comuniqueSeEncontrado.numero,
      comuniqueSeEncontrado.pdfOriginalUrl,
    );
    return NextResponse.json({ comuniqueSe: resultado });
  } catch (error) {
    console.error("[POST /api/comunique-se/[id]/retry]", error);
    return NextResponse.json({ error: "Erro ao processar o Comunique-se, tente novamente." }, { status: 500 });
  }
}
