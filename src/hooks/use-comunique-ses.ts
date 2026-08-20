import { useQuery } from "@tanstack/react-query";

import type { PaginatedResponse } from "@/lib/pagination";
import type { ComuniqueSeResponse } from "@/lib/validations/comunique-se/response.schema";

async function buscarComuniqueSes(): Promise<PaginatedResponse<ComuniqueSeResponse>> {
  const response = await fetch("/api/comunique-se");

  if (!response.ok) {
    throw new Error("Erro ao carregar Comunique-se.");
  }

  return response.json();
}

export function useComuniqueSes(dadosIniciais: PaginatedResponse<ComuniqueSeResponse>) {
  return useQuery({
    queryKey: ["comunique-se"],
    queryFn: buscarComuniqueSes,
    initialData: dadosIniciais,
  });
}
