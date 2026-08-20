import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { getSessionUser } from "@/lib/auth/session";
import { buscarComuniqueSeDaEmpresa } from "@/db/queries/comunique-se";
import { referenciaComuniqueSe } from "@/lib/referencia";
import { ChecklistItens } from "./checklist-itens";

export const metadata: Metadata = {
  title: "Comunique-se",
};

export default async function ComuniqueSeDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sessao = await getSessionUser();
  const comuniqueSeEncontrado = sessao ? await buscarComuniqueSeDaEmpresa(id, sessao.empresaId) : null;

  if (!comuniqueSeEncontrado) {
    notFound();
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <span className="font-mono text-xs text-muted-foreground">
          {referenciaComuniqueSe(comuniqueSeEncontrado.numero)}
        </span>
        <h1 className="text-2xl font-semibold">Checklist do Comunique-se</h1>
        <a href={comuniqueSeEncontrado.pdfOriginalUrl} className="text-sm underline">
          Baixar PDF original
        </a>
      </div>

      {comuniqueSeEncontrado.status === "processando" && (
        <p className="text-muted-foreground">Processando o Comunique-se...</p>
      )}
      {comuniqueSeEncontrado.status === "erro" && (
        <p className="text-destructive">
          Não foi possível processar esse Comunique-se. Volte pra lista e tente novamente.
        </p>
      )}
      {comuniqueSeEncontrado.status === "pronto" && comuniqueSeEncontrado.checklistJson && (
        <ChecklistItens
          comuniqueSeId={comuniqueSeEncontrado.id}
          itensIniciais={comuniqueSeEncontrado.checklistJson.itens}
        />
      )}
    </div>
  );
}
