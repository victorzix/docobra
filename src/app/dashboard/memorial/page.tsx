import type { Metadata } from "next";

import { getSessionUser } from "@/lib/auth/session";
import { listarMemoriais } from "@/db/queries/memorial";
import { listarProjetos } from "@/db/queries/projeto";
import type { PaginatedResponse } from "@/lib/pagination";
import type { MemorialResponse } from "@/lib/validations/memorial/response.schema";
import { NovoMemorialDrawer } from "./novo-memorial-drawer";
import { MemoriaisLista } from "./memoriais-lista";

export const metadata: Metadata = {
  title: "Memorial Descritivo",
};

export default async function MemorialListaPage() {
  const sessao = await getSessionUser();
  const [memoriais, projetos] = sessao
    ? await Promise.all([listarMemoriais(sessao.empresaId), listarProjetos(sessao.empresaId)])
    : [[], []];

  const dadosIniciais: PaginatedResponse<MemorialResponse> = {
    data: memoriais.map((m) => ({
      id: m.id,
      numero: m.numero,
      projetoNome: m.projetoNome,
      status: m.status,
      documentoGeradoUrl: m.documentoGeradoUrl,
      createdAt: m.createdAt.toISOString(),
    })),
    page: 1,
    total: memoriais.length,
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Memorial Descritivo</h1>
        <NovoMemorialDrawer projetos={projetos} />
      </div>
      <MemoriaisLista dadosIniciais={dadosIniciais} />
    </div>
  );
}
