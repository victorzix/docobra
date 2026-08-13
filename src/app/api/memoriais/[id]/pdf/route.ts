import { NextResponse, type NextRequest } from "next/server";

import { verificarToken } from "@/lib/auth/jwt";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";
import { buscarMemorialDaEmpresa } from "@/db/queries/memorial";
import { lerArquivo } from "@/lib/memorial/storage";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const sessao = token ? await verificarToken(token).catch(() => null) : null;

  if (!sessao) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const { id } = await params;
  const memorial = await buscarMemorialDaEmpresa(id, sessao.empresaId);

  if (!memorial || memorial.status !== "gerado") {
    return NextResponse.json({ error: "Memorial não encontrado." }, { status: 404 });
  }

  const pdf = await lerArquivo(`${id}.pdf`);
  return new NextResponse(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf" } });
}
