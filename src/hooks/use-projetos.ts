import { useInfiniteQuery, type InfiniteData } from "@tanstack/react-query";

import type { ProjetoResponse } from "@/lib/validations/projeto/response.schema";
import type { CursorPaginatedResponse } from "@/lib/pagination";

export type PaginaProjetos = CursorPaginatedResponse<ProjetoResponse>;

interface ProjetosPageParam {
  cursor?: string;
  page: number;
}

async function buscarProjetos({ cursor, page }: ProjetosPageParam): Promise<PaginaProjetos> {
  const params = new URLSearchParams({ page: String(page) });
  if (cursor) params.set("cursor", cursor);

  const response = await fetch(`/api/projetos?${params.toString()}`);

  if (!response.ok) {
    throw new Error("Erro ao carregar projetos.");
  }

  return response.json();
}

export function useProjetos(paginaInicial: PaginaProjetos) {
  const initialData: InfiniteData<PaginaProjetos, ProjetosPageParam> = {
    pages: [paginaInicial],
    pageParams: [{ page: paginaInicial.page }],
  };

  return useInfiniteQuery({
    queryKey: ["projetos"],
    queryFn: ({ pageParam }) => buscarProjetos(pageParam),
    initialPageParam: { page: 1 } as ProjetosPageParam,
    getNextPageParam: (ultimaPagina) =>
      ultimaPagina.nextCursor
        ? { cursor: ultimaPagina.nextCursor, page: ultimaPagina.page + 1 }
        : undefined,
    initialData,
  });
}
