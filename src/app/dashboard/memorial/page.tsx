import type { Metadata } from "next";

import { getSessionUser } from "@/lib/auth/session";
import { listarMemoriais } from "@/db/queries/memorial";
import { listarProjetos } from "@/db/queries/projeto";
import { referenciaMemorial } from "@/lib/referencia";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { NovoMemorialDrawer } from "./novo-memorial-drawer";

export const metadata: Metadata = {
  title: "Memorial Descritivo",
};

export default async function MemorialListaPage() {
  const sessao = await getSessionUser();
  const [memoriais, projetos] = sessao
    ? await Promise.all([listarMemoriais(sessao.empresaId), listarProjetos(sessao.empresaId)])
    : [[], []];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Memorial Descritivo</h1>
        <NovoMemorialDrawer projetos={projetos} />
      </div>
      {memoriais.length === 0 ? (
        <p className="text-muted-foreground">Nenhum memorial ainda.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {memoriais.map((m) => (
            <Card key={m.id}>
              <CardHeader>
                <span className="font-mono text-xs text-muted-foreground">
                  {referenciaMemorial(m.numero)}
                </span>
                <CardTitle>{m.projetoNome}</CardTitle>
                <CardDescription>
                  {m.status === "gerado" && m.documentoGeradoUrl ? (
                    <a href={m.documentoGeradoUrl} className="underline">
                      Baixar PDF
                    </a>
                  ) : (
                    "Rascunho"
                  )}
                </CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
