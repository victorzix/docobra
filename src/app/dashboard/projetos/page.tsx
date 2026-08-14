import type { Metadata } from "next";
import { getSessionUser } from "@/lib/auth/session";
import { listarProjetos } from "@/db/queries/projeto";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { NovoProjetoDialog } from "./novo-projeto-dialog";

export const metadata: Metadata = {
  title: "Projetos",
};

export default async function ProjetosPage() {
  const sessao = await getSessionUser();
  const projetos = sessao ? await listarProjetos(sessao.empresaId) : [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Projetos</h1>
        <NovoProjetoDialog />
      </div>
      {projetos.length === 0 ? (
        <p className="text-muted-foreground">Nenhum projeto ainda.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {projetos.map((p) => (
            <Card key={p.id}>
              <CardHeader>
                <CardTitle>{p.nome}</CardTitle>
                {p.endereco && <CardDescription>{p.endereco}</CardDescription>}
              </CardHeader>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
