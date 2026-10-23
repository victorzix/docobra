import { timingSafeEqual } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { gerarRenovacoes } from "@/lib/pagamentos/gerar-renovacoes";

function tokensIguais(recebido: string, esperado: string): boolean {
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo) {
    return NextResponse.json({ error: "Job não configurado." }, { status: 503 });
  }

  const cabecalho = request.headers.get("authorization") ?? "";
  const recebido = cabecalho.startsWith("Bearer ") ? cabecalho.slice("Bearer ".length) : "";
  if (!tokensIguais(recebido, segredo)) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  try {
    return NextResponse.json(await gerarRenovacoes());
  } catch (error) {
    console.error("[POST /api/cron/renovacoes]", error);
    return NextResponse.json({ error: "Erro ao gerar as renovações." }, { status: 500 });
  }
}
