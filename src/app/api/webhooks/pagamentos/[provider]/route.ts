import { NextResponse, type NextRequest } from "next/server";

import { pagamentoRouter } from "@/core/payments";
import { WebhookInvalidoError, WebhookNaoAutenticadoError } from "@/core/payments/erros";
import { processarEventoPagamento } from "@/lib/pagamentos/processar-evento";

export async function POST(request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider: nomeDoProvider } = await params;

  let provider;
  try {
    provider = pagamentoRouter().provider(nomeDoProvider);
  } catch {
    return NextResponse.json({ error: "Provider desconhecido." }, { status: 404 });
  }

  const corpoCru = await request.text();

  let evento;
  try {
    evento = provider.lerWebhook(request.headers, corpoCru);
  } catch (erro) {
    if (erro instanceof WebhookNaoAutenticadoError) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }
    if (erro instanceof WebhookInvalidoError) {
      return NextResponse.json({ error: erro.message }, { status: 400 });
    }
    throw erro;
  }

  if (!evento) return NextResponse.json({ ignorado: true });

  try {
    const resultado = await processarEventoPagamento(provider.nome, evento);
    return NextResponse.json({ resultado });
  } catch (error) {
    console.error("[POST /api/webhooks/pagamentos]", error);
    // 5xx para o gateway reenviar: o evento só fica gravado se o processamento der certo.
    return NextResponse.json({ error: "Erro ao processar o evento." }, { status: 500 });
  }
}
