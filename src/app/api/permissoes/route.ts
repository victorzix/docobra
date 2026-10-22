import { NextResponse, type NextRequest } from "next/server";

import { verificarToken } from "@/lib/auth/jwt";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";
import { carregarPermissoesDaEmpresa } from "@/lib/permissoes/permissoes-da-empresa";

export async function GET(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const sessao = token ? await verificarToken(token).catch(() => null) : null;

  if (!sessao) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  try {
    return NextResponse.json(await carregarPermissoesDaEmpresa(sessao.empresaId));
  } catch (error) {
    console.error("[GET /api/permissoes]", error);
    return NextResponse.json({ error: "Erro interno, tente novamente." }, { status: 500 });
  }
}
