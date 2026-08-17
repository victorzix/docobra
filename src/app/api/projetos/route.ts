import { NextResponse, type NextRequest } from "next/server";

import { verificarToken } from "@/lib/auth/jwt";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";
import { contarProjetos, criarProjeto, listarProjetosPaginado } from "@/db/queries/projeto";
import { criarProjetoSchema } from "@/lib/validations/projeto/create.schema";
import { listarProjetosQuerySchema } from "@/lib/validations/projeto/list.schema";
import type { ProjetoResponse } from "@/lib/validations/projeto/response.schema";
import type { CursorPaginatedResponse } from "@/lib/pagination";

export async function GET(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const sessao = token ? await verificarToken(token).catch(() => null) : null;

  if (!sessao) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const parsed = listarProjetosQuerySchema.safeParse({
    cursor: searchParams.get("cursor") ?? undefined,
    page: searchParams.get("page") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "Parâmetros inválidos." }, { status: 400 });
  }

  try {
    const [pagina, total] = await Promise.all([
      listarProjetosPaginado(sessao.empresaId, { cursor: parsed.data.cursor }),
      contarProjetos(sessao.empresaId),
    ]);

    const body: CursorPaginatedResponse<ProjetoResponse> = {
      data: pagina.itens.map((p) => ({ ...p, createdAt: p.createdAt.toISOString() })),
      page: parsed.data.page,
      total,
      nextCursor: pagina.nextCursor,
    };

    return NextResponse.json(body);
  } catch (error) {
    console.error("[GET /api/projetos]", error);
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
    const body = await request.json();
    const parsed = criarProjetoSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos.", fields: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const projeto = await criarProjeto({ ...parsed.data, empresaId: sessao.empresaId });
    return NextResponse.json({ projeto }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/projetos]", error);
    return NextResponse.json({ error: "Erro interno, tente novamente." }, { status: 500 });
  }
}
