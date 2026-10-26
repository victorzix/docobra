import { NextResponse, type NextRequest } from "next/server";

import { buscarCobrancaDaEmpresa } from "@/db/queries/cobranca";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";
import { verificarToken } from "@/lib/auth/jwt";
import { expirarSeVencida } from "@/lib/pagamentos/expirar-cobranca";
import { serializarCobranca } from "@/lib/pagamentos/serializar-cobranca";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const sessao = token ? await verificarToken(token).catch(() => null) : null;

  if (!sessao) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const { id } = await params;
  if (!UUID.test(id)) {
    return NextResponse.json({ error: "Cobrança não encontrada." }, { status: 404 });
  }

  try {
    const encontrada = await buscarCobrancaDaEmpresa(id, sessao.empresaId);
    if (!encontrada) {
      return NextResponse.json({ error: "Cobrança não encontrada." }, { status: 404 });
    }
    return NextResponse.json({ cobranca: serializarCobranca(await expirarSeVencida(encontrada)) });
  } catch (error) {
    console.error("[GET /api/cobrancas/[id]]", error);
    return NextResponse.json({ error: "Erro interno, tente novamente." }, { status: 500 });
  }
}
