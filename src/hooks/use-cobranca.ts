import { useQuery } from "@tanstack/react-query";

import type { CobrancaResponse } from "@/lib/validations/cobranca/response.schema";

const INTERVALO_DO_POLLING_MS = 4000;

async function buscarCobranca(id: string): Promise<CobrancaResponse> {
  const response = await fetch(`/api/cobrancas/${id}`);

  if (!response.ok) {
    throw new Error("Erro ao consultar o pagamento.");
  }

  return (await response.json()).cobranca;
}

export function useCobranca(id: string | null, inicial?: CobrancaResponse) {
  return useQuery({
    queryKey: ["cobranca", id],
    queryFn: () => buscarCobranca(id as string),
    enabled: id !== null,
    initialData: inicial,
    refetchInterval: (query) => (query.state.data?.status === "pendente" ? INTERVALO_DO_POLLING_MS : false),
  });
}
