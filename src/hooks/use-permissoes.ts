import { useQuery } from "@tanstack/react-query";

import type { PermissaoDeUso } from "@/lib/permissoes/permissoes-de-uso";
import type { PermissaoSerializada, PermissoesDaEmpresa } from "@/lib/permissoes/permissoes-da-empresa";

async function buscarPermissoes(): Promise<PermissoesDaEmpresa> {
  const response = await fetch("/api/permissoes");

  if (!response.ok) {
    throw new Error("Erro ao carregar o uso do plano.");
  }

  return response.json();
}

export function usePermissoes(dadosIniciais?: PermissoesDaEmpresa) {
  return useQuery({
    queryKey: ["permissoes"],
    queryFn: buscarPermissoes,
    initialData: dadosIniciais,
  });
}

export function usePermissaoDeUso(
  chave: PermissaoDeUso,
  dadosIniciais?: PermissoesDaEmpresa,
): PermissaoSerializada | undefined {
  const { data } = usePermissoes(dadosIniciais);
  return data?.[chave];
}
