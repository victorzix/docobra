import { NextResponse, type NextRequest } from "next/server";

import { verificarToken } from "@/lib/auth/jwt";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";
import { buscarProjetoDaEmpresa } from "@/db/queries/projeto";
import { buscarNomesUsuarioEEmpresa } from "@/db/queries/usuario";
import { criarMemorialSchema } from "@/lib/validations/memorial/create.schema";
import { gerarMemorial } from "@/lib/memorial/gerar";

export async function POST(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const sessao = token ? await verificarToken(token).catch(() => null) : null;

  if (!sessao) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const body = await request.json();
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

  try {
    const nomes = await buscarNomesUsuarioEEmpresa(sessao.userId);
    const resultado = await gerarMemorial(parsed.data, {
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
