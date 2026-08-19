import { useQuery } from "@tanstack/react-query";

import type { PaginatedResponse } from "@/lib/pagination";
import type { MemorialResponse } from "@/lib/validations/memorial/response.schema";

async function buscarMemoriais(): Promise<PaginatedResponse<MemorialResponse>> {
  const response = await fetch("/api/memoriais");

  if (!response.ok) {
    throw new Error("Erro ao carregar memoriais.");
  }

  return response.json();
}

export function useMemoriais(dadosIniciais: PaginatedResponse<MemorialResponse>) {
  return useQuery({
    queryKey: ["memoriais"],
    queryFn: buscarMemoriais,
    initialData: dadosIniciais,
  });
}
