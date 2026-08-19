import { NextResponse, type NextRequest } from "next/server";

import { verificarToken } from "@/lib/auth/jwt";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";
import { buscarProjetoDaEmpresa } from "@/db/queries/projeto";
import { buscarNomesUsuarioEEmpresa } from "@/db/queries/usuario";
import { listarMemoriais } from "@/db/queries/memorial";
import { criarMemorialSchema } from "@/lib/validations/memorial/create.schema";
import type { MemorialResponse } from "@/lib/validations/memorial/response.schema";
import type { PaginatedResponse } from "@/lib/pagination";
import { gerarMemorial } from "@/lib/memorial/gerar";

export async function GET(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const sessao = token ? await verificarToken(token).catch(() => null) : null;

  if (!sessao) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  try {
    const memoriais = await listarMemoriais(sessao.empresaId);

    const body: PaginatedResponse<MemorialResponse> = {
      data: memoriais.map((m) => ({
        id: m.id,
        numero: m.numero,
        projetoNome: m.projetoNome,
        status: m.status,
        documentoGeradoUrl: m.documentoGeradoUrl,
        createdAt: m.createdAt.toISOString(),
      })),
      page: 1,
      total: memoriais.length,
    };

    return NextResponse.json(body);
  } catch (error) {
    console.error("[GET /api/memoriais]", error);
    return NextResponse.json({ error: "Erro interno, tente novamente." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const sessao = token ? await verificarToken(token).catch(() => null) : null;

  if (!sessao) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
    }
    const parsed = criarMemorialSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos.", fields: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const projetoEncontrado = await buscarProjetoDaEmpresa(parsed.data.projetoId, sessao.empresaId);
    if (!projetoEncontrado) {
      return NextResponse.json({ error: "Projeto não encontrado." }, { status: 404 });
    }

    const nomes = await buscarNomesUsuarioEEmpresa(sessao.userId);
    const resultado = await gerarMemorial(parsed.data, {
      empresaId: sessao.empresaId,
      projetoNome: projetoEncontrado.nome,
      projetoEndereco: projetoEncontrado.endereco,
      empresaNome: nomes?.empresaNome ?? "",
      usuarioNome: nomes?.usuarioNome ?? "",
    });
    return NextResponse.json({ memorial: resultado }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/memoriais]", error);
    return NextResponse.json({ error: "Erro ao gerar o memorial, tente novamente." }, { status: 500 });
  }
}
