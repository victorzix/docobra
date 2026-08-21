import { NextResponse, type NextRequest } from "next/server";

import { verificarToken } from "@/lib/auth/jwt";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";
import { buscarProjetoDaEmpresa } from "@/db/queries/projeto";
import { listarComuniqueSe } from "@/db/queries/comunique-se";
import { criarComuniqueSeSchema } from "@/lib/validations/comunique-se/create.schema";
import type { ComuniqueSeResponse } from "@/lib/validations/comunique-se/response.schema";
import type { PaginatedResponse } from "@/lib/pagination";
import { criarComuniqueSeManual, processarComuniqueSe } from "@/lib/comunique-se/processar";
import { ehPdfValido, TAMANHO_MAXIMO_PDF_BYTES } from "@/lib/comunique-se/storage";
import { CriacaoParcialError } from "@/lib/erros/criacao-parcial";

export async function GET(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const sessao = token ? await verificarToken(token).catch(() => null) : null;

  if (!sessao) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  try {
    const lista = await listarComuniqueSe(sessao.empresaId);

    const body: PaginatedResponse<ComuniqueSeResponse> = {
      data: lista.map((c) => ({
        id: c.id,
        numero: c.numero,
        projetoNome: c.projetoNome,
        status: c.status,
        pdfOriginalUrl: c.pdfOriginalUrl,
        createdAt: c.createdAt.toISOString(),
      })),
      page: 1,
      total: lista.length,
    };

    return NextResponse.json(body);
  } catch (error) {
    console.error("[GET /api/comunique-se]", error);
    return NextResponse.json({ error: "Erro interno, tente novamente." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const sessao = token ? await verificarToken(token).catch(() => null) : null;

  if (!sessao) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  }

  const parsed = criarComuniqueSeSchema.safeParse(body);
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

  try {
    if (parsed.data.modoCriacao === "manual") {
      const resultado = await criarComuniqueSeManual({
        projetoId: parsed.data.projetoId,
        empresaId: sessao.empresaId,
        itens: parsed.data.itens,
      });
      return NextResponse.json({ comuniqueSe: resultado }, { status: 201 });
    }

    const pdfBuffer = Buffer.from(parsed.data.pdfBase64, "base64");

    if (!ehPdfValido(pdfBuffer)) {
      return NextResponse.json({ error: "Arquivo não é um PDF válido." }, { status: 400 });
    }

    if (pdfBuffer.length > TAMANHO_MAXIMO_PDF_BYTES) {
      return NextResponse.json({ error: "Arquivo excede o tamanho máximo de 10MB." }, { status: 400 });
    }

    const resultado = await processarComuniqueSe({
      projetoId: parsed.data.projetoId,
      empresaId: sessao.empresaId,
      pdfBuffer,
    });
    return NextResponse.json({ comuniqueSe: resultado }, { status: 201 });
  } catch (error) {
    if (error instanceof CriacaoParcialError) {
      console.error("[POST /api/comunique-se]", error);
      return NextResponse.json(
        { error: "Erro ao processar o Comunique-se, tente novamente.", id: error.id },
        { status: 500 },
      );
    }
    console.error("[POST /api/comunique-se]", error);
    return NextResponse.json({ error: "Erro ao processar o Comunique-se, tente novamente." }, { status: 500 });
  }
}
