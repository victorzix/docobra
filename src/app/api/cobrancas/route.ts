import { NextResponse, type NextRequest } from "next/server";

import { FalhaIncertaError, RecusaDefinitivaError } from "@/core/payments/erros";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";
import { verificarToken } from "@/lib/auth/jwt";
import {
  CobrancaNaoPermitidaError,
  DocumentoAusenteError,
  iniciarCobranca,
} from "@/lib/pagamentos/iniciar-cobranca";
import { serializarCobranca } from "@/lib/pagamentos/serializar-cobranca";
import { criarCobrancaSchema } from "@/lib/validations/cobranca/create.schema";

export async function POST(request: NextRequest) {
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

  const parsed = criarCobrancaSchema.safeParse(corpo);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dados inválidos.", fields: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  try {
    const criada = await iniciarCobranca({
      empresaId: sessao.empresaId,
      tipo: parsed.data.tipo,
      planoDestinoChave: parsed.data.tipo === "renovacao" ? undefined : parsed.data.planoChave,
    });
    return NextResponse.json({ cobranca: serializarCobranca(criada) }, { status: 201 });
  } catch (erro) {
    if (erro instanceof DocumentoAusenteError) {
      return NextResponse.json({ error: erro.message, codigo: "DOCUMENTO_AUSENTE" }, { status: 422 });
    }
    if (erro instanceof CobrancaNaoPermitidaError) {
      return NextResponse.json(
        { error: erro.message, codigo: "COBRANCA_NAO_PERMITIDA", motivo: erro.motivo },
        { status: 409 },
      );
    }
    if (erro instanceof FalhaIncertaError || erro instanceof RecusaDefinitivaError) {
      console.error("[POST /api/cobrancas]", erro);
      return NextResponse.json(
        { error: "Não foi possível gerar o Pix agora, tente de novo em instantes." },
        { status: 502 },
      );
    }
    console.error("[POST /api/cobrancas]", erro);
    return NextResponse.json({ error: "Erro interno, tente novamente." }, { status: 500 });
  }
}
