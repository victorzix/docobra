import type { Metadata } from "next";
import { FolderKanban } from "lucide-react";

import { getSessionUser } from "@/lib/auth/session";
import { contarProjetos, listarProjetosPaginado } from "@/db/queries/projeto";
import { NovoProjetoDialog } from "./novo-projeto-dialog";
import { ProjetosGrid } from "./projetos-grid";

export const metadata: Metadata = {
  title: "Projetos",
};

export default async function ProjetosPage() {
  const sessao = await getSessionUser();

  const [pagina, total] = sessao
    ? await Promise.all([listarProjetosPaginado(sessao.empresaId), contarProjetos(sessao.empresaId)])
    : [{ itens: [], nextCursor: null }, 0];

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Projetos</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {total === 0 ? "Nenhum projeto ainda." : `${total} ${total === 1 ? "projeto" : "projetos"}`}
          </p>
        </div>
        <NovoProjetoDialog />
      </div>

      {total === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
          <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <FolderKanban className="size-6" />
          </div>
          <div>
            <p className="font-medium">Nenhum projeto ainda</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Crie o primeiro projeto pra começar a gerar memoriais e checklists.
            </p>
          </div>
          <NovoProjetoDialog />
        </div>
      ) : (
        <ProjetosGrid
          paginaInicial={{
            data: pagina.itens.map((p) => ({ ...p, createdAt: p.createdAt.toISOString() })),
            page: 1,
            total,
            nextCursor: pagina.nextCursor,
          }}
        />
      )}
    </div>
  );
}
