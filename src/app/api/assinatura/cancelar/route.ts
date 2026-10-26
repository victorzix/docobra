import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";
import { verificarToken } from "@/lib/auth/jwt";
import { AssinaturaNaoCancelavelError, cancelarAssinatura } from "@/lib/pagamentos/cancelar-assinatura";

export async function POST(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const sessao = token ? await verificarToken(token).catch(() => null) : null;

  if (!sessao) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  try {
    await cancelarAssinatura(sessao.empresaId);
    return NextResponse.json({ ok: true });
  } catch (erro) {
    if (erro instanceof AssinaturaNaoCancelavelError) {
      return NextResponse.json({ error: erro.message, codigo: "ASSINATURA_NAO_CANCELAVEL" }, { status: 409 });
    }
    console.error("[POST /api/assinatura/cancelar]", erro);
    return NextResponse.json({ error: "Erro interno, tente novamente." }, { status: 500 });
  }
}
