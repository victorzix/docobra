import type { Metadata } from "next";

import { getSessionUser } from "@/lib/auth/session";
import { listarComuniqueSe } from "@/db/queries/comunique-se";
import { listarProjetos } from "@/db/queries/projeto";
import type { PaginatedResponse } from "@/lib/pagination";
import type { ComuniqueSeResponse } from "@/lib/validations/comunique-se/response.schema";
import { NovoComuniqueSeDrawer } from "./novo-comunique-se-drawer";
import { ComuniqueSeLista } from "./comunique-se-lista";

export const metadata: Metadata = {
  title: "Comunique-se",
};

export default async function ComuniqueSePage() {
  const sessao = await getSessionUser();
  const [lista, projetos] = sessao
    ? await Promise.all([listarComuniqueSe(sessao.empresaId), listarProjetos(sessao.empresaId)])
    : [[], []];

  const dadosIniciais: PaginatedResponse<ComuniqueSeResponse> = {
    data: lista.map((c) => ({
      id: c.id,
      numero: c.numero,
      projetoNome: c.projetoNome,
      status: c.status,
      pdfOriginalUrl: c.pdfOriginalUrl,
      createdAt: c.createdAt.toISOString(),
    })),
    page: 1,
    total: lista.length,
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Comunique-se</h1>
        <NovoComuniqueSeDrawer projetos={projetos} />
      </div>
      <ComuniqueSeLista dadosIniciais={dadosIniciais} />
    </div>
  );
}
