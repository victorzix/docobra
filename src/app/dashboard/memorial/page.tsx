import Link from "next/link";
import type { Metadata } from "next";

import { getSessionUser } from "@/lib/auth/session";
import { listarMemoriais } from "@/db/queries/memorial";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Memorial Descritivo",
};

export default async function MemorialListaPage() {
  const sessao = await getSessionUser();
  const memoriais = sessao ? await listarMemoriais(sessao.empresaId) : [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Memorial Descritivo</h1>
        <Link href="/dashboard/memorial/novo">
          <Button>Novo memorial</Button>
        </Link>
      </div>
      {memoriais.length === 0 ? (
        <p className="text-muted-foreground">Nenhum memorial ainda.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {memoriais.map((m) => (
            <Card key={m.id}>
              <CardHeader>
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
