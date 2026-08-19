import { NextResponse, type NextRequest } from "next/server";

import { verificarToken } from "@/lib/auth/jwt";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";
import { buscarMemorialDaEmpresa } from "@/db/queries/memorial";
import { buscarProjetoDaEmpresa } from "@/db/queries/projeto";
import { buscarNomesUsuarioEEmpresa } from "@/db/queries/usuario";
import { regerarMemorial, type RespostasParaGeracao } from "@/lib/memorial/gerar";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const sessao = token ? await verificarToken(token).catch(() => null) : null;

  if (!sessao) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const { id } = await params;

  try {
    const memorial = await buscarMemorialDaEmpresa(id, sessao.empresaId);
    if (!memorial) {
      return NextResponse.json({ error: "Memorial não encontrado." }, { status: 404 });
    }
    if (memorial.status === "gerado") {
      return NextResponse.json({ error: "Esse memorial já foi gerado." }, { status: 400 });
    }

    const projetoEncontrado = await buscarProjetoDaEmpresa(memorial.projetoId, sessao.empresaId);
    if (!projetoEncontrado) {
      return NextResponse.json({ error: "Projeto não encontrado." }, { status: 404 });
    }

    const respostas = memorial.respostasFormularioJson as {
      tipoConstrucao: string;
      numeroPavimentos?: number;
      areaConstruida?: number;
      areaTerreno?: number;
      especificacoes?: RespostasParaGeracao["especificacoes"];
    };

    const nomes = await buscarNomesUsuarioEEmpresa(sessao.userId);
    const resultado = await regerarMemorial(
      memorial.id,
      memorial.numero,
      {
        tipoConstrucao: respostas.tipoConstrucao,
        numeroPavimentos: respostas.numeroPavimentos,
        areaConstruida: respostas.areaConstruida,
        areaTerreno: respostas.areaTerreno,
        especificacoes: respostas.especificacoes ?? {},
      },
      {
        empresaId: sessao.empresaId,
        projetoNome: projetoEncontrado.nome,
        projetoEndereco: projetoEncontrado.endereco,
        empresaNome: nomes?.empresaNome ?? "",
        usuarioNome: nomes?.usuarioNome ?? "",
      },
    );

    return NextResponse.json({ memorial: resultado });
  } catch (error) {
    console.error("[POST /api/memoriais/[id]/retry]", error);
    return NextResponse.json({ error: "Erro ao gerar o memorial, tente novamente." }, { status: 500 });
  }
}
