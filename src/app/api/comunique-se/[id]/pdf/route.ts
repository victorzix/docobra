import { NextResponse, type NextRequest } from "next/server";

import { verificarToken } from "@/lib/auth/jwt";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";
import { buscarComuniqueSeDaEmpresa } from "@/db/queries/comunique-se";
import { lerArquivo } from "@/lib/comunique-se/storage";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const sessao = token ? await verificarToken(token).catch(() => null) : null;

  if (!sessao) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const { id } = await params;
  const comuniqueSeEncontrado = await buscarComuniqueSeDaEmpresa(id, sessao.empresaId);

  if (!comuniqueSeEncontrado) {
    return NextResponse.json({ error: "Comunique-se não encontrado." }, { status: 404 });
  }

  try {
    const pdf = await lerArquivo(`${id}.pdf`);
    return new NextResponse(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf" } });
  } catch (error) {
    console.error("[GET /api/comunique-se/[id]/pdf]", error);
    return NextResponse.json({ error: "Comunique-se não encontrado." }, { status: 404 });
  }
}
