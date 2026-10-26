import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PlanosTela } from "@/components/planos/planos-tela";
import { getSessionUser } from "@/lib/auth/session";
import { carregarContextoDePlanos } from "@/lib/permissoes/contexto-de-planos";
import { carregarTelaDePlanos } from "@/lib/planos/carregar-tela-de-planos";

export const metadata: Metadata = {
  title: "Assinatura",
};

export default async function AssinaturaPage() {
  const sessao = await getSessionUser();
  if (!sessao) redirect("/login");

  const [dados, contexto] = await Promise.all([
    carregarTelaDePlanos(sessao.empresaId),
    carregarContextoDePlanos(sessao),
  ]);

  if (!dados) {
    return <p className="text-sm text-muted-foreground">Esta empresa ainda não tem uma assinatura. Fale com o suporte.</p>;
  }

  return <PlanosTela dados={dados} contatoSuporte={contexto.contatoSuporte} permissoes={contexto.permissoes} />;
}
