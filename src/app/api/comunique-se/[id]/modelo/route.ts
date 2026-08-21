import { NextResponse, type NextRequest } from "next/server";

import { verificarToken } from "@/lib/auth/jwt";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";
import { buscarComuniqueSeDaEmpresa } from "@/db/queries/comunique-se";
import { buscarProjetoDaEmpresa } from "@/db/queries/projeto";
import { referenciaComuniqueSe } from "@/lib/referencia";
import { gerarModeloExportado } from "@/lib/comunique-se/modelo-exportar";

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
  if (comuniqueSeEncontrado.status !== "pronto" || !comuniqueSeEncontrado.checklistJson) {
    return NextResponse.json({ error: "Esse Comunique-se ainda não está pronto." }, { status: 400 });
  }

  // buscarComuniqueSeDaEmpresa acima já confirma (via join) que o projeto existe
  // e pertence a essa empresa — não pode retornar null aqui.
  const projetoEncontrado = await buscarProjetoDaEmpresa(comuniqueSeEncontrado.projetoId, sessao.empresaId);

  try {
    const pdf = await gerarModeloExportado({
      referencia: referenciaComuniqueSe(comuniqueSeEncontrado.numero),
      projetoNome: projetoEncontrado!.nome,
      itens: comuniqueSeEncontrado.checklistJson.itens,
    });

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="modelo-${referenciaComuniqueSe(comuniqueSeEncontrado.numero)}.pdf"`,
      },
    });
  } catch (error) {
    console.error("[GET /api/comunique-se/[id]/modelo]", error);
    return NextResponse.json({ error: "Erro ao gerar o modelo, tente novamente." }, { status: 500 });
  }
}
