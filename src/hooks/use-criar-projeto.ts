import { useMutation } from "@tanstack/react-query";

import type { CriarProjetoInput } from "@/lib/validations/projeto/create.schema";
import type { Projeto } from "@/db/queries/projeto";

interface ProjetoResponse {
  projeto: Projeto;
}

interface ApiErrorBody {
  error: string;
  fields?: Record<string, string[]>;
}

async function criarProjetoRequest(input: CriarProjetoInput): Promise<ProjetoResponse> {
  const response = await fetch("/api/projetos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  const data = (await response.json()) as ProjetoResponse | ApiErrorBody;

  if (!response.ok) {
    throw new Error((data as ApiErrorBody).error);
  }

  return data as ProjetoResponse;
}

export function useCriarProjeto() {
  return useMutation({ mutationFn: criarProjetoRequest });
}
